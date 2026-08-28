from __future__ import annotations

import json
from typing import Any

import httpx


class TronNileClient:
    def __init__(self, full_host: str, tronscan_api: str, timeout_seconds: float = 10.0) -> None:
        self.full_host = full_host.rstrip("/")
        self.tronscan_api = tronscan_api.rstrip("/")
        self.timeout = timeout_seconds

    async def get_latest_block_number(self) -> int | None:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(f"{self.full_host}/wallet/getnowblock", json={}, headers={"Accept": "application/json"})
            resp.raise_for_status()
            data = resp.json()
        header = data.get("block_header", {}).get("raw_data", {})
        number = header.get("number")
        return int(number) if number is not None else None

    async def get_account_balance_sun(self, address: str) -> int | None:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.full_host}/wallet/getaccount",
                json={"address": address, "visible": True},
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
        balance = data.get("balance")
        return int(balance) if balance is not None else 0

    async def get_native_transactions(self, address: str, limit: int = 50) -> list[dict[str, Any]]:
        url = f"{self.full_host}/v1/accounts/{address}/transactions"
        params = {"only_to": "true", "limit": str(limit), "order_by": "block_timestamp,desc"}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, params=params, headers={"Accept": "application/json"})
            resp.raise_for_status()
            data = resp.json()
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]
        return []

    async def get_trc20_transactions(self, address: str, contract_address: str, limit: int = 50) -> list[dict[str, Any]]:
        url = f"{self.full_host}/v1/accounts/{address}/transactions/trc20"
        params = {
            "only_to": "true",
            "contract_address": contract_address,
            "limit": str(limit),
            "order_by": "block_timestamp,desc",
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, params=params, headers={"Accept": "application/json"})
            resp.raise_for_status()
            data = resp.json()
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]
        return []

    @staticmethod
    def native_transfer_from_tx(tx: dict[str, Any], watch_address: str, latest_block: int | None) -> dict[str, Any] | None:
        tx_id = tx.get("txID") or tx.get("tx_id")
        raw_data = tx.get("raw_data") or {}
        contracts = raw_data.get("contract") or []
        block_number = tx.get("blockNumber") or tx.get("block_number")
        for contract in contracts:
            if contract.get("type") != "TransferContract":
                continue
            value = contract.get("parameter", {}).get("value", {})
            to_address = value.get("to_address")
            amount = value.get("amount")
            if to_address != watch_address or amount is None or tx_id is None:
                continue
            confirmations = None
            if latest_block is not None and block_number is not None:
                confirmations = max(0, latest_block - int(block_number) + 1)
            return {
                "network": "nile",
                "asset_symbol": "TRX",
                "asset_type": "native",
                "contract_address": None,
                "tx_hash": tx_id,
                "log_index": 0,
                "from_address": value.get("owner_address"),
                "to_address": to_address,
                "amount_base_units": str(int(amount)),
                "decimals": 6,
                "block_number": int(block_number) if block_number is not None else None,
                "confirmations": confirmations,
                "raw_json": json.dumps(tx, sort_keys=True),
            }
        return None

    @staticmethod
    def trc20_transfer_from_tx(
        tx: dict[str, Any],
        watch_address: str,
        contract_address: str,
        latest_block: int | None,
    ) -> dict[str, Any] | None:
        tx_id = tx.get("transaction_id") or tx.get("txID") or tx.get("hash")
        to_address = tx.get("to")
        token_info = tx.get("token_info") or {}
        tx_contract = tx.get("token_info", {}).get("address") or tx.get("contract_address") or tx.get("token_address")
        if to_address != watch_address or not tx_id:
            return None
        if tx_contract and tx_contract != contract_address:
            return None
        value = tx.get("value")
        if value is None:
            return None
        decimals = int(token_info.get("decimals") or tx.get("decimals") or 6)
        block_number = tx.get("block_number") or tx.get("blockNumber")
        confirmations = None
        if latest_block is not None and block_number is not None:
            confirmations = max(0, latest_block - int(block_number) + 1)
        log_index = int(tx.get("log_index") or tx.get("event_index") or 0)
        return {
            "network": "nile",
            "asset_symbol": "USDT",
            "asset_type": "trc20",
            "contract_address": contract_address,
            "tx_hash": tx_id,
            "log_index": log_index,
            "from_address": tx.get("from"),
            "to_address": to_address,
            "amount_base_units": str(int(value)),
            "decimals": decimals,
            "block_number": int(block_number) if block_number is not None else None,
            "confirmations": confirmations,
            "raw_json": json.dumps(tx, sort_keys=True),
        }
