from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value


@dataclass(frozen=True)
class Settings:
    app_host: str
    app_port: int
    tron_network: str
    tron_full_host: str
    tronscan_nile_api: str
    watch_address: str
    nile_usdt_contract_address: str
    db_path: str
    poll_interval_seconds: int
    confirmations_required: int
    mock_price_usd_trx: Decimal
    mock_price_usd_usdt: Decimal

    @property
    def usdt_indexing_state(self) -> str:
        if self.nile_usdt_contract_address:
            return "enabled"
        return "disabled_missing_contract_address"


def load_settings() -> Settings:
    return Settings(
        app_host=_env("APP_HOST", "127.0.0.1"),
        app_port=int(_env("APP_PORT", "8787")),
        tron_network=_env("TRON_NETWORK", "nile"),
        tron_full_host=_env("TRON_FULL_HOST", "https://nile.trongrid.io").rstrip("/"),
        tronscan_nile_api=_env("TRONSCAN_NILE_API", "https://nileapi.tronscan.org").rstrip("/"),
        watch_address=_env("WATCH_ADDRESS", "TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt"),
        nile_usdt_contract_address=os.getenv("NILE_USDT_CONTRACT_ADDRESS", "").strip(),
        db_path=_env("DB_PATH", "/var/lib/nile-bridge-test/nile_bridge.sqlite3"),
        poll_interval_seconds=int(_env("POLL_INTERVAL_SECONDS", "20")),
        confirmations_required=int(_env("CONFIRMATIONS_REQUIRED", "3")),
        mock_price_usd_trx=Decimal(_env("MOCK_PRICE_USD_TRX", "0.12")),
        mock_price_usd_usdt=Decimal(_env("MOCK_PRICE_USD_USDT", "1.00")),
    )
