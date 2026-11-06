# TITAN AI TRADER

A responsive HTML dashboard with a Node.js analysis API. It requests public Deriv candle history and calculates EMA 9/21/50, RSI 14, and ATR 14.

## Run locally
1. Install Node.js 20 or later.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:10000`.

## API
- `GET /api/health`
- `GET /api/config`
- `GET /api/analyze?symbol=R_100&granularity=60`
- `POST /webhook/tradingview` (requires the `x-titan-secret` header)

Supported granularities: 60, 300, 900, 3600 seconds.

## TradingView webhook
Set `TRADINGVIEW_WEBHOOK_SECRET` in the hosting environment and send the same secret in the `x-titan-secret` header. Alerts are logged for analysis only. No order execution is implemented.

## Important
This software is an educational technical-analysis tool, not financial advice. Signals are not guaranteed and no win rate is promised. Verify signals and test carefully. This version does not execute trades or connect to a funded account.

## Balanced Fractal Market Intelligence
The backend includes a Weierstrass-inspired, finite multi-scale analysis module. It estimates a Hurst-style scaling exponent and graph fractal-dimension proxy from log-price increments, then combines directional evidence across 1/2/4/8/16-candle horizons. This is an empirical market-structure feature inspired by multi-scale mathematics; it is not a literal reconstruction of the classical Weierstrass function.

- `GET /api/fractal/analyze?symbol=R_100&granularity=60` returns the fractal-only analysis.
- `GET /api/analyze?symbol=R_100&granularity=60` includes the fractal report and requires balanced fractal confirmation before returning BUY/SELL. Otherwise it returns WAIT without trade levels.
- Balanced confirmation requires matching directional bias, at least 52 model-confidence points, and a non-extreme estimated fractal dimension.
- `npm test` runs deterministic unit tests.

The confidence value is a model score, not a probability of profit or a measured win rate. Validate with out-of-sample and walk-forward backtests before using signals. Trade execution remains disabled; alerts and analysis do not place orders.
