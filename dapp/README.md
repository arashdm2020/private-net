# MyChain Bridge dApp

Compact TronLink connection page for the isolated test backend.

```text
DApp: http://195.200.14.38:8790
Backend upstream: http://127.0.0.1:8787
Watched address: TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt
Backend account: test_account_001
```

The public UI labels the test network as MyChain. The backend remains the isolated Nile watcher service and stays local-only behind the dApp proxy.

## UI

The page intentionally shows only:

- TronLink detected/not detected.
- Wallet connected/not connected.
- Network classification: MyChain, Mainnet, Shasta, or Unknown.
- Connect TronLink button.
- Switch to Nile Testnet button.
- Watched address.
- Backend online/offline and indexed account balance.
- Collapsed Advanced debug details.

Internal backend controls are not shown in the UI.

## TronLink

The dApp uses `eth_requestAccounts` as the primary connection method. `tron_requestAccounts` is kept only as a legacy fallback when the provider reports that the primary method is unsupported or unknown.

The injected `tronWeb` value is treated as an object/property, not as a function.

Programmatic network switching uses TronLink's `wallet_switchEthereumChain` request with:

```text
0xcd8690dc
```

If TronLink reports that the network is missing, the dApp attempts `wallet_addEthereumChain` for `TRON Nile Testnet`. If either method is unsupported, the page shows manual instructions. The expected endpoint is:

```text
https://nile.trongrid.io
```

## Safety

- No private keys.
- No withdrawal flow.
- No transaction broadcast.
- No visible internal poll or credit controls.
- Public dApp bind only: `0.0.0.0:8790`.
- Backend remains local-only: `127.0.0.1:8787`.
- `/api/internal/*` protection remains in `server.py`.
