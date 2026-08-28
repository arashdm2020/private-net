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
from .ledger import credit_detected_deposits, format_units, ledger_balance, recent_deposits, usd_value_base_units
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

    return {
        "network": settings.tron_network,
        "watch_address": settings.watch_address,
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
