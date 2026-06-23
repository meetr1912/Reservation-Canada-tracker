"""Read-only SQLite access plus schema rendering for the text-to-SQL agent.

Two things matter for SQL-agent accuracy and live here:

* `render_m_schema` produces an "M-Schema" style description (tables, typed
  columns, primary/foreign keys, and a few sample values). Compact, typed
  schema representations with sample values are a consistently positive
  technique in the text-to-SQL literature.
* `safe_execute` enforces a single read-only statement so generated SQL can be
  run against the database to get execution feedback (the signal that powers
  self-correction) without risking writes.
"""
from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "otentiks.db"

_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|PRAGMA)\b",
    re.IGNORECASE,
)


@dataclass
class ExecResult:
    ok: bool
    rows: list[tuple] | None = None
    columns: list[str] | None = None
    error: str | None = None

    def fingerprint(self) -> str:
        """Order-insensitive signature of the result set, for majority voting."""
        if not self.ok or self.rows is None:
            return f"ERR:{self.error}"
        return repr(sorted(repr(r) for r in self.rows))


def connect(db_path: str | Path = DEFAULT_DB) -> sqlite3.Connection:
    # read-only URI connection; raises if the file is missing
    uri = f"file:{Path(db_path).resolve()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def safe_execute(sql: str, db_path: str | Path = DEFAULT_DB, limit: int = 200) -> ExecResult:
    """Execute a single SELECT and return rows or a structured error string."""
    statements = [s for s in sql.strip().rstrip(";").split(";") if s.strip()]
    if len(statements) != 1:
        return ExecResult(ok=False, error="Only a single SQL statement is allowed.")
    if _FORBIDDEN.search(sql):
        return ExecResult(ok=False, error="Only read-only SELECT statements are allowed.")
    try:
        conn = connect(db_path)
        conn.row_factory = None
        cur = conn.execute(statements[0])
        rows = cur.fetchmany(limit)
        cols = [d[0] for d in cur.description] if cur.description else []
        conn.close()
        return ExecResult(ok=True, rows=rows, columns=cols)
    except sqlite3.Error as exc:
        # The exact engine error is the high-value signal for self-correction.
        return ExecResult(ok=False, error=f"{type(exc).__name__}: {exc}")


def render_m_schema(db_path: str | Path = DEFAULT_DB, sample_values: int = 3) -> str:
    """Render an M-Schema description of the database for the prompt."""
    conn = connect(db_path)
    tables = [
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
    ]
    out: list[str] = ["【DB_ID】 otentiks", "【Schema】"]
    for t in tables:
        out.append(f"# Table: {t}")
        cols = conn.execute(f"PRAGMA table_info({t})").fetchall()
        fks = {
            row[3]: (row[2], row[4])
            for row in conn.execute(f"PRAGMA foreign_key_list({t})")
        }
        lines = []
        for cid, name, ctype, _notnull, _dflt, pk in cols:
            tags = []
            if pk:
                tags.append("PK")
            if name in fks:
                tags.append(f"FK->{fks[name][0]}.{fks[name][1]}")
            samples = conn.execute(
                f"SELECT DISTINCT {name} FROM {t} WHERE {name} IS NOT NULL LIMIT {sample_values}"
            ).fetchall()
            sample_str = ", ".join(repr(s[0]) for s in samples)
            tag_str = f" [{', '.join(tags)}]" if tags else ""
            lines.append(f"  ({name}: {ctype}{tag_str}, examples: {sample_str})")
        out.append("\n".join(lines))
    conn.close()
    return "\n".join(out)


if __name__ == "__main__":
    print(render_m_schema())
    print("\n-- demo query --")
    print(safe_execute("SELECT province, COUNT(*) FROM parks GROUP BY province"))
