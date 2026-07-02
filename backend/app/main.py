import csv
import io
import json
from datetime import datetime, timedelta

import jwt
from fastapi import Body, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from reportlab.graphics.shapes import Circle, Drawing, Line, String

from .config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, CORS_ORIGINS, SAMPLE_DATA_PATH, SECRET_KEY
from .db import connect, initialize_db, iso_now, transaction
from .schemas import LoginRequest, SettingsPayload, TokenResponse, UploadSummary
from .services import (
    aggregate_interactions,
    build_device_profile,
    build_network,
    compute_flags,
    fetch_all_records,
    import_records,
    is_relevant_record,
    load_rows_from_upload,
    parse_investigation_rows,
    record_matches_filters,
)


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
auth_scheme = HTTPBearer()
app = FastAPI(title="IPDR Insight API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def create_token(username: str) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload["sub"]
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


@app.on_event("startup")
def startup():
    initialize_db()
    with transaction() as conn:
        count = conn.execute("SELECT COUNT(*) AS c FROM records").fetchone()["c"]
        if count == 0 and SAMPLE_DATA_PATH.exists():
            rows, file_type = load_rows_from_upload(SAMPLE_DATA_PATH.name, SAMPLE_DATA_PATH.read_bytes())
            import_records(conn, SAMPLE_DATA_PATH.name, rows, file_type)


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": iso_now()}


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    with connect() as conn:
        row = conn.execute("SELECT username, password_hash FROM users WHERE username = ?", (payload.username,)).fetchone()
        if not row or not pwd_context.verify(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_token(payload.username), username=payload.username)


@app.get("/auth/me")
def me(user=Depends(get_current_user)):
    return {"username": user}


@app.post("/upload", response_model=UploadSummary)
async def upload(file: UploadFile = File(...), user=Depends(get_current_user)):
    content = await file.read()
    try:
        rows, file_type = load_rows_from_upload(file.filename, content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    with transaction() as conn:
        upload_id, errors = import_records(conn, file.filename, rows, file_type)
        upload_row = conn.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,)).fetchone()
    return UploadSummary(
        upload_id=upload_id,
        filename=upload_row["filename"],
        file_type=upload_row["file_type"],
        total_rows=upload_row["total_rows"],
        valid_rows=upload_row["valid_rows"],
        error_rows=upload_row["error_rows"],
        date_min=upload_row["date_min"],
        date_max=upload_row["date_max"],
        errors=errors[:20],
    )


@app.get("/dashboard/summary")
def dashboard_summary(user=Depends(get_current_user)):
    with connect() as conn:
        records = [dict(r) for r in fetch_all_records(conn)]
        flags = compute_flags(conn)
    unique_a = len({r["a_party"] for r in records})
    unique_b = len({(r["b_party_ip"] or r["b_party_number"]) for r in records if (r["b_party_ip"] or r["b_party_number"])})
    flagged = len(flags["risk_by_a_party"])
    return {
        "total_records": len(records),
        "unique_a_parties": unique_a,
        "unique_b_parties": unique_b,
        "flagged_parties": flagged,
        "risk_counts": {
            "low": sum(1 for v in flags["risk_by_a_party"].values() if v["level"] == "Low"),
            "medium": sum(1 for v in flags["risk_by_a_party"].values() if v["level"] == "Medium"),
            "high": sum(1 for v in flags["risk_by_a_party"].values() if v["level"] == "High"),
        },
    }


@app.get("/dashboard/network")
def dashboard_network(limit: int = 200, user=Depends(get_current_user)):
    with connect() as conn:
        records = [dict(r) for r in fetch_all_records(conn)]
        flags = compute_flags(conn)
    return build_network(records, set(flags["risk_by_a_party"].keys()), limit)


@app.get("/dashboard/timeline")
def dashboard_timeline(granularity: str = "day", user=Depends(get_current_user)):
    with connect() as conn:
        rows = [dict(r) for r in fetch_all_records(conn)]
    buckets = {}
    for row in rows:
        dt = datetime.fromisoformat(row["timestamp"])
        key = dt.strftime("%Y-%m-%d" if granularity == "day" else "%Y-%m-%d %H:00")
        buckets[key] = buckets.get(key, 0) + 1
    return [{"period": k, "count": v} for k, v in sorted(buckets.items())]


@app.get("/flags/top")
def top_flagged(user=Depends(get_current_user)):
    with connect() as conn:
        flags = compute_flags(conn)
    return flags["top_flagged"]


@app.get("/flags/top/filter")
def top_flagged_filtered(flag_source: str = "all", user=Depends(get_current_user)):
    with connect() as conn:
        flags = compute_flags(conn)["top_flagged"]
    source = flag_source.lower()
    if source == "auto":
        flags = [row for row in flags if row.get("has_auto_flag")]
    elif source == "manual":
        flags = [row for row in flags if row.get("has_manual_flag")]
    elif source in {"blacklist", "blacklist_match"}:
        flags = [row for row in flags if row.get("has_blacklist_match")]
    return flags


@app.get("/records/search")
def search_records(
    query: str | None = None,
    page: int = 1,
    page_size: int = 25,
    sort_by: str = "timestamp",
    sort_dir: str = "desc",
    start_date: str | None = None,
    end_date: str | None = None,
    min_duration: float | None = None,
    max_duration: float | None = None,
    session_type: str | None = None,
    relevant_only: bool = False,
    flagged_only: bool = False,
    user=Depends(get_current_user),
):
    with connect() as conn:
        records = [dict(r) for r in fetch_all_records(conn)]
        flags = compute_flags(conn)

    filters = {
        "query": query,
        "start_date": start_date,
        "end_date": end_date,
        "min_duration": min_duration,
        "max_duration": max_duration,
        "session_type": session_type,
    }
    filtered = [r for r in records if record_matches_filters(r, filters)]
    if relevant_only:
        filtered = [r for r in filtered if is_relevant_record(r)]
    if flagged_only:
        filtered = [r for r in filtered if r["a_party"] in flags["risk_by_a_party"]]

    for r in filtered:
        risk = flags["risk_by_a_party"].get(r["a_party"], {"score": 0, "level": "Low"})
        r["risk"] = risk
        r["flags"] = flags["flags_by_a_party"].get(r["a_party"], [])
        r["breakdown"] = flags["breakdown_by_a_party"].get(r["a_party"], [])

    reverse = sort_dir.lower() != "asc"
    filtered.sort(key=lambda x: x.get(sort_by) or "", reverse=reverse)
    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "items": filtered[start:end],
        "total": total,
        "page": page,
        "page_size": page_size,
        "flags": flags["risk_by_a_party"],
    }


@app.get("/interactions")
def interactions(
    query: str | None = None,
    a_party: str | None = None,
    b_party: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    min_duration: float | None = None,
    max_duration: float | None = None,
    session_type: str | None = None,
    relevant_only: bool = False,
    flagged_only: bool = False,
    page: int = 1,
    page_size: int = 25,
    sort_by: str = "interaction_count",
    sort_dir: str = "desc",
    user=Depends(get_current_user),
):
    with connect() as conn:
        rows = [dict(r) for r in fetch_all_records(conn)]
        flags = compute_flags(conn)
    filters = {
        "query": query,
        "start_date": start_date,
        "end_date": end_date,
        "min_duration": min_duration,
        "max_duration": max_duration,
        "session_type": session_type,
    }
    rows = [r for r in rows if record_matches_filters(r, filters)]
    if relevant_only:
        rows = [r for r in rows if is_relevant_record(r)]
    if a_party:
        rows = [r for r in rows if r["a_party"] == a_party]
    if b_party:
        rows = [r for r in rows if (r["b_party_ip"] or r["b_party_number"]) == b_party]
    if flagged_only:
        rows = [r for r in rows if r["a_party"] in flags["risk_by_a_party"]]
    aggregated = aggregate_interactions(rows)
    for item in aggregated:
        item["risk"] = flags["risk_by_a_party"].get(item["a_party"], {"score": 0, "level": "Low"})
        item["flags"] = flags["flags_by_a_party"].get(item["a_party"], [])
        item["breakdown"] = flags["breakdown_by_a_party"].get(item["a_party"], [])
    reverse = sort_dir.lower() != "asc"
    aggregated.sort(key=lambda x: x.get(sort_by) or 0, reverse=reverse)
    total = len(aggregated)
    start = (page - 1) * page_size
    return {"items": aggregated[start : start + page_size], "total": total, "page": page, "page_size": page_size}


@app.get("/settings")
def get_settings(user=Depends(get_current_user)):
    with connect() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    return {row["key"]: json.loads(row["value"]) for row in rows}


@app.put("/settings")
def update_settings(payload: SettingsPayload, user=Depends(get_current_user)):
    with transaction() as conn:
        for key, value in payload.model_dump().items():
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, json.dumps(value)),
            )
    return payload.model_dump()


@app.get("/blacklist")
def get_blacklist(user=Depends(get_current_user)):
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, target_value, target_type, label, reason, created_at FROM blacklist_entries ORDER BY created_at DESC, id DESC"
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/blacklist")
def add_blacklist_entry(payload: dict = Body(...), user=Depends(get_current_user)):
    target_value = str(payload.get("target_value") or "").strip()
    target_type = str(payload.get("target_type") or "").strip().lower() or "ip"
    label = str(payload.get("label") or "").strip()
    reason = str(payload.get("reason") or "").strip()
    if not target_value or not label or not reason:
        raise HTTPException(status_code=400, detail="target_value, label and reason are required")
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO blacklist_entries (target_value, target_type, label, reason)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(target_value) DO UPDATE SET
                target_type = excluded.target_type,
                label = excluded.label,
                reason = excluded.reason
            """,
            (target_value, target_type, label, reason),
        )
    return {"ok": True}


@app.delete("/blacklist/{entry_id}")
def delete_blacklist_entry(entry_id: int, user=Depends(get_current_user)):
    with transaction() as conn:
        conn.execute("DELETE FROM blacklist_entries WHERE id = ?", (entry_id,))
    return {"ok": True}


@app.get("/manual-flags")
def get_manual_flags(user=Depends(get_current_user)):
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, target_value, target_type, reason, investigator, created_at FROM manual_flags ORDER BY created_at DESC, id DESC"
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/manual-flags")
def add_manual_flag(payload: dict = Body(...), user=Depends(get_current_user)):
    target_value = str(payload.get("target_value") or "").strip()
    target_type = str(payload.get("target_type") or "").strip() or "a_party"
    reason = str(payload.get("reason") or "").strip()
    investigator = str(payload.get("investigator") or user).strip() or user
    if not target_value or not reason:
        raise HTTPException(status_code=400, detail="target_value and reason are required")
    with transaction() as conn:
        conn.execute(
            "INSERT INTO manual_flags (target_value, target_type, reason, investigator) VALUES (?, ?, ?, ?)",
            (target_value, target_type, reason, investigator),
        )
    return {"ok": True}


def _case_overview(conn, case_row):
    case_id = case_row["id"]
    party_count = conn.execute("SELECT COUNT(*) AS c FROM case_parties WHERE case_id = ?", (case_id,)).fetchone()["c"]
    updated = conn.execute(
        """
        SELECT MAX(ts) AS latest FROM (
            SELECT updated_at AS ts FROM cases WHERE id = ?
            UNION ALL
            SELECT created_at AS ts FROM case_notes WHERE case_id = ?
            UNION ALL
            SELECT created_at AS ts FROM case_parties WHERE case_id = ?
        )
        """,
        (case_id, case_id, case_id),
    ).fetchone()["latest"]
    return {
        "id": case_id,
        "name": case_row["name"],
        "description": case_row["description"],
        "status": case_row["status"],
        "created_at": case_row["created_at"],
        "updated_at": updated or case_row["updated_at"],
        "linked_parties": party_count,
    }


@app.get("/cases")
def list_cases(user=Depends(get_current_user)):
    with connect() as conn:
        rows = conn.execute("SELECT * FROM cases ORDER BY updated_at DESC, id DESC").fetchall()
        return [_case_overview(conn, row) for row in rows]


@app.post("/cases")
def create_case(payload: dict = Body(...), user=Depends(get_current_user)):
    name = str(payload.get("name") or "").strip()
    description = str(payload.get("description") or "").strip()
    status = str(payload.get("status") or "Open").strip() or "Open"
    if not name:
        raise HTTPException(status_code=400, detail="Case name is required")
    with transaction() as conn:
        cur = conn.execute(
            "INSERT INTO cases (name, description, status, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            (name, description, status),
        )
        case_id = cur.lastrowid
        row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        return _case_overview(conn, row)


@app.put("/cases/{case_id}")
def update_case(case_id: int, payload: dict = Body(...), user=Depends(get_current_user)):
    fields = {
        "name": payload.get("name"),
        "description": payload.get("description"),
        "status": payload.get("status"),
    }
    updates = []
    values = []
    for key, value in fields.items():
        if value is not None:
            updates.append(f"{key} = ?")
            values.append(str(value).strip())
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    with transaction() as conn:
        conn.execute(
            f"UPDATE cases SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (*values, case_id),
        )
        row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found")
        return _case_overview(conn, row)


@app.post("/cases/{case_id}/parties")
def add_case_party(case_id: int, payload: dict = Body(...), user=Depends(get_current_user)):
    party_value = str(payload.get("party_value") or "").strip()
    party_type = str(payload.get("party_type") or "identifier").strip()
    if not party_value:
        raise HTTPException(status_code=400, detail="party_value is required")
    with transaction() as conn:
        case_exists = conn.execute("SELECT id FROM cases WHERE id = ?", (case_id,)).fetchone()
        if not case_exists:
            raise HTTPException(status_code=404, detail="Case not found")
        conn.execute(
            "INSERT OR IGNORE INTO case_parties (case_id, party_value, party_type) VALUES (?, ?, ?)",
            (case_id, party_value, party_type),
        )
        conn.execute("UPDATE cases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (case_id,))
    return {"ok": True}


@app.delete("/cases/{case_id}/parties/{party_id}")
def remove_case_party(case_id: int, party_id: int, user=Depends(get_current_user)):
    with transaction() as conn:
        conn.execute("DELETE FROM case_parties WHERE id = ? AND case_id = ?", (party_id, case_id))
        conn.execute("UPDATE cases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (case_id,))
    return {"ok": True}


@app.get("/cases/{case_id}")
def get_case_detail(case_id: int, user=Depends(get_current_user)):
    with connect() as conn:
        case_row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        if not case_row:
            raise HTTPException(status_code=404, detail="Case not found")
        parties = [dict(row) for row in conn.execute(
            "SELECT id, case_id, party_value, party_type, created_at FROM case_parties WHERE case_id = ? ORDER BY created_at DESC, id DESC",
            (case_id,),
        ).fetchall()]
        notes = [dict(row) for row in conn.execute(
            "SELECT id, case_id, note, created_by, created_at FROM case_notes WHERE case_id = ? ORDER BY created_at DESC, id DESC",
            (case_id,),
        ).fetchall()]
        flags = compute_flags(conn)
        risk_by_a = flags["risk_by_a_party"]
        mapped_parties = []
        for party in parties:
            value = party["party_value"]
            risk = risk_by_a.get(value, {"score": 0, "level": "Low", "has_blacklist_match": False, "has_manual_flag": False, "has_auto_flag": False})
            mapped_parties.append(
                {
                    **party,
                    "risk": risk,
                    "flags": flags["flags_by_a_party"].get(value, []),
                    "breakdown": flags["breakdown_by_a_party"].get(value, []),
                }
            )
        overview = _case_overview(conn, case_row)
    return {
        "case": overview,
        "parties": mapped_parties,
        "notes": notes,
    }


@app.get("/cases/{case_id}/network")
def case_network(case_id: int, user=Depends(get_current_user)):
    with connect() as conn:
        party_rows = conn.execute("SELECT party_value FROM case_parties WHERE case_id = ?", (case_id,)).fetchall()
        party_values = {row["party_value"] for row in party_rows}
        if not party_values:
            return {"nodes": [], "edges": []}
        rows = [dict(row) for row in fetch_all_records(conn)]
        subset = [
            row
            for row in rows
            if row["a_party"] in party_values
            or (row["b_party_ip"] and row["b_party_ip"] in party_values)
            or (row["b_party_number"] and row["b_party_number"] in party_values)
        ]
        flags = compute_flags(conn)
        network = build_network(subset, set(flags["risk_by_a_party"].keys()), 500)
    return network


@app.post("/cases/{case_id}/notes")
def add_case_note(case_id: int, payload: dict = Body(...), user=Depends(get_current_user)):
    note = str(payload.get("note") or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="note is required")
    with transaction() as conn:
        case_exists = conn.execute("SELECT id FROM cases WHERE id = ?", (case_id,)).fetchone()
        if not case_exists:
            raise HTTPException(status_code=404, detail="Case not found")
        conn.execute(
            "INSERT INTO case_notes (case_id, note, created_by) VALUES (?, ?, ?)",
            (case_id, note, user),
        )
        conn.execute("UPDATE cases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (case_id,))
    return {"ok": True}


@app.post("/cases/quick-add")
def quick_add_to_case(payload: dict = Body(...), user=Depends(get_current_user)):
    party_value = str(payload.get("party_value") or "").strip()
    party_type = str(payload.get("party_type") or "identifier").strip()
    if not party_value:
        raise HTTPException(status_code=400, detail="party_value is required")
    case_id = payload.get("case_id")
    with transaction() as conn:
        if case_id is None:
            name = str(payload.get("new_case_name") or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="Provide case_id or new_case_name")
            description = str(payload.get("new_case_description") or "").strip()
            status = str(payload.get("new_case_status") or "Open").strip() or "Open"
            cur = conn.execute(
                "INSERT INTO cases (name, description, status, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                (name, description, status),
            )
            case_id = cur.lastrowid
        conn.execute(
            "INSERT OR IGNORE INTO case_parties (case_id, party_value, party_type) VALUES (?, ?, ?)",
            (int(case_id), party_value, party_type),
        )
        conn.execute("UPDATE cases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (int(case_id),))
    return {"ok": True, "case_id": int(case_id)}


@app.get("/investigation/{query}")
def investigation(query: str, user=Depends(get_current_user)):
    with connect() as conn:
        records = parse_investigation_rows(conn, query)
        flags = compute_flags(conn)
    if not records:
        raise HTTPException(status_code=404, detail="No matching records")
    a_party = records[0]["a_party"]
    return {
        "query": query,
        "a_party": a_party,
        "risk": flags["risk_by_a_party"].get(a_party, {"score": 0, "level": "Low"}),
        "flags": flags["flags_by_a_party"].get(a_party, []),
        "breakdown": flags["breakdown_by_a_party"].get(a_party, []),
        "device_profile": build_device_profile(records),
        "interactions": aggregate_interactions(records),
        "records": records,
    }


def _csv_bytes(rows):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")


def build_pdf(payload):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []
    story.append(Paragraph("IPDR Insight Investigation Summary", styles["Title"]))
    story.append(Spacer(1, 10))
    story.append(Paragraph(f"A-party: {payload['a_party']}", styles["Heading2"]))
    story.append(Paragraph(f"Risk: {payload['risk']['level']} ({payload['risk']['score']})", styles["BodyText"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Flags", styles["Heading3"]))
    for flag in payload["flags"]:
        story.append(Paragraph(f"- {flag['type']}: {flag['message']}", styles["BodyText"]))
    story.append(Spacer(1, 8))

    device_profile = payload.get("device_profile") or {}
    if any(device_profile.get(key) for key in ("imeis", "imsis", "cell_ids")):
        story.append(Paragraph("Device &amp; Location Profile", styles["Heading3"]))
        device_rows = [["Type", "Value", "Sessions", "First Seen", "Last Seen"]]
        for label, key in (("IMEI", "imeis"), ("IMSI", "imsis"), ("Cell ID", "cell_ids")):
            for item in device_profile.get(key, [])[:10]:
                device_rows.append([label, item["value"], str(item["count"]), item["first_seen"], item["last_seen"]])
        device_table = Table(device_rows, repeatRows=1)
        device_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(device_table)
        story.append(Spacer(1, 8))
    rows = [["B-party", "Count", "Duration", "First Seen", "Last Seen"]]
    for item in payload["interactions"][:25]:
        rows.append([
            item["b_party_ip"] or item["b_party_number"],
            str(item["interaction_count"]),
            str(item["total_duration_sec"]),
            item["first_seen"],
            item["last_seen"],
        ])
    table = Table(rows, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(table)
    doc.build(story)
    buffer.seek(0)
    return buffer


@app.get("/export/csv")
def export_csv(
    query: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    min_duration: float | None = None,
    max_duration: float | None = None,
    session_type: str | None = None,
    relevant_only: bool = False,
    flagged_only: bool = False,
    user=Depends(get_current_user),
):
    with connect() as conn:
        rows = [dict(r) for r in fetch_all_records(conn)]
        flags = compute_flags(conn)
    filters = {
        "query": query,
        "start_date": start_date,
        "end_date": end_date,
        "min_duration": min_duration,
        "max_duration": max_duration,
        "session_type": session_type,
    }
    rows = [r for r in rows if record_matches_filters(r, filters)]
    if relevant_only:
        rows = [r for r in rows if is_relevant_record(r)]
    if flagged_only:
        rows = [r for r in rows if r["a_party"] in flags["risk_by_a_party"]]
    if not rows:
        raise HTTPException(status_code=404, detail="No records to export")
    return StreamingResponse(io.BytesIO(_csv_bytes(rows)), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=ipdr_export.csv"})


@app.get("/export/pdf")
def export_pdf(query: str, user=Depends(get_current_user)):
    payload = investigation(query, user=user)
    buffer = build_pdf(payload)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="ipdr_investigation_{query}.pdf"'}
    )
