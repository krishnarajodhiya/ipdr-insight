from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class UploadSummary(BaseModel):
    upload_id: int
    filename: str
    file_type: str
    total_rows: int
    valid_rows: int
    error_rows: int
    date_min: Optional[str] = None
    date_max: Optional[str] = None
    errors: list[dict[str, Any]] = Field(default_factory=list)


class SearchParams(BaseModel):
    query: Optional[str] = None
    page: int = 1
    page_size: int = 25
    sort_by: str = "timestamp"
    sort_dir: str = "desc"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    min_duration: Optional[float] = None
    max_duration: Optional[float] = None
    session_type: Optional[str] = None
    flagged_only: bool = False


class SettingsPayload(BaseModel):
    night_start_hour: int = Field(0, ge=0, le=23)
    night_end_hour: int = Field(4, ge=0, le=23)
    night_frequency_threshold: int = Field(4, ge=1)
    short_duration_threshold_sec: int = Field(5, ge=1)
    short_duration_repeat_threshold: int = Field(6, ge=1)
    distinct_window_minutes: int = Field(60, ge=5)
    distinct_b_threshold: int = Field(12, ge=1)
    shared_bparty_threshold: int = Field(6, ge=1)
    graph_limit: int = Field(200, ge=25, le=1000)


class InvestigationRequest(BaseModel):
    query: str


class InteractionFilter(BaseModel):
    a_party: Optional[str] = None
    b_party: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class CaseCreatePayload(BaseModel):
    name: str
    description: Optional[str] = ""
    status: str = Field("Open", pattern="^(Open|Closed)$")


class CaseNotePayload(BaseModel):
    note: str


class CasePartyPayload(BaseModel):
    subject: str
    subject_type: Optional[str] = "unknown"


class BlacklistEntryPayload(BaseModel):
    value: str
    value_type: str = Field("any", pattern="^(any|ip|number)$")
    label: str
