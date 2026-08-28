from __future__ import annotations

import asyncio
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any

from . import db
from .config import Settings
from .ledger import credit_detected_deposits
from .tron_nile import TronNileClient


logger = logging.getLogger("nile_bridge_test.watcher")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Watcher:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = TronNileClient(settings.tron_full_host, settings.tronscan_nile_api)
        self.state = "starting"
        self.last_poll_time: str | None = None
        self.last_error: str | None = None
        self._stop = asyncio.Event()
        self._lock = asyncio.Lock()

    def stop(self) -> None:
        self._stop.set()

    async def run_forever(self) -> None:
        self.state = "running"
        while not self._stop.is_set():
            await self.poll_once()
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.settings.poll_interval_seconds)
            except asyncio.TimeoutError:
                pass
        self.state = "stopped"

    async def poll_once(self) -> dict[str, Any]:
        async with self._lock:
            self.state = "polling"
            self.last_poll_time = utc_now()
            inserted = {"TRX": 0, "USDT": 0}
            logger.info("poll_started address=%s network=%s", self.settings.watch_address, self.settings.tron_network)
            try:
                with db.connect(self.settings.db_path) as conn:
                    db.seed_defaults(
                        conn,
                        self.settings.tron_network,
                        self.settings.watch_address,
                        self.settings.nile_usdt_contract_address,
                    )
                    db.set_state(conn, "watcher_state", "polling")
                    db.set_state(conn, "last_poll_time", self.last_poll_time)

                latest_block = await self.client.get_latest_block_number()
                native_txs = await self.client.get_native_transactions(self.settings.watch_address)
                native_events = [
                    event
                    for tx in native_txs
                    if (event := self.client.native_transfer_from_tx(tx, self.settings.watch_address, latest_block))
                ]
                inserted["TRX"] = self._store_events(native_events)

                if self.settings.nile_usdt_contract_address:
                    trc20_txs = await self.client.get_trc20_transactions(
                        self.settings.watch_address,
                        self.settings.nile_usdt_contract_address,
                    )
                    trc20_events = [
                        event
                        for tx in trc20_txs
                        if (
                            event := self.client.trc20_transfer_from_tx(
                                tx,
                                self.settings.watch_address,
                                self.settings.nile_usdt_contract_address,
                                latest_block,
                            )
                        )
                    ]
                    inserted["USDT"] = self._store_events(trc20_events)
                    usdt_state = "enabled"
                else:
                    usdt_state = "disabled_missing_contract_address"

                with db.connect(self.settings.db_path) as conn:
                    credited = credit_detected_deposits(
                        conn,
                        self.settings.tron_network,
                        self.settings.watch_address,
                        self.settings.nile_usdt_contract_address,
                    )

                self.last_error = None
                self.state = "idle"
                with db.connect(self.settings.db_path) as conn:
                    db.set_state(conn, "watcher_state", "idle")
                    db.set_state(conn, "last_error", "")
                    db.set_state(conn, "usdt_indexing_state", usdt_state)
                logger.info(
                    "poll_completed inserted_trx=%s inserted_usdt=%s usdt_indexing_state=%s latest_block=%s",
                    inserted["TRX"],
                    inserted["USDT"],
                    usdt_state,
                    latest_block,
                )
                return {
                    "status": "ok",
                    "inserted": inserted,
                    "credited": credited["credited"],
                    "duplicates_skipped": credited["duplicates_skipped"],
                    "usdt_indexing_state": usdt_state,
                    "latest_block": latest_block,
                }
            except Exception as exc:  # noqa: BLE001 - service records operational errors.
                self.last_error = str(exc)
                self.state = "error"
                with db.connect(self.settings.db_path) as conn:
                    db.record_error(conn, self.settings.tron_network, str(exc), {"type": type(exc).__name__})
                    db.set_state(conn, "watcher_state", "error")
                logger.exception("poll_failed error=%s", exc)
                return {"status": "error", "error": str(exc), "inserted": inserted}

    def _store_events(self, events: list[dict[str, Any]]) -> int:
        inserted = 0
        with db.connect(self.settings.db_path) as conn:
            for event in events:
                status = self._status_for_confirmations(event.get("confirmations"))
                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO bridge_deposits(
                        network, asset_symbol, asset_type, contract_address, tx_hash, log_index,
                        from_address, to_address, amount_base_units, decimals, block_number,
                        confirmations, status, raw_json, confirmed_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        self.settings.tron_network,
                        event["asset_symbol"],
                        event["asset_type"],
                        event.get("contract_address"),
                        event["tx_hash"],
                        event["log_index"],
                        event.get("from_address"),
                        event["to_address"],
                        event["amount_base_units"],
                        event["decimals"],
                        event.get("block_number"),
                        event.get("confirmations"),
                        status,
                        event["raw_json"],
                        utc_now() if status == "confirmed" else None,
                    ),
                )
                if cur.rowcount == 1:
                    inserted += 1
            conn.commit()
        return inserted

    def _status_for_confirmations(self, confirmations: int | None) -> str:
        if confirmations is None:
            return "detected"
        if confirmations >= self.settings.confirmations_required:
            return "confirmed"
        return "pending"
