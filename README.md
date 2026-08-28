# Nile Bridge Test Service

Isolated local-only Nile/TRON watcher for the address:

```text
TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt
```

This service is read-only. It does not request private keys, send transactions, broadcast withdrawals, or touch TitanArb.

## Runtime

- Service: `nile-bridge-test.service`
- Directory: `/srv/nile-bridge-test`
- Database: `/var/lib/nile-bridge-test/nile_bridge.sqlite3`
- Logs: `/var/log/nile-bridge-test/` and journald
- Bind: `127.0.0.1:8787`

## Configuration

Copy `.env.example` to `.env` and set:

```text
NILE_USDT_CONTRACT_ADDRESS=
```

If `NILE_USDT_CONTRACT_ADDRESS` is empty, TRC20 USDT indexing stays disabled and `/status` reports `disabled_missing_contract_address`.

## Local Commands

```bash
cd /srv/nile-bridge-test
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m compileall app
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8787
```

## Endpoints

```text
GET  /health
GET  /status
GET  /balance
GET  /deposits
POST /internal/poll-once
GET  /
```

## Safety Notes

- Nile testnet only.
- Integer base units only.
- TRX uses SUN, 6 decimals.
- TRC20 USDT is configurable by contract address and stores raw integer amounts plus decimals.
- Duplicate protection uses `UNIQUE(network, tx_hash, log_index, asset_symbol)`.
