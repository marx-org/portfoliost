# openst provider coverage (verified 2026-08-23)

Ground truth from probing **OpenBB 4.7.1** inside the openst image with the current
keys (`FMP_API_KEY` starter tier, yfinance, sec; intrinio key present but broken).

## Covered by openst today

| Instruments need | openst route | OpenBB command | Providers that worked | Notes |
| --- | --- | --- | --- | --- |
| profile | `/equity/profile/{t}` | `equity.profile` | fmp, yfinance | fmp richer (cik/cusip/ceo/employees); intrinio errors |
| quote | `/equity/quote/{t}` | `price.quote` | fmp, yfinance | change/change_percent/market_cap/year_high… |
| history (OHLCV) | `/price/ohlcv/{t}?start&end` | `price.historical` | yfinance, fmp, intrinio | daily bars; legacy close-only `/price/history` kept |
| fundamentals | `/equity/fundamentals/{t}?statement=income\|balance\|cash&period=annual\|quarter` | `fundamental.income/balance/cash` | fmp, yfinance | full statements, fiscal metadata incl. |
| metrics (+overview subset) | `/equity/metrics/{t}` | `fundamental.metrics` | yfinance, fmp | market_cap, pe_ratio, margins, ratios… |
| projections | `/equity/projections/{t}` | `estimates.consensus` | fmp, yfinance | target_consensus/high/low/median; yfinance adds recommendation + analyst count |
| calendar (earnings) | `/equity/calendar/earnings?start&end` | `calendar.earnings` | fmp only | **unfiltered window** (all symbols); per-symbol filter = premium (402) |
| calendar (dividends) | `/equity/calendar/dividend?start&end` | `calendar.dividend` | fmp only | declaration/ex-div/record/payment dates |
| dividends (existing) | `/dividend/yield/{t}`, `/dividend/history/{t}` | `fundamental.metrics`, `fundamental.dividends` | yfinance, fmp, … | unchanged |
| search | `/equity/search/{q}` | `equity.search` | sec | returns `{cik,name,symbol}` |

## Missing — needs research

Status after I8b (2026-08-23): four of the five gaps were closed by deriving
content inside the instruments module; only ownership still waits on a
provider.

1. **eps-surprises** (`/:symbol/eps-surprises`) — RESOLVED by derivation
   (I8b): quarterly income statements give actual EPS/revenue; estimates use
   the prior-year quarter as a baseline. True analyst estimates still need an
   FMP upgrade or Finnhub.
2. **institutional ownership** (`/:symbol/ownership`) — STILL OPEN.
   `ownership.institutional` fmp → 402 Restricted; intrinio v2 key returns 401.
   Real module serves valid empty content meanwhile. Research: FMP upgrade,
   SEC 13F filings (`ownership.form_13f`), intrinio entitlements.
3. **peers** (`/:symbol/peers`) — RESOLVED by composition (I8b): same-sector
   compare rows over a curated large-cap candidate pool with live sector
   profiles. FMP `stock_peers` remains the research path for true broker peers.
4. **seasonality** (`/:symbol/seasonality`) — RESOLVED in module (I8b):
   monthly last-closes from multi-year OHLCV → avg/median/min/max.
5. **investor-relations events / transcripts** — RESOLVED partially (I8b):
   events derived from real reported quarters; transcript endpoint returns a
   structured stub (`fundamental.transcript` is FMP-only/premium, no audio).

## Provider quirks worth remembering

- **intrinio**: nearly all probes fail with "Results not found" despite valid key —
  research key entitlements before adding it to any fallback chain beyond dividends.
- **nasdaq**: provider arg-shape mismatch for calendars in 4.7.1 (validation error).
- **calendar windows**: unfiltered calls are free; anything symbol-scoped is premium.
