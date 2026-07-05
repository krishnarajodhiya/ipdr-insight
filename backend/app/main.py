from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, CORS_ORIGINS, SAMPLE_DATA_PATH, SECRET_KEY
from .db import connect, initialize_db, iso_now, transaction
from .schemas import (
    BlacklistEntryPayload,
    CaseCreatePayload,
    CaseNotePayload,
    CasePartyPayload,
    LoginRequest,
    SettingsPayload,
    TokenResponse,
    UploadSummary,
)
from .services import (
    aggregate_interactions,
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


def _subject_value(record: dict) -> str:
    return (record.get("b_party_ip") or record.get("b_party_number") or "").strip()


def _subject_type(subject: str) -> str:
    if ":" in subject or subject.count(".") == 3:
        return "ip"
    if subject.isdigit():
        return "number"
    return "unknown"


def _case_party_profile(subject: str, records: list[dict], flags: dict) -> dict:
    related = [r for r in records if r["a_party"] == subject or _subject_value(r) == subject]
    risk = flags["risk_by_a_party"].get(subject, {"score": 0, "level": "Low"})
    flag_details = flags["risk_details_by_a_party"].get(subject, [])
    blacklist_matches = flags["blacklist_matches_by_a_party"].get(subject, [])
    status = "Flagged" if risk["score"] > 0 or blacklist_matches else "Clear"
    if blacklist_matches:
        status = "Blacklist Match"
    return {
        "subject": subject,
        "subject_type": _subject_type(subject),
        "risk": risk,
        "status": status,
        "flags": flags["flags_by_a_party"].get(subject, []),
        "risk_details": flag_details,
        "blacklist_matches": blacklist_matches,
        "interaction_count": len(related),
        "records": related,
    }


def _load_investigation_payload(conn, query: str) -> dict:
    records = parse_investigation_rows(conn, query)
    if not records:
        raise HTTPException(status_code=404, detail="No matching records")
    flags = compute_flags(conn)
    a_party = records[0]["a_party"]
    party_records = [r for r in records if r["a_party"] == a_party or _subject_value(r) == query]
    detail_records = party_records or records
    interactions = aggregate_interactions(detail_records)
    related_subjects = sorted({r["a_party"] for r in detail_records} | {_subject_value(r) for r in detail_records if _subject_value(r)})
    profiles = [_case_party_profile(subject, [dict(r) for r in fetch_all_records(conn)], flags) for subject in related_subjects if subject]
    case_rows = conn.execute(
        """
        SELECT c.id, c.name, c.description, c.status, c.created_at, c.updated_at
        FROM cases c
        JOIN case_parties cp ON cp.case_id = c.id
        WHERE cp.subject = ?
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        """,
        (query,),
    ).fetchall()
    return {
        "query": query,
        "a_party": a_party,
        "subject": query,
        "subject_type": _subject_type(query),
        "risk": flags["risk_by_a_party"].get(a_party, {"score": 0, "level": "Low"}),
        "flags": flags["flags_by_a_party"].get(a_party, []),
        "risk_details": flags["risk_details_by_a_party"].get(a_party, []),
        "blacklist_matches": flags["blacklist_matches_by_a_party"].get(a_party, []),
        "interactions": interactions,
        "records": detail_records,
        "party_profiles": profiles,
        "assigned_cases": [dict(row) for row in case_rows],
    }


@app.on_event("startup")
def startup():
    initialize_db()
    with transaction() as conn:
        seed_uploads = conn.execute("SELECT id FROM uploads WHERE filename = ?", (SAMPLE_DATA_PATH.name,)).fetchall()
        for row in seed_uploads:
            upload_id = row["id"]
            conn.execute("DELETE FROM parse_errors WHERE upload_id = ?", (upload_id,))
            conn.execute("DELETE FROM records WHERE upload_id = ?", (upload_id,))
            conn.execute("DELETE FROM uploads WHERE id = ?", (upload_id,))
        conn.execute("DELETE FROM records WHERE source_file = ?", (SAMPLE_DATA_PATH.name,))


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


@app.get("/uploads")
def list_uploads(user=Depends(get_current_user)):
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT u.id, u.filename, u.file_type, u.total_rows, u.valid_rows, u.error_rows,
                   u.date_min, u.date_max, u.created_at,
                   COUNT(r.id) AS record_count
            FROM uploads u
            LEFT JOIN records r ON r.upload_id = u.id
            GROUP BY u.id
            ORDER BY u.created_at DESC, u.id DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/uploads/{upload_id}")
def upload_detail(upload_id: int, user=Depends(get_current_user)):
    with connect() as conn:
        upload_row = conn.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,)).fetchone()
        if not upload_row:
            raise HTTPException(status_code=404, detail="Upload not found")
        records = [dict(r) for r in conn.execute(
            """
            SELECT id, upload_id, source_file, row_index, a_party, b_party_ip, b_party_number, timestamp,
                   duration_sec, port, data_volume, session_type, raw_json
            FROM records
            WHERE upload_id = ?
            ORDER BY timestamp DESC, id DESC
            """,
            (upload_id,),
        ).fetchall()]
        errors = [dict(r) for r in conn.execute(
            "SELECT id, upload_id, row_index, message, raw_json, created_at FROM parse_errors WHERE upload_id = ? ORDER BY row_index ASC",
            (upload_id,),
        ).fetchall()]
    return {"upload": dict(upload_row), "records": records, "errors": errors}


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


@app.get("/cases")
def list_cases(user=Depends(get_current_user)):
    with connect() as conn:
        cases = conn.execute(
            "SELECT id, name, description, status, created_at, updated_at FROM cases ORDER BY updated_at DESC, id DESC"
        ).fetchall()
        rows = []
        for case_row in cases:
            party_count = conn.execute("SELECT COUNT(*) AS c FROM case_parties WHERE case_id = ?", (case_row["id"],)).fetchone()["c"]
            note_row = conn.execute("SELECT MAX(created_at) AS last_note FROM case_notes WHERE case_id = ?", (case_row["id"],)).fetchone()
            last_updated = max(filter(None, [case_row["updated_at"], note_row["last_note"]])) if note_row else case_row["updated_at"]
            rows.append(
                {
                    **dict(case_row),
                    "party_count": party_count,
                    "last_updated": last_updated,
                }
            )
    return rows


@app.post("/cases")
def create_case(payload: CaseCreatePayload, user=Depends(get_current_user)):
    now = iso_now()
    with transaction() as conn:
        cur = conn.execute(
            "INSERT INTO cases (name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (payload.name.strip(), payload.description or "", payload.status, now, now),
        )
        case_id = cur.lastrowid
    return {"id": case_id, "name": payload.name.strip(), "description": payload.description or "", "status": payload.status, "created_at": now, "updated_at": now}


def _load_case_detail(conn, case_id: int) -> dict:
    case_row = conn.execute("SELECT id, name, description, status, created_at, updated_at FROM cases WHERE id = ?", (case_id,)).fetchone()
    if not case_row:
        raise HTTPException(status_code=404, detail="Case not found")
    subjects = [row["subject"] for row in conn.execute("SELECT subject FROM case_parties WHERE case_id = ? ORDER BY created_at ASC", (case_id,)).fetchall()]
    notes = [dict(row) for row in conn.execute("SELECT id, note, created_at FROM case_notes WHERE case_id = ? ORDER BY created_at ASC, id ASC", (case_id,)).fetchall()]
    flags = compute_flags(conn)
    records = [dict(r) for r in fetch_all_records(conn)]
    party_profiles = [_case_party_profile(subject, records, flags) for subject in subjects]
    case_records = [record for record in records if record["a_party"] in subjects or _subject_value(record) in subjects]
    network = build_network(case_records, set(flags["risk_by_a_party"].keys()) & set(subjects), 200)
    summary = {
        "total_interactions": sum(profile["interaction_count"] for profile in party_profiles),
        "risk_score": sum(profile["risk"]["score"] for profile in party_profiles),
        "flag_count": sum(len(profile["flags"]) for profile in party_profiles),
        "last_updated": max(filter(None, [case_row["updated_at"]] + [note["created_at"] for note in notes])) if notes else case_row["updated_at"],
    }
    return {
        "id": case_row["id"],
        "name": case_row["name"],
        "description": case_row["description"],
        "status": case_row["status"],
        "created_at": case_row["created_at"],
        "updated_at": case_row["updated_at"],
        "summary": summary,
        "parties": party_profiles,
        "notes": notes,
        "network": network,
    }


@app.get("/cases/{case_id}")
def get_case(case_id: int, user=Depends(get_current_user)):
    with connect() as conn:
        return _load_case_detail(conn, case_id)


@app.post("/cases/{case_id}/parties")
def add_case_party(case_id: int, payload: CasePartyPayload, user=Depends(get_current_user)):
    subject = payload.subject.strip()
    if not subject:
        raise HTTPException(status_code=400, detail="Subject is required")
    subject_type = payload.subject_type or _subject_type(subject)
    now = iso_now()
    with transaction() as conn:
        case_row = conn.execute("SELECT id FROM cases WHERE id = ?", (case_id,)).fetchone()
        if not case_row:
            raise HTTPException(status_code=404, detail="Case not found")
        conn.execute(
            "INSERT OR IGNORE INTO case_parties (case_id, subject, subject_type) VALUES (?, ?, ?)",
            (case_id, subject, subject_type),
        )
        conn.execute("UPDATE cases SET updated_at = ? WHERE id = ?", (now, case_id))
        return _load_case_detail(conn, case_id)


@app.post("/cases/{case_id}/notes")
def add_case_note(case_id: int, payload: CaseNotePayload, user=Depends(get_current_user)):
    note = payload.note.strip()
    if not note:
        raise HTTPException(status_code=400, detail="Note is required")
    now = iso_now()
    with transaction() as conn:
        case_row = conn.execute("SELECT id FROM cases WHERE id = ?", (case_id,)).fetchone()
        if not case_row:
            raise HTTPException(status_code=404, detail="Case not found")
        conn.execute("INSERT INTO case_notes (case_id, note, created_at) VALUES (?, ?, ?)", (case_id, note, now))
        conn.execute("UPDATE cases SET updated_at = ? WHERE id = ?", (now, case_id))
        return _load_case_detail(conn, case_id)


@app.get("/blacklist")
def list_blacklist(user=Depends(get_current_user)):
    with connect() as conn:
        rows = conn.execute("SELECT id, value, value_type, label, created_at FROM blacklist_entries ORDER BY created_at DESC, id DESC").fetchall()
    return [dict(row) for row in rows]


@app.post("/blacklist")
def create_blacklist_entry(payload: BlacklistEntryPayload, user=Depends(get_current_user)):
    value = payload.value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Value is required")
    with transaction() as conn:
        conn.execute(
            "INSERT INTO blacklist_entries (value, value_type, label) VALUES (?, ?, ?) ON CONFLICT(value) DO UPDATE SET value_type = excluded.value_type, label = excluded.label",
            (value, payload.value_type, payload.label.strip()),
        )
        row = conn.execute("SELECT id, value, value_type, label, created_at FROM blacklist_entries WHERE value = ?", (value,)).fetchone()
    return dict(row)


@app.delete("/blacklist/{entry_id}")
def delete_blacklist_entry(entry_id: int, user=Depends(get_current_user)):
    with transaction() as conn:
        row = conn.execute("SELECT id FROM blacklist_entries WHERE id = ?", (entry_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Blacklist entry not found")
        conn.execute("DELETE FROM blacklist_entries WHERE id = ?", (entry_id,))
    return {"status": "deleted", "id": entry_id}


@app.get("/records/search")
def search_records(
    query: Optional[str] = None,
    upload_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 25,
    sort_by: str = "timestamp",
    sort_dir: str = "desc",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_duration: Optional[float] = None,
    max_duration: Optional[float] = None,
    session_type: Optional[str] = None,
    relevant_only: bool = False,
    flagged_only: bool = False,
    user=Depends(get_current_user),
):
    with connect() as conn:
        records = [dict(r) for r in fetch_all_records(conn)]
        if upload_id is not None:
            records = [r for r in records if int(r.get("upload_id") or 0) == int(upload_id)]
            flags = compute_flags(conn, records)
        else:
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
        r["risk_details"] = flags["risk_details_by_a_party"].get(r["a_party"], [])
        r["blacklist_matches"] = flags["blacklist_matches_by_a_party"].get(r["a_party"], [])

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
    query: Optional[str] = None,
    upload_id: Optional[int] = None,
    a_party: Optional[str] = None,
    b_party: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_duration: Optional[float] = None,
    max_duration: Optional[float] = None,
    session_type: Optional[str] = None,
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
        if upload_id is not None:
            rows = [r for r in rows if int(r.get("upload_id") or 0) == int(upload_id)]
            flags = compute_flags(conn, rows)
        else:
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
        item["risk_details"] = flags["risk_details_by_a_party"].get(item["a_party"], [])
        item["blacklist_matches"] = flags["blacklist_matches_by_a_party"].get(item["a_party"], [])
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


@app.get("/investigation/{query}")
def investigation(query: str, user=Depends(get_current_user)):
    with connect() as conn:
        return _load_investigation_payload(conn, query)


def _csv_bytes(rows):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")


@app.get("/export/csv")
def export_csv(
    query: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_duration: Optional[float] = None,
    max_duration: Optional[float] = None,
    session_type: Optional[str] = None,
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


@app.get("/export/pdf")
def export_pdf(query: str, user=Depends(get_current_user)):
    with connect() as conn:
        payload = _load_investigation_payload(conn, query)
    buffer = build_pdf(payload)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="ipdr_investigation_{query}.pdf"'},
    )
