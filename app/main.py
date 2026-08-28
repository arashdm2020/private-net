from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .config import Settings, load_settings
from pydantic import BaseModel

from .ledger import (
    account_balance_payload,
    balance_payload,
    credit_detected_deposits,
    format_units,
    ledger_balance,
    recent_deposits,
    usd_value_base_units,
)
from .tron_nile import TronNileClient
from .watcher import Watcher


load_dotenv("/srv/nile-bridge-test/.env")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
settings: Settings = load_settings()
db.migrate(settings.db_path)
with db.connect(settings.db_path) as conn:
    db.seed_defaults(conn, settings.tron_network, settings.watch_address, settings.nile_usdt_contract_address)

started_at = time.monotonic()
watcher = Watcher(settings)
watcher_task: asyncio.Task[Any] | None = None


class AccountCreate(BaseModel):
    account_ref: str
    display_name: str


class WatchedAddressCreate(BaseModel):
    network: str
    address: str
    label: str | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global watcher_task
    watcher_task = asyncio.create_task(watcher.run_forever())
    yield
    watcher.stop()
    if watcher_task is not None:
        await watcher_task


app = FastAPI(title="Nile Bridge Test", lifespan=lifespan)
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(static_dir / "index.html")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "nile-bridge-test"}


@app.get("/status")
async def status() -> dict[str, Any]:
    with db.connect(settings.db_path) as conn:
        state = db.get_state(conn)
        errors = db.recent_errors(conn, 3)
    return {
        "service": "nile-bridge-test",
        "network": settings.tron_network,
        "watch_address": settings.watch_address,
        "tron_full_host": settings.tron_full_host,
        "tronscan_nile_api": settings.tronscan_nile_api,
        "nile_usdt_contract_configured": bool(settings.nile_usdt_contract_address),
        "usdt_indexing_state": settings.usdt_indexing_state,
        "watcher_state": watcher.state,
        "last_poll_time": watcher.last_poll_time or state.get("last_poll_time"),
        "last_error": watcher.last_error or state.get("last_error") or None,
        "db_path": settings.db_path,
        "uptime_seconds": int(time.monotonic() - started_at),
        "recent_errors": errors,
    }


@app.get("/balance")
async def balance() -> dict[str, Any]:
    client = TronNileClient(settings.tron_full_host, settings.tronscan_nile_api)
    native_balance_error = None
    try:
        native_trx_balance_sun = await client.get_account_balance_sun(settings.watch_address)
    except Exception as exc:  # noqa: BLE001 - exposed as read-only status.
        native_trx_balance_sun = None
        native_balance_error = str(exc)

    with db.connect(settings.db_path) as conn:
        internal_trx = ledger_balance(conn, settings.tron_network, "TRX")
        internal_usdt = ledger_balance(conn, settings.tron_network, "USDT")
        account_rows = conn.execute(
            "SELECT id, account_ref, display_name, created_at FROM accounts ORDER BY id"
        ).fetchall()
        account_balances = [
            {
                "account_id": row["id"],
                "account_ref": row["account_ref"],
                "display_name": row["display_name"],
                "balances": account_balance_payload(
                    conn,
                    row["id"],
                    settings.tron_network,
                    settings.mock_price_usd_trx,
                    settings.mock_price_usd_usdt,
                ),
            }
            for row in account_rows
        ]

    return {
        "network": settings.tron_network,
        "watch_address": settings.watch_address,
        "global": {
            "TRX": balance_payload(internal_trx, 6, settings.mock_price_usd_trx),
            "USDT": {
                **balance_payload(internal_usdt, 6, settings.mock_price_usd_usdt),
                "indexing_state": settings.usdt_indexing_state,
            },
        },
        "accounts": account_balances,
        "native_trx_balance": {
            "available": native_trx_balance_sun is not None,
            "amount_base_units": str(native_trx_balance_sun) if native_trx_balance_sun is not None else None,
            "decimals": 6,
            "human": format_units(native_trx_balance_sun, 6) if native_trx_balance_sun is not None else None,
            "mock_usd": usd_value_base_units(native_trx_balance_sun, 6, settings.mock_price_usd_trx)
            if native_trx_balance_sun is not None
            else None,
            "error": native_balance_error,
        },
        "indexed_internal_balances": {
            "TRX": {
                "amount_base_units": str(internal_trx),
                "decimals": 6,
                "human": format_units(internal_trx, 6),
                "mock_usd": usd_value_base_units(internal_trx, 6, settings.mock_price_usd_trx),
            },
            "USDT": {
                "amount_base_units": str(internal_usdt),
                "decimals": 6,
                "human": format_units(internal_usdt, 6),
                "mock_usd": usd_value_base_units(internal_usdt, 6, settings.mock_price_usd_usdt),
                "indexing_state": settings.usdt_indexing_state,
            },
        },
    }


@app.get("/deposits")
async def deposits(limit: int = 25) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 100))
    with db.connect(settings.db_path) as conn:
        rows = recent_deposits(conn, safe_limit)
    return {"network": settings.tron_network, "deposits": rows}


@app.post("/internal/poll-once")
async def poll_once() -> dict[str, Any]:
    return await watcher.poll_once()


@app.post("/internal/credit-detected")
async def credit_detected() -> dict[str, Any]:
    with db.connect(settings.db_path) as conn:
        return credit_detected_deposits(
            conn,
            settings.tron_network,
            settings.watch_address,
            settings.nile_usdt_contract_address,
        )


@app.get("/accounts")
async def accounts() -> dict[str, Any]:
    with db.connect(settings.db_path) as conn:
        rows = conn.execute(
            "SELECT id, account_ref, display_name, created_at FROM accounts ORDER BY id"
        ).fetchall()
        result = []
        for row in rows:
            watched = conn.execute(
                """
                SELECT id, network, address, label, active, created_at
                FROM watched_addresses
                WHERE account_id = ?
                ORDER BY id
                """,
                (row["id"],),
            ).fetchall()
            result.append(
                {
                    "account_id": row["id"],
                    "account_ref": row["account_ref"],
                    "display_name": row["display_name"],
                    "created_at": row["created_at"],
                    "watched_addresses": [dict(item) for item in watched],
                    "balances": account_balance_payload(
                        conn,
                        row["id"],
                        settings.tron_network,
                        settings.mock_price_usd_trx,
                        settings.mock_price_usd_usdt,
                    ),
                }
            )
    return {"accounts": result}


@app.get("/accounts/{account_ref}/balance")
async def account_balance(account_ref: str) -> dict[str, Any]:
    with db.connect(settings.db_path) as conn:
        account = db.get_account(conn, account_ref)
        if account is None:
            return {"status": "not_found", "account_ref": account_ref}
        return {
            "account_id": account["id"],
            "account_ref": account["account_ref"],
            "display_name": account["display_name"],
            "balances": account_balance_payload(
                conn,
                account["id"],
                settings.tron_network,
                settings.mock_price_usd_trx,
                settings.mock_price_usd_usdt,
            ),
        }


@app.post("/internal/accounts")
async def create_account(payload: AccountCreate) -> dict[str, Any]:
    with db.connect(settings.db_path) as conn:
        return db.create_account(conn, payload.account_ref, payload.display_name)


@app.post("/internal/accounts/{account_ref}/watched-addresses")
async def add_account_watched_address(account_ref: str, payload: WatchedAddressCreate) -> dict[str, Any]:
    with db.connect(settings.db_path) as conn:
        account = db.get_account(conn, account_ref)
        if account is None:
            return {"status": "not_found", "account_ref": account_ref}
        watched = db.add_watched_address(conn, account["id"], payload.network, payload.address, payload.label)
        return {"status": "ok", "watched_address": watched}
