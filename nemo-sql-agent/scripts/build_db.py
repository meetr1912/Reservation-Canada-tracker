"""Build a normalized SQLite database from the repo's oTENTik availability data.

This turns the two raw JSON artifacts that the tracker already produces
(`otentiks.json` and `availability_report.json`) into a small relational
database that a text-to-SQL agent can query.

Resulting schema (intentionally requires joins, date math, and aggregation so
it is a realistic NL2SQL target):

    parks(park_id, park_name, park_group, location, province)
    otentiks(resource_id, park_id, resource_name, page_title)
    availability(resource_id, date, is_available)

Run:
    python scripts/build_db.py            # writes nemo-sql-agent/data/otentiks.db
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PKG_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = PKG_ROOT / "data" / "otentiks.db"

# Map the (sometimes mojibake) raw park names onto clean, queryable fields.
PROVINCE_BY_GROUP = {
    "Fundy": "New Brunswick",
    "Kouchibouguac": "New Brunswick",
    "Kejimkujik": "Nova Scotia",
    "Cape Breton Highlands": "Nova Scotia",
    "Grand-Pré": "Nova Scotia",
    "Prince Edward Island": "Prince Edward Island",
}


def _clean(text: str) -> str:
    """Repair latin-1/utf-8 mojibake such as 'Grand-PrÃ©' -> 'Grand-Pré'."""
    if not text:
        return text
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def _split_park(raw_name: str) -> tuple[str, str, str]:
    """'Fundy - Headquarters' -> ('Fundy National Park', 'Headquarters', province)."""
    name = _clean(raw_name)
    if " - " in name:
        group, location = name.split(" - ", 1)
    else:
        group, location = name, ""
    province = PROVINCE_BY_GROUP.get(group, "Unknown")
    if group == "Grand-Pré":
        label = "Grand-Pré National Historic Site"
    else:
        label = group if group.endswith(("Park", "Site")) else f"{group} National Park"
    return label, location, province


def build(db_path: Path = DB_PATH) -> Path:
    otentiks = json.loads((REPO_ROOT / "otentiks.json").read_text())
    report = json.loads((REPO_ROOT / "availability_report.json").read_text())

    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE parks (
            park_id    INTEGER PRIMARY KEY,
            park_name  TEXT NOT NULL,
            park_group TEXT NOT NULL,
            location   TEXT NOT NULL,
            province   TEXT NOT NULL
        );
        CREATE TABLE otentiks (
            resource_id   INTEGER PRIMARY KEY,
            park_id       INTEGER NOT NULL REFERENCES parks(park_id),
            resource_name TEXT NOT NULL,
            page_title    TEXT,
            UNIQUE(park_id, resource_name)
        );
        CREATE TABLE availability (
            resource_id  INTEGER NOT NULL REFERENCES otentiks(resource_id),
            date         TEXT NOT NULL,           -- ISO YYYY-MM-DD
            is_available INTEGER NOT NULL,        -- 0 / 1
            PRIMARY KEY (resource_id, date)
        );
        CREATE INDEX idx_avail_date ON availability(date);
        CREATE INDEX idx_avail_resource ON availability(resource_id);
        """
    )

    # parks (deduplicated by raw ParkName)
    park_ids: dict[str, int] = {}
    for row in otentiks:
        raw = row["ParkName"]
        if raw in park_ids:
            continue
        group, location, province = _split_park(raw)
        park_id = len(park_ids) + 1
        park_ids[raw] = park_id
        cur.execute(
            "INSERT INTO parks VALUES (?,?,?,?,?)",
            (park_id, _clean(raw), group, location, province),
        )

    # otentiks (resource_id comes from NegativeResourceValue, kept as the natural key)
    seen_resource: set[int] = set()
    for row in otentiks:
        rid = int(row["NegativeResourceValue"])
        if rid in seen_resource:
            continue
        seen_resource.add(rid)
        cur.execute(
            "INSERT INTO otentiks VALUES (?,?,?,?)",
            (rid, park_ids[row["ParkName"]], row["ResourceName"], row.get("PageTitle")),
        )

    # availability: report is { 'YYYY-MM-DD': [ {ParkName, ResourceName, status}, ... ] }
    name_to_rid: dict[tuple[str, str], int] = {
        (row["ParkName"], row["ResourceName"]): int(row["NegativeResourceValue"])
        for row in otentiks
    }
    inserted = 0
    for date, entries in report.items():
        for e in entries:
            rid = name_to_rid.get((e["ParkName"], e["ResourceName"]))
            if rid is None:
                continue
            cur.execute(
                "INSERT OR IGNORE INTO availability VALUES (?,?,?)",
                (rid, date, 1 if e.get("status") else 0),
            )
            inserted += 1

    conn.commit()

    parks = cur.execute("SELECT COUNT(*) FROM parks").fetchone()[0]
    units = cur.execute("SELECT COUNT(*) FROM otentiks").fetchone()[0]
    dates = cur.execute("SELECT COUNT(DISTINCT date) FROM availability").fetchone()[0]
    conn.close()

    print(f"Built {db_path}")
    print(f"  parks={parks}  otentiks={units}  availability_rows={inserted}  distinct_dates={dates}")
    return db_path


if __name__ == "__main__":
    build()
