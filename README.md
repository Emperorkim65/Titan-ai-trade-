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


## Historical strategy backtesting
- `GET /api/backtest?symbol=R_100&granularity=60&count=1200&trainRatio=0.7&costBps=1`
- Supported history size: 300–5,000 candles. Supported granularities: 60, 300, 900, 3,600 seconds.
- Compare EMA-only, Fractal-only, and Combined Balanced strategies.
- Chronological 70/30 split by default; configurable 60/40 through 85/15. Indicators in the test segment may use prior training candles for warm-up, but test trades are opened only at/after the split.
- Signals are formed at candle close and entered at the next candle open. Stop distance is 1.5 ATR, target is 2R, and maximum holding period is 50 bars. If stop and target are both touched within one candle, the simulator assumes the stop was hit first.
- Position risk defaults to 1% of current simulated equity. Estimated transaction cost defaults to 1 basis point per side and can be changed with `costBps`; this is a percentage proxy, not a broker's actual spread/commission schedule.
- Reports trades, win rate, profit factor, net return, maximum drawdown, expectancy, and trade samples separately for in-sample and out-of-sample periods.
- Forex symbols currently exposed in the market list include EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, NZD/USD, EUR/GBP, EUR/JPY, GBP/JPY and XAU/USD. Deriv availability varies by account/market session.
- The dashboard's basket button tests EUR/USD, Boom 1000, Crash 1000 and Volatility 100.

The backtest is a research tool, not a claim of predictive accuracy. It does not model all broker-specific spread, swaps, latency, slippage, rejected orders, tick-level stop ordering, or market impact. Run multiple periods and symbols, inspect OOS trade counts and drawdown, and do not optimize against the OOS segment. No live execution is enabled.

## Adaptive intelligence ensemble
- `GET /api/adaptive/analyze?symbol=R_100&granularity=60&count=650`
- Requires 400–1,500 candles. The dashboard includes a button to run this analysis for the selected market and timeframe.
- Calculates EMA-only, fractal-only, and combined signals, then weights them using prior-history in-sample backtest expectancy, profit factor, drawdown, and trade-count reliability.
- The newest candle is excluded from calibration. The out-of-sample period is not used to set the weights. When the historical sample is too small or has no positive evidence, the engine falls back to equal weights.
- Returns component votes, normalized weights, model score, and BUY/SELL/WAIT. This is a ranking signal only; it does not place orders.
- The weights are a heuristic ensemble calibration, not machine-learning training and not a probability of profit. Validate on additional unseen periods and symbols before relying on it.
