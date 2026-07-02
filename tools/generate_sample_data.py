from __future__ import annotations

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sample_data" / "sample_ipdr_data.csv"


def ip_for(i: int) -> str:
    return f"10.{(i // 250) % 250}.{(i // 25) % 250}.{(i % 250) + 1}"


def build_rows():
    random.seed(42)
    base = datetime(2026, 6, 24, 8, 0, 0)
    rows = []

    normal_a_parties = [f"9{random.randint(100000000, 999999999)}" for _ in range(16)]
    b_numbers = [f"8{random.randint(100000000, 999999999)}" for _ in range(24)]

    for i in range(180):
        a = random.choice(normal_a_parties)
        b_ip = ip_for(i + 10)
        b_num = random.choice(b_numbers)
        ts = base + timedelta(minutes=random.randint(0, 9 * 24 * 60), seconds=random.randint(0, 3599))
        rows.append(
            {
                "a_party_number": a,
                "b_party_ip": b_ip,
                "b_party_number": b_num,
                "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
                "duration_sec": random.randint(8, 680),
                "port": random.choice([80, 443, 5060, 8080, 22, 53, 8443]),
            }
        )

    burst_a = "9177000001"
    burst_b = "198.51.100.77"
    for i in range(60):
        ts = datetime(2026, 6, 28, 0, 0, 0) + timedelta(minutes=i // 3, seconds=i * 13)
        rows.append(
            {
                "a_party_number": burst_a,
                "b_party_ip": burst_b,
                "b_party_number": "8000001000",
                "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
                "duration_sec": random.randint(18, 240),
                "port": 443,
            }
        )

    ping_a = "9177000002"
    ping_b = "203.0.113.90"
    for i in range(40):
        ts = datetime(2026, 6, 29, 14, 10, 0) + timedelta(minutes=i * 5)
        rows.append(
            {
                "a_party_number": ping_a,
                "b_party_ip": ping_b,
                "b_party_number": "8000002000",
                "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
                "duration_sec": random.randint(1, 4),
                "port": random.choice([80, 443, 8080]),
            }
        )

    fanout_a = "9177000003"
    fanout_bs = [f"198.51.100.{i}" for i in range(10, 40)]
    for i in range(20):
        ts = datetime(2026, 6, 30, 11, 0, 0) + timedelta(minutes=i * 2)
        b_ip = fanout_bs[i % len(fanout_bs)]
        rows.append(
            {
                "a_party_number": fanout_a,
                "b_party_ip": b_ip,
                "b_party_number": f"800001{i:04d}",
                "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
                "duration_sec": random.randint(6, 90),
                "port": random.choice([53, 80, 443, 22, 25]),
            }
        )

    shared_bs = [
        ("9177000010", "203.0.113.200"),
        ("9177000011", "203.0.113.200"),
        ("9177000012", "203.0.113.200"),
        ("9177000013", "203.0.113.200"),
        ("9177000014", "203.0.113.200"),
        ("9177000015", "203.0.113.200"),
        ("9177000016", "203.0.113.200"),
    ]
    for i, (a, b_ip) in enumerate(shared_bs):
        ts = datetime(2026, 6, 30, 18, 20, 0) + timedelta(minutes=i * 11)
        rows.append(
            {
                "a_party_number": a,
                "b_party_ip": b_ip,
                "b_party_number": "8000099000",
                "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
                "duration_sec": random.randint(12, 120),
                "port": random.choice([443, 8443, 8080]),
            }
        )

    while len(rows) < 300:
        a = random.choice(normal_a_parties + [burst_a, ping_a, fanout_a])
        b_ip = ip_for(len(rows) + 500)
        ts = base + timedelta(minutes=random.randint(0, 10 * 24 * 60), seconds=random.randint(0, 3599))
        rows.append(
            {
                "a_party_number": a,
                "b_party_ip": b_ip,
                "b_party_number": random.choice(b_numbers),
                "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
                "duration_sec": random.randint(5, 420),
                "port": random.choice([80, 443, 5060, 22, 25]),
            }
        )

    random.shuffle(rows)
    return rows


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows = build_rows()
    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["a_party_number", "b_party_ip", "b_party_number", "timestamp", "duration_sec", "port"],
        )
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {OUT}")


if __name__ == "__main__":
    main()
