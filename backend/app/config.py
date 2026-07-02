import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BASE_DIR.parent
DB_PATH = BASE_DIR / "ipdr_insight.db"
SAMPLE_DATA_PATH = ROOT_DIR / "sample_data" / "sample_ipdr_data.csv"
SECRET_KEY = os.getenv("SECRET_KEY", "ipdr-insight-demo-secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
DEFAULT_ADMIN_USERNAME = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]

DEFAULT_SETTINGS = {
    "night_start_hour": 0,
    "night_end_hour": 4,
    "night_frequency_threshold": 4,
    "short_duration_threshold_sec": 5,
    "short_duration_repeat_threshold": 6,
    "distinct_window_minutes": 60,
    "distinct_b_threshold": 12,
    "shared_bparty_threshold": 6,
    "device_churn_imei_threshold": 2,
    "shared_imei_party_threshold": 1,
    "graph_limit": 200,
}
