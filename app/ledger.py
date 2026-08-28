from __future__ import annotations

import sqlite3
from decimal import Decimal
from typing import Any


def format_units(amount_base_units: int | str, decimals: int) -> str:
    amount = Decimal(str(amount_base_units))
    scale = Decimal(10) ** decimals
    return format(amount / scale, "f")


def usd_value_base_units(amount_base_units: int | str, decimals: int, price: Decimal) -> str:
    amount = Decimal(str(amount_base_units))
    scale = Decimal(10) ** decimals
    return format((amount / scale) * price, "f")


def ledger_balance(conn: sqlite3.Connection, network: str, symbol: str) -> int:
    row = conn.execute(
        """
        SELECT COALESCE(SUM(
            CASE
                WHEN direction = 'credit' THEN CAST(amount_base_units AS INTEGER)
                WHEN direction = 'debit' THEN -CAST(amount_base_units AS INTEGER)
                ELSE 0
            END
        ), 0) AS balance
        FROM ledger_entries
        WHERE network = ? AND asset_symbol = ?
        """,
        (network, symbol),
    ).fetchone()
    return int(row["balance"])


def insert_ledger_credit(conn: sqlite3.Connection, deposit_id: int, network: str, symbol: str, amount_base_units: str) -> bool:
    cur = conn.execute(
        """
        INSERT OR IGNORE INTO ledger_entries(
            network, asset_symbol, amount_base_units, direction, reference_type, reference_id
        )
        VALUES (?, ?, ?, 'credit', 'bridge_deposit', ?)
        """,
        (network, symbol, amount_base_units, deposit_id),
    )
    return cur.rowcount == 1


def recent_deposits(conn: sqlite3.Connection, limit: int = 25) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT *
        FROM bridge_deposits
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]
