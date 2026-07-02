from __future__ import annotations

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sample_data" / "sample_ipdr_data.csv"

FIELDNAMES = [
    "MSISDN",
    "DEST_IP_ADDRESS",
    "CALLED_PARTY",
    "START_DATE_TIME",
    "SESS_DURATION",
    "DEST_PORT",
    "IMEI",
    "IMSI",
    "CELL_ID",
]


def ip_for(i: int) -> str:
    return f"10.{(i // 250) % 250}.{(i // 25) % 250}.{(i % 250) + 1}"


def styled_msisdn(number: str) -> str:
    """Render the same subscriber number in mixed Indian operator export styles."""
    return random.choice([number, f"+91{number}", f"91{number}", f"0{number}", f"+91 {number[:5]} {number[5:]}"])


def make_imei() -> str:
    return "35" + "".join(str(random.randint(0, 9)) for _ in range(13))


def make_imsi() -> str:
    # 404/405 = India MCC; next 2 digits = MNC
    return f"40{random.choice('45')}{random.randint(10, 98)}" + "".join(str(random.randint(0, 9)) for _ in range(10))


def make_cell_id() -> str:
    # LAC-CI style tower identifier
    return f"{random.randint(1000, 9999)}-{random.randint(10000, 99999)}"


class DeviceRegistry:
    """Stable IMEI/IMSI/home-towers per subscriber so profiles look realistic."""

    def __init__(self):
        self.devices: dict[str, dict[str, object]] = {}

    def profile(self, msisdn: str) -> dict[str, object]:
        if msisdn not in self.devices:
            self.devices[msisdn] = {
                "imei": make_imei(),
                "imsi": make_imsi(),
                "cells": [make_cell_id() for _ in range(random.randint(1, 3))],
            }
        return self.devices[msisdn]

    def row_fields(self, msisdn: str) -> dict[str, str]:
        profile = self.profile(msisdn)
        return {
            "IMEI": profile["imei"],
            "IMSI": profile["imsi"],
            "CELL_ID": random.choice(profile["cells"]),
        }


def build_rows():
    random.seed(42)
    base = datetime(2026, 6, 24, 8, 0, 0)
    rows = []
    registry = DeviceRegistry()

    def make_row(a: str, b_ip: str, b_num: str, ts: datetime, duration: int, port: int, device: dict[str, str] | None = None):
        return {
            "MSISDN": styled_msisdn(a),
            "DEST_IP_ADDRESS": b_ip,
            "CALLED_PARTY": styled_msisdn(b_num) if b_num else "",
            "START_DATE_TIME": ts.strftime("%d-%m-%Y %H:%M:%S"),
            "SESS_DURATION": duration,
            "DEST_PORT": port,
            **(device or registry.row_fields(a)),
        }

    normal_a_parties = [f"9{random.randint(100000000, 999999999)}" for _ in range(16)]
    b_numbers = [f"8{random.randint(100000000, 999999999)}" for _ in range(24)]

    for i in range(180):
        a = random.choice(normal_a_parties)
        ts = base + timedelta(minutes=random.randint(0, 9 * 24 * 60), seconds=random.randint(0, 3599))
        rows.append(make_row(a, ip_for(i + 10), random.choice(b_numbers), ts, random.randint(8, 680), random.choice([80, 443, 5060, 8080, 22, 53, 8443])))

    # Late-night burst to a blacklisted endpoint
    burst_a = "9177000001"
    for i in range(60):
        ts = datetime(2026, 6, 28, 0, 0, 0) + timedelta(minutes=i // 3, seconds=i * 13)
        rows.append(make_row(burst_a, "198.51.100.77", "8000001000", ts, random.randint(18, 240), 443))

    # Repeated short "ping" sessions
    ping_a = "9177000002"
    for i in range(40):
        ts = datetime(2026, 6, 29, 14, 10, 0) + timedelta(minutes=i * 5)
        rows.append(make_row(ping_a, "203.0.113.90", "8000002000", ts, random.randint(1, 4), random.choice([80, 443, 8080])))

    # High fan-out A-party
    fanout_a = "9177000003"
    fanout_bs = [f"198.51.100.{i}" for i in range(10, 40)]
    for i in range(20):
        ts = datetime(2026, 6, 30, 11, 0, 0) + timedelta(minutes=i * 2)
        rows.append(make_row(fanout_a, fanout_bs[i % len(fanout_bs)], f"800001{i:04d}", ts, random.randint(6, 90), random.choice([53, 80, 443, 22, 25])))

    # Shared B-party hub
    shared_as = [f"91770000{i:02d}" for i in range(10, 17)]
    for i, a in enumerate(shared_as):
        ts = datetime(2026, 6, 30, 18, 20, 0) + timedelta(minutes=i * 11)
        rows.append(make_row(a, "203.0.113.200", "8000099000", ts, random.randint(12, 120), random.choice([443, 8443, 8080])))

    # Device churn: one number cycling through several handsets (IMEIs)
    churn_a = "9177000004"
    churn_imeis = [make_imei() for _ in range(4)]
    churn_imsi = make_imsi()
    churn_cell = make_cell_id()
    for i in range(16):
        ts = datetime(2026, 6, 27, 9, 30, 0) + timedelta(hours=i * 6)
        device = {"IMEI": churn_imeis[i % len(churn_imeis)], "IMSI": churn_imsi, "CELL_ID": churn_cell}
        rows.append(make_row(churn_a, ip_for(900 + i), random.choice(b_numbers), ts, random.randint(30, 300), 443, device))

    # SIM swap: one handset (IMEI) shared across several numbers
    swap_imei = make_imei()
    swap_as = ["9177000020", "9177000021", "9177000022"]
    for i, a in enumerate(swap_as):
        for j in range(5):
            ts = datetime(2026, 6, 26, 7, 0, 0) + timedelta(days=i, hours=j * 3)
            device = {"IMEI": swap_imei, "IMSI": make_imsi(), "CELL_ID": make_cell_id()}
            rows.append(make_row(a, ip_for(950 + i * 5 + j), random.choice(b_numbers), ts, random.randint(20, 200), random.choice([443, 8080]), device))

    while len(rows) < 340:
        a = random.choice(normal_a_parties + [burst_a, ping_a, fanout_a])
        ts = base + timedelta(minutes=random.randint(0, 10 * 24 * 60), seconds=random.randint(0, 3599))
        rows.append(make_row(a, ip_for(len(rows) + 500), random.choice(b_numbers), ts, random.randint(5, 420), random.choice([80, 443, 5060, 22, 25])))

    random.shuffle(rows)
    return rows


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows = build_rows()
    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {OUT}")


if __name__ == "__main__":
    main()
