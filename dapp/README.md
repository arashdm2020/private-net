# MyChain Bridge dApp

Compact multi-wallet connection page for the isolated test backend.

```text
DApp: http://195.200.14.38:8790
Backend upstream: http://127.0.0.1:8787
TRON watched address: TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt
Backend account: test_account_001
```

## Current Deployment Status

MyChain TRON/private-chain infrastructure is not deployed yet.

- `195.200.14.38:8790` is the dApp frontend URL, not a blockchain RPC.
- `127.0.0.1:8787` is the internal watcher/ledger backend, not a blockchain RPC.
- The current TRON flow uses Nile Testnet only for watcher and ledger testing.
- MyChain EVM test RPC is available at `http://195.200.14.38:8545`.

Planned MyChain network config:

```text
If EVM:
Network name: MyChain
RPC URL: http://195.200.14.38:8545
Chain ID: 0x13527dc
Symbol: TRX
Explorer: TBD

If TRON private chain:
FullNode: http://195.200.14.38:<fullnode-port>
SolidityNode: http://195.200.14.38:<solidity-port>
EventServer: http://195.200.14.38:<event-port>

Status: Not deployed yet.
```

## Wallet Modes

TRON / TronLink mode works now:

- Uses `window.tron` first.
- Uses `eth_requestAccounts` as the primary connect method.
- Uses `window.tronLink` and `tron_requestAccounts` only as compatibility fallback.
- Treats injected `tronWeb` as an object/property, not as a function.
- Shows backend indexed Nile balance for `test_account_001`.
- Shows the wallet network as Nile Testnet when the endpoint is `https://nile.trongrid.io`.

EVM / MetaMask-compatible mode is enabled for wallet network testing:

- Detects `window.ethereum`.
- Supports dependency-free EIP-6963 provider discovery.
- Shows provider flags for MetaMask, Trust Wallet, Rabby, and Coinbase Wallet in Advanced debug.
- Allows basic EVM wallet connection when an injected provider exists.
- Uses `wallet_addEthereumChain` and `wallet_switchEthereumChain` with the public MyChain EVM RPC.

EVM placeholders:

```text
MYCHAIN_EVM_ENABLED=true
MYCHAIN_EVM_CHAIN_NAME=MyChain EVM
MYCHAIN_EVM_CHAIN_ID_HEX=0x13527dc
MYCHAIN_EVM_RPC_URL=http://195.200.14.38:8545
MYCHAIN_EVM_EXPLORER_URL=
MYCHAIN_EVM_NATIVE_SYMBOL=TRX
MYCHAIN_EVM_NATIVE_DECIMALS=18
```

Do not use `http://127.0.0.1:8787` or `http://195.200.14.38:8790` as EVM RPC URLs.

## UI

The page intentionally stays compact:

- Wallet mode selector.
- One connect button.
- Network Setup Status button.
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
