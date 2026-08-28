# MyChain Bridge dApp

Compact multi-wallet connection page for the isolated test backend.

```text
DApp: http://195.200.14.38:8790
Backend upstream: http://127.0.0.1:8787
TRON watched address: TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt
Backend account: test_account_001
```

The backend remains the isolated Nile/TRON watcher service and stays local-only behind the dApp proxy. The public dApp URL is not a blockchain RPC endpoint, and the backend URL is not a blockchain RPC endpoint.

## Wallet Modes

TRON / TronLink mode works now:

- Uses `window.tron` first.
- Uses `eth_requestAccounts` as the primary connect method.
- Uses `window.tronLink` and `tron_requestAccounts` only as compatibility fallback.
- Treats injected `tronWeb` as an object/property, not as a function.
- Shows backend indexed Nile balance for `test_account_001`.

Current TRON test configuration:

```text
MYCHAIN_TRON_MODE_NAME=MyChain test mode
MYCHAIN_TRON_EXPECTED_ENDPOINT=https://nile.trongrid.io
MYCHAIN_TRON_CHAIN_ID_HEX=0xcd8690dc
MYCHAIN_TRON_USDT_CONTRACT=TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf
MYCHAIN_TRON_WATCHED_ADDRESS=TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt
```

EVM / MetaMask-compatible mode is scaffolded:

- Detects `window.ethereum`.
- Supports dependency-free EIP-6963 provider discovery.
- Shows provider flags for MetaMask, Trust Wallet, Rabby, and Coinbase Wallet in Advanced debug.
- Allows basic EVM wallet connection when an injected provider exists.
- Does not enable MyChain EVM network switching until real EVM RPC config exists.

EVM placeholders:

```text
MYCHAIN_EVM_ENABLED=false
MYCHAIN_EVM_CHAIN_NAME=MyChain EVM
MYCHAIN_EVM_CHAIN_ID_HEX=
MYCHAIN_EVM_RPC_URL=
MYCHAIN_EVM_EXPLORER_URL=
MYCHAIN_EVM_NATIVE_SYMBOL=TRX
MYCHAIN_EVM_NATIVE_DECIMALS=18
```

To enable EVM mode later, set a real EVM chain id and RPC URL. Do not use `http://127.0.0.1:8787` or `http://195.200.14.38:8790` as EVM RPC URLs; they are the backend API and dApp server, not blockchain nodes.

## UI

The page intentionally stays compact:

- Wallet mode selector.
- One connect button.
- One network info/add-switch button.
- Refresh button.
- Minimal wallet/network/backend status.
- Collapsed Advanced debug details.

Internal backend controls are not shown in the UI.

## Safety

- No private keys.
- No withdrawal flow.
- No transaction broadcast.
- No visible internal poll or credit controls.
- Public dApp bind only: `0.0.0.0:8790`.
- Backend remains local-only: `127.0.0.1:8787`.
- `/api/internal/*` protection remains in `server.py`.
