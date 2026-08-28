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


def credit_detected_deposits(
    conn: sqlite3.Connection,
    network: str,
    watch_address: str,
    usdt_contract_address: str,
) -> dict[str, Any]:
    rows = conn.execute(
        """
        SELECT id, network, asset_symbol, asset_type, contract_address, to_address,
               amount_base_units, decimals, status, confirmed_at
        FROM bridge_deposits
        WHERE network = ?
          AND status IN ('detected', 'confirmed')
          AND to_address = ?
          AND (
            (asset_symbol = 'TRX' AND lower(asset_type) = 'native')
            OR (
              asset_symbol = 'USDT'
              AND lower(asset_type) = 'trc20'
              AND contract_address = ?
            )
          )
        ORDER BY id ASC
        """,
        (network, watch_address, usdt_contract_address),
    ).fetchall()

    credited: dict[str, dict[str, Any]] = {}
    duplicates_skipped = 0
    for row in rows:
        symbol = row["asset_symbol"]
        amount = str(row["amount_base_units"])
        inserted = insert_ledger_credit(conn, int(row["id"]), network, symbol, amount)
        if inserted:
            conn.execute(
                """
                UPDATE bridge_deposits
                SET status = 'credited',
                    confirmed_at = COALESCE(confirmed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                WHERE id = ?
                """,
                (row["id"],),
            )
            bucket = credited.setdefault(
                symbol,
                {"count": 0, "amount_base_units": "0", "human": "0", "decimals": int(row["decimals"])},
            )
            bucket["count"] += 1
            bucket["amount_base_units"] = str(int(bucket["amount_base_units"]) + int(amount))
            bucket["human"] = format_units(bucket["amount_base_units"], int(row["decimals"]))
        else:
            duplicates_skipped += 1
            conn.execute(
                """
                UPDATE bridge_deposits
                SET status = 'credited',
                    confirmed_at = COALESCE(confirmed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                WHERE id = ?
                """,
                (row["id"],),
            )
    conn.commit()
    for bucket in credited.values():
        bucket.pop("decimals", None)
    return {"status": "ok", "credited": credited, "duplicates_skipped": duplicates_skipped}


def recent_deposits(conn: sqlite3.Connection, limit: int = 25) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT d.*,
               CASE WHEN l.id IS NULL THEN 0 ELSE 1 END AS ledger_entry_exists
        FROM bridge_deposits d
        LEFT JOIN ledger_entries l
          ON l.reference_type = 'bridge_deposit'
         AND l.reference_id = d.id
         AND l.asset_symbol = d.asset_symbol
         AND l.direction = 'credit'
        ORDER BY d.id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]
