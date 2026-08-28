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
        _add_column_if_missing(conn, "watched_addresses", "account_id", "INTEGER")
        _add_column_if_missing(conn, "watched_addresses", "active", "INTEGER NOT NULL DEFAULT 1")
        _add_column_if_missing(conn, "bridge_deposits", "account_id", "INTEGER")
        _add_column_if_missing(conn, "ledger_entries", "account_id", "INTEGER")
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_unique_credit
            ON ledger_entries(reference_type, reference_id, asset_symbol, direction)
            """
        )
        conn.commit()


def seed_defaults(conn: sqlite3.Connection, network: str, watch_address: str, usdt_contract: str) -> None:
    account = create_account(conn, "test_account_001", "Test Account 001")
    conn.execute(
        """
        INSERT INTO watched_addresses(account_id, network, address, label, active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(network, address) DO UPDATE SET
            account_id = COALESCE(watched_addresses.account_id, excluded.account_id),
            label = COALESCE(watched_addresses.label, excluded.label),
            active = 1
        """,
        (account["id"], network, watch_address, "Nile bridge test watched address"),
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
    backfill_account_links(conn, network, watch_address)
    conn.commit()


def _add_column_if_missing(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def create_account(conn: sqlite3.Connection, account_ref: str, display_name: str) -> dict[str, Any]:
    conn.execute(
        """
        INSERT INTO accounts(account_ref, display_name)
        VALUES (?, ?)
        ON CONFLICT(account_ref) DO UPDATE SET display_name = excluded.display_name
        """,
        (account_ref, display_name),
    )
    conn.commit()
    row = conn.execute(
        "SELECT id, account_ref, display_name, created_at FROM accounts WHERE account_ref = ?",
        (account_ref,),
    ).fetchone()
    return dict(row)


def get_account(conn: sqlite3.Connection, account_ref: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT id, account_ref, display_name, created_at FROM accounts WHERE account_ref = ?",
        (account_ref,),
    ).fetchone()
    return dict(row) if row else None


def add_watched_address(
    conn: sqlite3.Connection,
    account_id: int,
    network: str,
    address: str,
    label: str | None,
) -> dict[str, Any]:
    conn.execute(
        """
        INSERT INTO watched_addresses(account_id, network, address, label, active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(network, address) DO UPDATE SET
            account_id = excluded.account_id,
            label = excluded.label,
            active = 1
        """,
        (account_id, network, address, label),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT id, account_id, network, address, label, active, created_at
        FROM watched_addresses
        WHERE network = ? AND address = ?
        """,
        (network, address),
    ).fetchone()
    return dict(row)


def account_for_address(conn: sqlite3.Connection, network: str, address: str) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT a.id, a.account_ref, a.display_name, w.label AS watched_address_label
        FROM watched_addresses w
        JOIN accounts a ON a.id = w.account_id
        WHERE w.network = ? AND w.address = ? AND w.active = 1
        """,
        (network, address),
    ).fetchone()
    return dict(row) if row else None


def backfill_account_links(conn: sqlite3.Connection, network: str, watch_address: str) -> None:
    conn.execute(
        """
        UPDATE bridge_deposits
        SET account_id = (
            SELECT account_id
            FROM watched_addresses
            WHERE network = bridge_deposits.network
              AND address = bridge_deposits.to_address
              AND active = 1
        )
        WHERE network = ?
          AND to_address = ?
          AND account_id IS NULL
        """,
        (network, watch_address),
    )
    conn.execute(
        """
        UPDATE ledger_entries
        SET account_id = (
            SELECT d.account_id
            FROM bridge_deposits d
            WHERE d.id = ledger_entries.reference_id
              AND ledger_entries.reference_type = 'bridge_deposit'
        )
        WHERE account_id IS NULL
          AND reference_type = 'bridge_deposit'
        """
    )


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
