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
                b_party_hostname TEXT,
                b_party_number TEXT,
                timestamp TEXT NOT NULL,
                duration_sec REAL NOT NULL DEFAULT 0,
                port TEXT,
                data_volume REAL,
                session_type TEXT,
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
                description TEXT,
                status TEXT NOT NULL DEFAULT 'Open',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS case_parties (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                subject_type TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(case_id, subject),
                FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS case_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS blacklist_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                value TEXT UNIQUE NOT NULL,
                value_type TEXT NOT NULL DEFAULT 'any',
                label TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        seed_defaults(conn)
        seed_reference_data(conn)


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


def seed_reference_data(conn):
    entries = [("198.51.100.23", "ip", "Malicious Server")]
    for value, value_type, label in entries:
        conn.execute(
            """
            INSERT INTO blacklist_entries (value, value_type, label)
            VALUES (?, ?, ?)
            ON CONFLICT(value) DO UPDATE SET value_type = excluded.value_type, label = excluded.label
            """,
            (value, value_type, label),
        )


def get_setting(conn, key, default=None):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def get_blacklist_entries(conn):
    return [dict(row) for row in conn.execute("SELECT id, value, value_type, label, created_at FROM blacklist_entries").fetchall()]


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

        dt = dtparser.parse(text, fuzzy=True)
        if dt.tzinfo is not None:
            dt = dt.astimezone().replace(tzinfo=None)
        return dt.replace(microsecond=0).isoformat(sep=" ")
    except Exception:
        return None


def iso_now():
    return datetime.utcnow().replace(microsecond=0).isoformat(sep=" ")
