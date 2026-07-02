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
        "msisdn_number",
        "mobile_no",
        "mobile_number",
        "calling_party",
        "landline_msisdn",
        "subscriber_number",
        "source_number",
        "src_number",
        "from_number",
    ],
    "b_party_ip": [
        "b_party_ip",
        "destination_ip",
        "dest_ip",
        "dest_ip_address",
        "destination_ip_address",
        "recipient_ip",
        "remote_ip",
        "ip",
        "server_ip",
        "dst_ip",
        "b_ip",
        "public_ip",
    ],
    "b_party_number": [
        "b_party_number",
        "called_number",
        "called_party",
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
        "start_date_time",
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
        "sess_duration",
    ],
    "port": ["port", "dst_port", "dest_port", "destination_port", "remote_port", "server_port"],
    "data_volume": ["data_volume", "bytes", "data_bytes", "volume", "traffic_bytes", "total_volume"],
    "session_type": ["session_type", "type", "connection_type", "service_type", "protocol"],
    "imei": ["imei", "imei_number", "device_id", "handset_imei"],
    "imsi": ["imsi", "imsi_number", "sim_id"],
    "cell_id": [
        "cell_id",
        "cell_global_id",
        "cgi",
        "first_cell_id",
        "first_cgi",
        "tower_id",
        "lac_ci",
        "location_id",
    ],
}


def normalize_msisdn(value: str) -> str:
    """Normalize Indian mobile numbers to their canonical 10-digit form.

    Handles +91 / 0091 / 91 / 0 prefixes and separators so the same subscriber
    appearing in different operator export styles aggregates as one party.
    Non-mobile values (landlines, short codes, IPs) are returned trimmed but unchanged.
    """
    text = str(value).strip()
    cleaned = text.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    digits = cleaned[1:] if cleaned.startswith("+") else cleaned
    if not digits.isdigit():
        return text
    for prefix in ("0091", "91", "0"):
        if digits.startswith(prefix) and len(digits) == len(prefix) + 10:
            candidate = digits[len(prefix):]
            # Indian mobile numbers start with 6-9
            if candidate[0] in "6789":
                return candidate
    return digits


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
    a_party = normalize_msisdn(mapped["a_party"]) if mapped["a_party"] not in (None, "") else ""
    b_party_ip = str(mapped["b_party_ip"]).strip() if mapped["b_party_ip"] not in (None, "") else ""
    b_party_number = normalize_msisdn(mapped["b_party_number"]) if mapped["b_party_number"] not in (None, "") else ""
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
        "imei": str(mapped["imei"]).strip() if mapped["imei"] not in (None, "") else "",
        "imsi": str(mapped["imsi"]).strip() if mapped["imsi"] not in (None, "") else "",
        "cell_id": str(mapped["cell_id"]).strip() if mapped["cell_id"] not in (None, "") else "",
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
                (upload_id, source_file, row_index, a_party, b_party_ip, b_party_number, timestamp, duration_sec, port, data_volume, session_type, imei, imsi, cell_id, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    record["imei"],
                    record["imsi"],
                    record["cell_id"],
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
               duration_sec, port, data_volume, session_type, imei, imsi, cell_id, raw_json
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
        return {
            "flags_by_a_party": {},
            "risk_by_a_party": {},
            "flagged_records": [],
            "top_flagged": [],
            "breakdown_by_a_party": {},
        }

    blacklist_rows = conn.execute(
        "SELECT id, target_value, target_type, label, reason FROM blacklist_entries"
    ).fetchall()
    manual_rows = conn.execute(
        "SELECT id, target_value, target_type, reason, investigator, created_at FROM manual_flags ORDER BY created_at DESC"
    ).fetchall()

    blacklist_by_value = {}
    for row in blacklist_rows:
        value = str(row["target_value"]).strip().lower()
        blacklist_by_value[value] = dict(row)
        # entries stored with +91/91/0 prefixes still match normalized records
        blacklist_by_value[normalize_msisdn(value).lower()] = dict(row)

    for record in records:
        record["dt"] = datetime.fromisoformat(record["timestamp"])
        record["b_id"] = record["b_party_ip"] or record["b_party_number"]

    by_a = defaultdict(list)
    by_b = defaultdict(list)
    for record in records:
        by_a[record["a_party"]].append(record)
        by_b[record["b_id"]].append(record)

    flags_by_a: dict[str, list[dict[str, Any]]] = defaultdict(list)
    breakdown_by_a: dict[str, list[dict[str, Any]]] = defaultdict(list)
    risk_points = defaultdict(int)

    night_start = int(settings["night_start_hour"])
    night_end = int(settings["night_end_hour"])
    night_threshold = int(settings["night_frequency_threshold"])
    short_threshold = int(settings["short_duration_threshold_sec"])
    short_repeat_threshold = int(settings["short_duration_repeat_threshold"])
    distinct_window = int(settings["distinct_window_minutes"])
    distinct_b_threshold = int(settings["distinct_b_threshold"])
    shared_b_threshold = int(settings["shared_bparty_threshold"])
    device_churn_threshold = int(settings.get("device_churn_imei_threshold") or 2)
    shared_imei_threshold = int(settings.get("shared_imei_party_threshold") or 1)

    def is_night(hour: int) -> bool:
        if night_start == night_end:
            return True
        if night_start < night_end:
            return night_start <= hour < night_end
        return hour >= night_start or hour < night_end

    def add_flag(a_party: str, flag: dict[str, Any], points: int):
        flags_by_a[a_party].append(flag)
        breakdown_by_a[a_party].append(
            {
                "rule": flag["type"],
                "label": flag.get("label", flag["type"]),
                "message": flag["message"],
                "points": points,
                "category": flag.get("category", "auto"),
            }
        )
        risk_points[a_party] += points

    for a_party, items in by_a.items():
        night_count = sum(1 for r in items if is_night(r["dt"].hour))
        if night_count > night_threshold:
            add_flag(
                a_party,
                {
                    "type": "night_activity",
                    "label": "Late-night activity exceeded threshold",
                    "message": f"{night_count} interactions between {night_start:02d}:00 and {night_end:02d}:00",
                    "severity": "medium",
                    "count": night_count,
                    "category": "auto",
                },
                3,
            )

        short_pairs = Counter(r["b_id"] for r in items if r["duration_sec"] < short_threshold)
        if short_pairs:
            top_b, top_count = short_pairs.most_common(1)[0]
            if top_count > short_repeat_threshold:
                add_flag(
                    a_party,
                    {
                        "type": "short_repeated_sessions",
                        "label": "Short-duration repeated sessions",
                        "message": f"{top_count} short sessions with {top_b}",
                        "severity": "high",
                        "count": top_count,
                        "category": "auto",
                    },
                    2,
                )

        times = sorted(r["dt"] for r in items)
        for current in times:
            end = current + timedelta(minutes=distinct_window)
            b_set = {
                r["b_id"]
                for r in items
                if current <= r["dt"] <= end
            }
            if len(b_set) > distinct_b_threshold:
                add_flag(
                    a_party,
                    {
                        "type": "many_distinct_b_parties",
                        "label": "High number of distinct B-parties",
                        "message": f"{len(b_set)} distinct B-parties within {distinct_window} minutes",
                        "severity": "high",
                        "count": len(b_set),
                        "category": "auto",
                    },
                    2,
                )
                break

    shared_b_ids = {}
    for b_id, items in by_b.items():
        distinct_a = {r["a_party"] for r in items}
        if len(distinct_a) > shared_b_threshold:
            shared_b_ids[b_id] = len(distinct_a)

    flagged_for_shared_hub = set()
    for b_id, count in shared_b_ids.items():
        for record in by_b[b_id]:
            a_party = record["a_party"]
            if (a_party, b_id) not in flagged_for_shared_hub:
                add_flag(
                    a_party,
                    {
                        "type": "shared_b_party_hub",
                        "label": "Shared B-party hub pattern",
                        "message": f"B-party {b_id} contacted by {count} different A-parties",
                        "severity": "medium",
                        "count": count,
                        "category": "auto",
                    },
                    1,
                )
                flagged_for_shared_hub.add((a_party, b_id))

    # Device-based rules — only fire when uploads include IMEI data
    imei_to_a_parties = defaultdict(set)
    for record in records:
        imei = str(record.get("imei") or "").strip()
        if imei:
            imei_to_a_parties[imei].add(record["a_party"])

    for a_party, items in by_a.items():
        imeis = {str(r.get("imei") or "").strip() for r in items} - {""}
        if len(imeis) > device_churn_threshold:
            add_flag(
                a_party,
                {
                    "type": "device_churn",
                    "label": "Number cycling multiple handsets",
                    "message": f"Used {len(imeis)} different handsets (IMEIs)",
                    "severity": "high",
                    "count": len(imeis),
                    "category": "auto",
                },
                3,
            )

    for imei, a_set in imei_to_a_parties.items():
        if len(a_set) > shared_imei_threshold:
            for a_party in a_set:
                add_flag(
                    a_party,
                    {
                        "type": "shared_imei",
                        "label": "Handset shared across multiple numbers (SIM swap)",
                        "message": f"IMEI {imei} used with {len(a_set)} different A-party numbers",
                        "severity": "high",
                        "count": len(a_set),
                        "category": "auto",
                    },
                    3,
                )

    for a_party, items in by_a.items():
        matched_entries = []
        for item in items:
            b_candidates = [item["b_party_ip"], item["b_party_number"], item["b_id"]]
            for candidate in b_candidates:
                value = str(candidate or "").strip().lower()
                if not value:
                    continue
                row = blacklist_by_value.get(value)
                if row:
                    matched_entries.append(row)
        if matched_entries:
            unique_rows = {entry["target_value"]: entry for entry in matched_entries}.values()
            for entry in unique_rows:
                add_flag(
                    a_party,
                    {
                        "type": "blacklist_match",
                        "label": "Matched blacklisted IP/number database",
                        "message": f"{entry['target_value']} matched blacklist: {entry['reason']}",
                        "severity": "high",
                        "count": 1,
                        "category": "blacklist",
                        "blacklist_reason": entry["reason"],
                    },
                    5,
                )

    manual_by_target = defaultdict(list)
    for row in manual_rows:
        value = str(row["target_value"]).strip().lower()
        manual_by_target[value].append(dict(row))
        normalized = normalize_msisdn(value).lower()
        if normalized != value:
            manual_by_target[normalized].append(dict(row))

    for a_party, items in by_a.items():
        seen_manual_ids = set()
        candidates = {a_party.lower()}
        candidates.update(str(item["b_party_ip"] or "").lower() for item in items if item["b_party_ip"])
        candidates.update(str(item["b_party_number"] or "").lower() for item in items if item["b_party_number"])
        for candidate in candidates:
            for row in manual_by_target.get(candidate, []):
                if row["id"] in seen_manual_ids:
                    continue
                seen_manual_ids.add(row["id"])
                add_flag(
                    a_party,
                    {
                        "type": "manual_flag",
                        "label": "Investigator manual flag",
                        "message": f"{row['reason']} (by {row['investigator']})",
                        "severity": "medium",
                        "count": 1,
                        "category": "manual",
                    },
                    2,
                )

    risk_by_a = {}
    for a_party, points in risk_points.items():
        categories = {item["category"] for item in breakdown_by_a.get(a_party, [])}
        level = "Low"
        if "blacklist" in categories:
            level = "High"
        elif points >= 7:
            level = "High"
        elif points >= 4:
            level = "Medium"
        risk_by_a[a_party] = {
            "score": points,
            "level": level,
            "has_blacklist_match": "blacklist" in categories,
            "has_manual_flag": "manual" in categories,
            "has_auto_flag": "auto" in categories,
        }

    flagged_records = []
    for record in records:
        risk = risk_by_a.get(
            record["a_party"],
            {"score": 0, "level": "Low", "has_blacklist_match": False, "has_manual_flag": False, "has_auto_flag": False},
        )
        if risk["score"] > 0:
            flagged_records.append(
                {
                    **record,
                    "risk": risk,
                    "flags": flags_by_a.get(record["a_party"], []),
                    "breakdown": breakdown_by_a.get(record["a_party"], []),
                }
            )

    top_flagged = sorted(
        [
            {
                "a_party": a_party,
                "risk_score": risk_by_a[a_party]["score"],
                "risk_level": risk_by_a[a_party]["level"],
                "flags": flags_by_a[a_party],
                "breakdown": breakdown_by_a.get(a_party, []),
                "has_blacklist_match": risk_by_a[a_party]["has_blacklist_match"],
                "has_manual_flag": risk_by_a[a_party]["has_manual_flag"],
                "has_auto_flag": risk_by_a[a_party]["has_auto_flag"],
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
        "breakdown_by_a_party": dict(breakdown_by_a),
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


def build_device_profile(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize distinct IMEIs, IMSIs and cell towers seen for a set of records."""

    def collect(field: str) -> list[dict[str, Any]]:
        seen: dict[str, dict[str, Any]] = {}
        for record in records:
            value = str(record.get(field) or "").strip()
            if not value:
                continue
            entry = seen.setdefault(
                value,
                {"value": value, "count": 0, "first_seen": record["timestamp"], "last_seen": record["timestamp"]},
            )
            entry["count"] += 1
            entry["first_seen"] = min(entry["first_seen"], record["timestamp"])
            entry["last_seen"] = max(entry["last_seen"], record["timestamp"])
        return sorted(seen.values(), key=lambda item: item["count"], reverse=True)

    return {
        "imeis": collect("imei"),
        "imsis": collect("imsi"),
        "cell_ids": collect("cell_id"),
    }


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
            str(record.get(field) or "").lower()
            for field in ("a_party", "b_party_ip", "b_party_number", "session_type", "port", "imei", "imsi", "cell_id")
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
    # normalize +91/91/0-prefixed queries so they match stored 10-digit parties
    q = f"%{normalize_msisdn(query).lower()}%"
    rows = conn.execute(
        """
        SELECT * FROM records
        WHERE lower(a_party) LIKE ? OR lower(b_party_ip) LIKE ? OR lower(b_party_number) LIKE ?
           OR lower(COALESCE(imei, '')) LIKE ? OR lower(COALESCE(imsi, '')) LIKE ? OR lower(COALESCE(cell_id, '')) LIKE ?
        ORDER BY timestamp DESC
        """,
        (q, q, q, q, q, q),
    ).fetchall()
    return [dict(row) for row in rows]
