from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BASE_DIR.parent
DB_PATH = BASE_DIR / "ipdr_insight.db"
SAMPLE_DATA_PATH = ROOT_DIR / "sample_data" / "sample_ipdr_data.csv"
SECRET_KEY = "ipdr-insight-demo-secret"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60
DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin123"

DEFAULT_SETTINGS = {
    "night_start_hour": 0,
    "night_end_hour": 4,
    "night_frequency_threshold": 4,
    "short_duration_threshold_sec": 5,
    "short_duration_repeat_threshold": 6,
    "distinct_window_minutes": 60,
    "distinct_b_threshold": 12,
    "shared_bparty_threshold": 6,
    "graph_limit": 200,
}
