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

1. **eps-surprises** (`/:symbol/eps-surprises`) — closest commands all FMP-premium at
   current tier: `calendar.earnings` by symbol → 402, `fundamental.historical_eps` → 402,
   `estimates.historical` → 402. Research: FMP tier upgrade, direct Finnhub
   (`/stock/earnings`; raw capture already finnhub-shaped), or derive once
   `estimates.historical` unlocks. **Mock call stays meanwhile.**
2. **institutional ownership** (`/:symbol/ownership`) — `ownership.institutional` fmp →
   402 Restricted. Research: FMP upgrade, SEC 13F filings (`ownership.form_13f`),
   intrinio entitlements. **Mock call stays.**
3. **peers** (`/:symbol/peers`) — no peers command in OSS OpenBB. Research:
   sector/industry join over profiles, FMP `stock_peers` direct call.
4. **seasonality** (`/:symbol/seasonality`) — no equivalent. Candidate: compute from
   multi-year `price.historical` monthly aggregates (could be openst-side later).
5. **investor-relations events / transcripts** — `fundamental.transcript` exists as a
   command but provider support/premium status unverified. Research before relying on it.
   **Mock call stays.**

## Provider quirks worth remembering

- **intrinio**: nearly all probes fail with "Results not found" despite valid key —
  research key entitlements before adding it to any fallback chain beyond dividends.
- **nasdaq**: provider arg-shape mismatch for calendars in 4.7.1 (validation error).
- **calendar windows**: unfiltered calls are free; anything symbol-scoped is premium.
