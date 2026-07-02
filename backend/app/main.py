import csv
import io
import json
from datetime import datetime
from pathlib import Path

import jwt
import pandas as pd
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from pydantic import BaseModel

from .config import ALGORITHM, DEFAULT_ADMIN_USERNAME, SAMPLE_DATA_PATH, SECRET_KEY
from .db import connect, initialize_db, iso_now, row_to_dict, transaction
from .schemas import InvestigationRequest, LoginRequest, SettingsPayload, TokenResponse, UploadSummary
from .services import (
    aggregate_interactions,
    build_network,
    compute_flags,
    fetch_all_records,
    import_records,
    load_rows_from_upload,
    parse_investigation_rows,
    record_matches_filters,
)


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
auth_scheme = HTTPBearer()
app = FastAPI(title="IPDR Insight API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def create_token(username: str) -> str:
    payload = {"sub": username, "iat": int(datetime.utcnow().timestamp())}
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
    if flagged_only:
        filtered = [r for r in filtered if r["a_party"] in flags["risk_by_a_party"]]

    for r in filtered:
        risk = flags["risk_by_a_party"].get(r["a_party"], {"score": 0, "level": "Low"})
        r["risk"] = risk
        r["flags"] = flags["flags_by_a_party"].get(r["a_party"], [])

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
        "interactions": aggregate_interactions(records),
        "records": records,
    }


def _csv_bytes(rows):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")


@app.get("/export/csv")
def export_csv(
    query: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    min_duration: float | None = None,
    max_duration: float | None = None,
    session_type: str | None = None,
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
    payload = investigation(query, user=user)
    buffer = build_pdf(payload)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="ipdr_investigation_{query}.pdf"'},
    )
