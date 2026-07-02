import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from .config import DB_PATH, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME, DEFAULT_SETTINGS


def row_to_dict(row):
    return dict(row) if row is not None else None


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def transaction():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with transaction() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                file_type TEXT NOT NULL,
                total_rows INTEGER NOT NULL DEFAULT 0,
                valid_rows INTEGER NOT NULL DEFAULT 0,
                error_rows INTEGER NOT NULL DEFAULT 0,
                date_min TEXT,
                date_max TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_id INTEGER,
                source_file TEXT,
                row_index INTEGER,
                a_party TEXT,
                b_party_ip TEXT,
                b_party_number TEXT,
                timestamp TEXT NOT NULL,
                duration_sec REAL NOT NULL DEFAULT 0,
                port TEXT,
                data_volume REAL,
                session_type TEXT,
                imei TEXT,
                imsi TEXT,
                cell_id TEXT,
                raw_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(upload_id) REFERENCES uploads(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS parse_errors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_id INTEGER,
                row_index INTEGER,
                message TEXT NOT NULL,
                raw_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(upload_id) REFERENCES uploads(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Open',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS case_parties (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL,
                party_value TEXT NOT NULL,
                party_type TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(case_id, party_value, party_type),
                FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS case_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL,
                note TEXT NOT NULL,
                created_by TEXT DEFAULT 'investigator',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS manual_flags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                target_value TEXT NOT NULL,
                target_type TEXT NOT NULL,
                reason TEXT NOT NULL,
                investigator TEXT DEFAULT 'investigator',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS blacklist_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                target_value TEXT NOT NULL UNIQUE,
                target_type TEXT NOT NULL,
                label TEXT NOT NULL,
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        migrate_schema(conn)
        seed_defaults(conn)


def migrate_schema(conn):
    """Idempotent in-place upgrades for databases created before new columns existed."""
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(records)").fetchall()}
    for column in ("imei", "imsi", "cell_id"):
        if column not in existing:
            conn.execute(f"ALTER TABLE records ADD COLUMN {column} TEXT")


def seed_defaults(conn):
    from passlib.context import CryptContext

    pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
    conn.execute(
        """
        INSERT INTO users (username, password_hash)
        VALUES (?, ?)
        ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
        """,
        (DEFAULT_ADMIN_USERNAME, pwd_context.hash(DEFAULT_ADMIN_PASSWORD)),
    )

    for key, value in DEFAULT_SETTINGS.items():
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            (key, json.dumps(value)),
        )

    seed_blacklist(conn)


def seed_blacklist(conn):
    seed_entries = [
        ("203.0.113.10", "ip", "Known VPN exit node", "Previously linked to credential stuffing campaigns"),
        ("203.0.113.22", "ip", "Fraud relay endpoint", "Observed in prior telecom fraud investigation"),
        ("203.0.113.35", "ip", "Command-and-control host", "Suspicious beacon traffic pattern in archived case"),
        ("198.51.100.44", "ip", "TOR bridge indicator", "Multiple anonymized routing traces"),
        ("198.51.100.77", "ip", "Malware staging server", "Used for payload distribution in historical incident"),
        ("198.51.100.133", "ip", "Phishing infrastructure", "Domain and IP tied to smishing operation"),
        ("185.17.24.9", "ip", "Darknet gateway node", "Cross-border cybercrime intel match"),
        ("45.155.205.12", "ip", "Fraud call redirector", "High-risk rerouting endpoint"),
        ("91.214.124.8", "ip", "Compromised proxy network", "Known abuse of residential proxy pool"),
        ("103.77.192.61", "ip", "Data exfiltration proxy", "Repeated high-volume short sessions"),
        ("8000099000", "number", "Fraud ring handset", "Linked to synthetic identity scam chain"),
        ("8000002000", "number", "Beacon test number", "Used for repeated short ping-like calls"),
        ("8000010007", "number", "Coordinator handset", "Appeared in prior narcotics coordination case"),
        ("919999000111", "number", "Spoofing origin line", "Carrier report flagged repeated spoofing"),
        ("918888123456", "number", "Known mule contact", "Financial mule recruitment hotline"),
        ("917777654321", "number", "Bulk scam caller", "Repeated telecom complaint records"),
        ("8000001000", "number", "Dark market contact", "Mapped in prior cyber-intel bulletin"),
        ("912345678901", "number", "Compromised bot control", "Known botnet control number"),
    ]
    for value, target_type, label, reason in seed_entries:
        conn.execute(
            """
            INSERT OR IGNORE INTO blacklist_entries (target_value, target_type, label, reason)
            VALUES (?, ?, ?, ?)
            """,
            (value, target_type, label, reason),
        )


def get_setting(conn, key, default=None):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def set_settings(conn, values):
    for key, value in values.items():
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value)),
        )


def parse_datetime(value):
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        from dateutil import parser as dtparser

        # dayfirst=True: Indian TSP exports use DD/MM/YYYY (e.g. 28/06/2026).
        # Unambiguous ISO formats (YYYY-MM-DD) are still parsed correctly.
        dt = dtparser.parse(text, fuzzy=True, dayfirst=True)
        if dt.tzinfo is not None:
            dt = dt.astimezone().replace(tzinfo=None)
        return dt.replace(microsecond=0).isoformat(sep=" ")
    except Exception:
        return None


def iso_now():
    return datetime.utcnow().replace(microsecond=0).isoformat(sep=" ")
