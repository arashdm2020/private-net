# Nile Bridge TronLink dApp

Local-only static dApp for the isolated Nile bridge test backend.

```text
DApp: http://127.0.0.1:8790
Backend upstream: http://127.0.0.1:8787
Watched address: TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt
Nile USDT contract: TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf
```

The dApp uses TronLink for wallet/network reads and a local `/api/*` proxy for backend reads. The proxy avoids changing backend CORS and does not expose the backend publicly.

## TronLink Notes

`NILE_CHAIN_ID_HEX` is intentionally empty in `app.js`. Do not guess it silently. If programmatic switching is unavailable, use the manual flow:

1. Open TronLink.
2. Go to the network selector.
3. Select Nile Testnet.
4. Return to this dApp.
5. Click Refresh.

## Safety

- No private keys.
- No withdrawal flow.
- No transaction broadcast.
- Local bind only: `127.0.0.1:8790`.
