import csv
import io
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from .config import DEFAULT_SETTINGS
from .db import get_setting, parse_datetime


ALIASES = {
    "a_party": [
        "a_party",
        "a_party_number",
        "aparty",
        "calling_number",
        "caller_id",
        "caller",
        "caller_number",
        "msisdn",
        "source_number",
        "src_number",
        "from_number",
    ],
    "b_party_ip": [
        "b_party_ip",
        "destination_ip",
        "dest_ip",
        "recipient_ip",
        "remote_ip",
        "ip",
        "server_ip",
        "dst_ip",
        "b_ip",
    ],
    "b_party_number": [
        "b_party_number",
        "called_number",
        "destination_number",
        "dest_number",
        "callee",
        "recipient_number",
        "to_number",
    ],
    "timestamp": [
        "timestamp",
        "datetime",
        "date_time",
        "event_time",
        "call_time",
        "start_time",
        "session_start",
        "time",
    ],
    "duration_sec": [
        "duration_sec",
        "duration",
        "call_duration",
        "seconds",
        "elapsed",
        "session_duration",
    ],
    "port": ["port", "dst_port", "destination_port", "remote_port", "server_port"],
    "data_volume": ["data_volume", "bytes", "data_bytes", "volume", "traffic_bytes"],
    "session_type": ["session_type", "type", "connection_type", "service_type", "protocol"],
}


def normalize_key(value: Any) -> str:
    return str(value).strip().lower().replace(" ", "_").replace("-", "_")


def detect_delimiter(sample: str) -> str:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",\t|;").delimiter
    except Exception:
        return ","


def load_rows_from_upload(file_name: str, content: bytes) -> tuple[list[dict[str, Any]], str]:
    suffix = Path(file_name).suffix.lower()
    if suffix == ".json":
        data = json.loads(content.decode("utf-8", errors="ignore"))
        if isinstance(data, dict):
            for key in ("records", "data", "rows", "items"):
                if key in data and isinstance(data[key], list):
                    data = data[key]
                    break
        if not isinstance(data, list):
            raise ValueError("JSON upload must be an array or contain a records list")
        return [dict(item) for item in data], "json"

    text = content.decode("utf-8", errors="ignore")
    delimiter = detect_delimiter(text[:2048]) if suffix in {".csv", ".txt"} else ","
    frame = pd.read_csv(
        io.StringIO(text),
        sep=delimiter,
        dtype=str,
        engine="python",
        on_bad_lines="skip",
    ).fillna("")
    return frame.to_dict(orient="records"), "csv"


def normalize_record(raw: dict[str, Any]) -> dict[str, Any]:
    normalized = {normalize_key(k): v for k, v in raw.items()}
    mapped = {}
    for field, aliases in ALIASES.items():
        value = None
        for alias in aliases:
            if alias in normalized and normalized[alias] not in (None, ""):
                value = normalized[alias]
                break
        mapped[field] = value

    timestamp = parse_datetime(mapped["timestamp"])
    a_party = str(mapped["a_party"]).strip() if mapped["a_party"] not in (None, "") else ""
    b_party_ip = str(mapped["b_party_ip"]).strip() if mapped["b_party_ip"] not in (None, "") else ""
    b_party_number = str(mapped["b_party_number"]).strip() if mapped["b_party_number"] not in (None, "") else ""
    duration_raw = mapped["duration_sec"]
    data_volume_raw = mapped["data_volume"]

    if duration_raw in (None, ""):
        duration = 0.0
    else:
        duration = float(str(duration_raw).replace(",", "").strip())

    data_volume = None
    if data_volume_raw not in (None, ""):
        data_volume = float(str(data_volume_raw).replace(",", "").strip())

    if not a_party or not timestamp:
        raise ValueError("Missing required fields")
    if not b_party_ip and not b_party_number:
        raise ValueError("Missing B-party identifier")

    return {
        "a_party": a_party,
        "b_party_ip": b_party_ip,
        "b_party_number": b_party_number,
        "timestamp": timestamp,
        "duration_sec": duration,
        "port": str(mapped["port"]).strip() if mapped["port"] not in (None, "") else "",
        "data_volume": data_volume,
        "session_type": str(mapped["session_type"]).strip() if mapped["session_type"] not in (None, "") else "unknown",
        "raw_json": json.dumps(raw, ensure_ascii=False),
    }


def import_records(conn, filename: str, rows: list[dict[str, Any]], file_type: str):
    cur = conn.execute(
        "INSERT INTO uploads (filename, file_type, total_rows) VALUES (?, ?, ?)",
        (filename, file_type, len(rows)),
    )
    upload_id = cur.lastrowid
    valid_rows = 0
    errors = []
    date_values = []

    for idx, raw in enumerate(rows, start=1):
        try:
            record = normalize_record(raw)
            date_values.append(record["timestamp"])
            conn.execute(
                """
                INSERT INTO records
                (upload_id, source_file, row_index, a_party, b_party_ip, b_party_number, timestamp, duration_sec, port, data_volume, session_type, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    upload_id,
                    filename,
                    idx,
                    record["a_party"],
                    record["b_party_ip"],
                    record["b_party_number"],
                    record["timestamp"],
                    record["duration_sec"],
                    record["port"],
                    record["data_volume"],
                    record["session_type"],
                    record["raw_json"],
                ),
            )
            valid_rows += 1
        except Exception as exc:
            errors.append({"row_index": idx, "message": str(exc), "raw": raw})
            conn.execute(
                "INSERT INTO parse_errors (upload_id, row_index, message, raw_json) VALUES (?, ?, ?, ?)",
                (upload_id, idx, str(exc), json.dumps(raw, ensure_ascii=False)),
            )

    date_min = min(date_values) if date_values else None
    date_max = max(date_values) if date_values else None
    conn.execute(
        """
        UPDATE uploads
        SET valid_rows = ?, error_rows = ?, date_min = ?, date_max = ?
        WHERE id = ?
        """,
        (valid_rows, len(errors), date_min, date_max, upload_id),
    )
    return upload_id, errors


def fetch_all_records(conn):
    return conn.execute(
        """
        SELECT id, upload_id, source_file, row_index, a_party, b_party_ip, b_party_number, timestamp,
               duration_sec, port, data_volume, session_type, raw_json
        FROM records
        ORDER BY timestamp DESC, id DESC
        """
    ).fetchall()


def _bucket_timestamp(dt: datetime, minutes: int) -> datetime:
    minutes = max(minutes, 1)
    bucket = (dt.minute // minutes) * minutes
    return dt.replace(minute=bucket, second=0, microsecond=0)


def compute_flags(conn) -> dict[str, Any]:
    settings = {
        key: get_setting(conn, key, default)
        for key, default in DEFAULT_SETTINGS.items()
    }
    records = [dict(r) for r in fetch_all_records(conn)]
    if not records:
        return {"flags_by_a_party": {}, "risk_by_a_party": {}, "flagged_records": [], "top_flagged": []}

    for record in records:
        record["dt"] = datetime.fromisoformat(record["timestamp"])
        record["b_id"] = record["b_party_ip"] or record["b_party_number"]

    by_a = defaultdict(list)
    by_b = defaultdict(list)
    for record in records:
        by_a[record["a_party"]].append(record)
        by_b[record["b_id"]].append(record)

    flags_by_a: dict[str, list[dict[str, Any]]] = defaultdict(list)
    risk_points = defaultdict(int)

    night_start = int(settings["night_start_hour"])
    night_end = int(settings["night_end_hour"])
    night_threshold = int(settings["night_frequency_threshold"])
    short_threshold = int(settings["short_duration_threshold_sec"])
    short_repeat_threshold = int(settings["short_duration_repeat_threshold"])
    distinct_window = int(settings["distinct_window_minutes"])
    distinct_b_threshold = int(settings["distinct_b_threshold"])
    shared_b_threshold = int(settings["shared_bparty_threshold"])

    def is_night(hour: int) -> bool:
        if night_start == night_end:
            return True
        if night_start < night_end:
            return night_start <= hour < night_end
        return hour >= night_start or hour < night_end

    for a_party, items in by_a.items():
        night_count = sum(1 for r in items if is_night(r["dt"].hour))
        if night_count > night_threshold:
            flags_by_a[a_party].append(
                {
                    "type": "night_activity",
                    "message": f"{night_count} interactions between {night_start:02d}:00 and {night_end:02d}:00",
                    "severity": "medium",
                    "count": night_count,
                }
            )
            risk_points[a_party] += 1

        short_pairs = Counter(r["b_id"] for r in items if r["duration_sec"] < short_threshold)
        if short_pairs:
            top_b, top_count = short_pairs.most_common(1)[0]
            if top_count > short_repeat_threshold:
                flags_by_a[a_party].append(
                    {
                        "type": "short_repeated_sessions",
                        "message": f"{top_count} short sessions with {top_b}",
                        "severity": "high",
                        "count": top_count,
                    }
                )
                risk_points[a_party] += 2

        times = sorted(r["dt"] for r in items)
        distinct_problem = False
        for index, current in enumerate(times):
            end = current + timedelta(minutes=distinct_window)
            b_set = {
                r["b_id"]
                for r in items
                if current <= r["dt"] <= end
            }
            if len(b_set) > distinct_b_threshold:
                distinct_problem = True
                flags_by_a[a_party].append(
                    {
                        "type": "many_distinct_b_parties",
                        "message": f"{len(b_set)} distinct B-parties within {distinct_window} minutes",
                        "severity": "high",
                        "count": len(b_set),
                    }
                )
                risk_points[a_party] += 2
                break
        if distinct_problem:
            continue

    shared_b_ids = {}
    for b_id, items in by_b.items():
        distinct_a = {r["a_party"] for r in items}
        if len(distinct_a) > shared_b_threshold:
            shared_b_ids[b_id] = len(distinct_a)

    for b_id, count in shared_b_ids.items():
        for record in by_b[b_id]:
            flags_by_a[record["a_party"]].append(
                {
                    "type": "shared_b_party_hub",
                    "message": f"B-party {b_id} contacted by {count} different A-parties",
                    "severity": "medium",
                    "count": count,
                }
            )
            risk_points[record["a_party"]] += 1

    risk_by_a = {}
    for a_party, points in risk_points.items():
        level = "Low"
        if points >= 4:
            level = "High"
        elif points >= 2:
            level = "Medium"
        risk_by_a[a_party] = {"score": points, "level": level}

    flagged_records = []
    for record in records:
        risk = risk_by_a.get(record["a_party"], {"score": 0, "level": "Low"})
        if risk["score"] > 0:
            flagged_records.append({**record, "risk": risk, "flags": flags_by_a.get(record["a_party"], [])})

    top_flagged = sorted(
        [
            {
                "a_party": a_party,
                "risk_score": risk_by_a[a_party]["score"],
                "risk_level": risk_by_a[a_party]["level"],
                "flags": flags_by_a[a_party],
                "interaction_count": len(by_a[a_party]),
                "distinct_b_parties": len({r["b_id"] for r in by_a[a_party]}),
            }
            for a_party in risk_by_a
        ],
        key=lambda x: (x["risk_score"], x["interaction_count"]),
        reverse=True,
    )

    return {
        "flags_by_a_party": dict(flags_by_a),
        "risk_by_a_party": risk_by_a,
        "flagged_records": flagged_records,
        "top_flagged": top_flagged,
    }


def aggregate_interactions(rows):
    grouped = defaultdict(list)
    for row in rows:
        key = (row["a_party"], row["b_party_ip"], row["b_party_number"])
        grouped[key].append(row)

    results = []
    for (a_party, b_ip, b_num), items in grouped.items():
        first_seen = min(item["timestamp"] for item in items)
        last_seen = max(item["timestamp"] for item in items)
        results.append(
            {
                "a_party": a_party,
                "b_party_ip": b_ip,
                "b_party_number": b_num,
                "interaction_count": len(items),
                "total_duration_sec": round(sum(float(item["duration_sec"] or 0) for item in items), 2),
                "first_seen": first_seen,
                "last_seen": last_seen,
                "session_types": sorted({item["session_type"] for item in items if item["session_type"]}),
            }
        )
    return results


def is_relevant_record(record: dict[str, Any]) -> bool:
    b_id = (record.get("b_party_ip") or "").strip() or (record.get("b_party_number") or "").strip()
    if not b_id:
        return False
    duration = float(record.get("duration_sec") or 0)
    if duration <= 0:
        return False
    noise_session_types = {"heartbeat", "keepalive", "probe", "healthcheck", "background_sync"}
    session_type = str(record.get("session_type") or "").strip().lower()
    if session_type in noise_session_types:
        return False
    return True


def record_matches_filters(record, filters):
    start_dt = parse_datetime(filters.get("start_date")) if filters.get("start_date") else None
    end_dt = parse_datetime(filters.get("end_date")) if filters.get("end_date") else None
    if filters.get("query"):
        q = filters["query"].lower()
        hay = " ".join(
            str(record.get(field, "")).lower()
            for field in ("a_party", "b_party_ip", "b_party_number", "session_type", "port")
        )
        if q not in hay:
            return False
    if start_dt and record["timestamp"] < start_dt:
        return False
    if end_dt and record["timestamp"] > end_dt:
        return False
    if filters.get("session_type") and record["session_type"].lower() != filters["session_type"].lower():
        return False
    if filters.get("min_duration") is not None and float(record["duration_sec"] or 0) < float(filters["min_duration"]):
        return False
    if filters.get("max_duration") is not None and float(record["duration_sec"] or 0) > float(filters["max_duration"]):
        return False
    return True


def build_network(records, flags, limit):
    nodes = {}
    edges = []
    edge_counts = Counter()
    for record in records[:limit]:
        a = record["a_party"]
        b = record["b_party_ip"] or record["b_party_number"]
        if not a or not b:
            continue
        nodes.setdefault(a, {"id": a, "label": a, "type": "a", "flagged": a in flags})
        nodes.setdefault(b, {"id": b, "label": b, "type": "b", "flagged": False})
        edge_counts[(a, b)] += 1

    for (a, b), count in edge_counts.items():
        edges.append({"source": a, "target": b, "weight": count})
    return {"nodes": list(nodes.values()), "edges": edges}


def parse_investigation_rows(conn, query: str):
    q = f"%{query.lower()}%"
    rows = conn.execute(
        """
        SELECT * FROM records
        WHERE lower(a_party) LIKE ? OR lower(b_party_ip) LIKE ? OR lower(b_party_number) LIKE ?
        ORDER BY timestamp DESC
        """,
        (q, q, q),
    ).fetchall()
    return [dict(row) for row in rows]
