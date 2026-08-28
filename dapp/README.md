# Nile Bridge TronLink dApp

Local-only static dApp for the isolated Nile bridge test backend.

```text
DApp: http://195.200.14.38:8790
Backend upstream: http://127.0.0.1:8787
Watched address: TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt
Nile USDT contract: TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf
```

The dApp uses TronLink for wallet/network reads and a local `/api/*` proxy for backend reads. The proxy avoids changing backend CORS and does not expose the backend publicly.

The frontend service binds publicly on `0.0.0.0:8790`. The backend stays local-only on `127.0.0.1:8787`.

`/api/internal/*` proxy routes require:

```text
X-DApp-Admin-Token: <DAPP_ADMIN_TOKEN>
```

Set the token in `/srv/nile-bridge-dapp/.env`; do not commit it.

## Dashboard

The dashboard shows:

- TronLink detected and connected state.
- Selected wallet and whether it matches the watched Nile address.
- Current TronLink network classification (`nile`, `mainnet`, `shasta`, or `unknown`), node hosts, and chainId when exposed by the provider.
- Backend indexed Nile global and `test_account_001` balances.
- Wallet-side TRX and USDT balances using read-only TronLink calls.
- Recent indexed deposits with account mapping and ledger status.
- Manual backend actions for polling and idempotent crediting.
- Collapsible raw JSON debug output.

## TronLink Connect Flow

The dApp prefers the modern provider at `window.tron` and connects with:

```text
eth_requestAccounts
```

`tron_requestAccounts` is kept only as a legacy fallback when the provider clearly reports that `eth_requestAccounts` is unsupported or unknown. User rejection is not retried with a fallback.

TronLink's injected `tronWeb` is treated as an object/property, not as an invokable function.

## TronLink Notes

`NILE_CHAIN_ID_HEX` is intentionally empty in `app.js`. Do not guess it silently. Programmatic switching is disabled; the Switch action opens the manual instructions.

1. Open TronLink.
2. Go to the network selector.
3. Select Nile Testnet.
4. If Nile is not listed, add or select the Nile testnet custom node if TronLink supports it.
5. Return to this dApp.
6. Click Refresh All.

The dApp treats `https://api.trongrid.io` as TRON Mainnet and expects a Nile endpoint such as `https://nile.trongrid.io` before enabling wallet-side USDT comparison against the backend Nile ledger.

## Safety

- No private keys.
- No withdrawal flow.
- No transaction broadcast.
- Public dApp bind only: `0.0.0.0:8790`.
- Backend remains local-only: `127.0.0.1:8787`.
