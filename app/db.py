from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def connect(db_path: str) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def migrate(db_path: str) -> None:
    with connect(db_path) as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def seed_defaults(conn: sqlite3.Connection, network: str, watch_address: str, usdt_contract: str) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO watched_addresses(network, address, label)
        VALUES (?, ?, ?)
        """,
        (network, watch_address, "Nile bridge test watched address"),
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO assets(network, symbol, asset_type, contract_address, decimals)
        VALUES (?, 'TRX', 'native', NULL, 6)
        """,
        (network,),
    )
    if usdt_contract:
        conn.execute(
            """
            INSERT OR IGNORE INTO assets(network, symbol, asset_type, contract_address, decimals)
            VALUES (?, 'USDT', 'trc20', ?, 6)
            """,
            (network, usdt_contract),
        )
    conn.commit()


def set_state(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        """
        INSERT INTO app_state(key, value, updated_at)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        """,
        (key, value),
    )
    conn.commit()


def get_state(conn: sqlite3.Connection) -> dict[str, str]:
    rows = conn.execute("SELECT key, value FROM app_state ORDER BY key").fetchall()
    return {row["key"]: row["value"] for row in rows}


def record_error(conn: sqlite3.Connection, network: str, message: str, raw: Any | None = None) -> None:
    conn.execute(
        """
        INSERT INTO watcher_errors(network, error_message, raw_json)
        VALUES (?, ?, ?)
        """,
        (network, message, json.dumps(raw, sort_keys=True) if raw is not None else None),
    )
    set_state(conn, "last_error", message)


def recent_errors(conn: sqlite3.Connection, limit: int = 5) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT network, error_message, raw_json, created_at
        FROM watcher_errors
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]
