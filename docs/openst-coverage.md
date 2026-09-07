# openst provider coverage (verified 2026-09-07)

Ground truth from probing **OpenBB 4.7.2** (with `openbb-sec==1.6.7` pinned) inside
the openst image with the current keys (`FMP_API_KEY` starter tier, yfinance, sec;
intrinio key present but broken). sec is keyless (SEC EDGAR).

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
| insider trading | `/equity/ownership/{t}` | `ownership.insider_trading` | sec | Form 4 (director/officer buys & sells); keyless |
| institutional ownership | `/equity/ownership/institutional/{t}` | `ownership.form_13f` | sec | Form 13F quarterly holdings; SEC-only, keyless |
| filings | `/equity/filings/{t}` | `fundamental.filings` | sec | EDGAR filing index (10-K, 10-Q, 8-K) + report URLs |
| management discussion | `/equity/fundamentals/{t}/mda` | `fundamental.management_discussion_analysis` | sec | MD&A text from latest 10-K/10-Q; SEC-only |

All four SEC surfaces are keyless (SEC EDGAR). cachest proxies them at
`/ownership/{t}`, `/ownership/institutional/{t}`, `/filings/{t}`,
`/fundamentals/{t}/mda`.

## Missing — needs research

Status after SEC wiring (2026-09-07): the ownership gap is closed via SEC 13F;
investor-relations transcripts can now be partially sourced from SEC filings +
MD&A, but a true Q&A audio transcript is still out of tier.

1. **eps-surprises** (`/:symbol/eps-surprises`) — RESOLVED by derivation
   (I8b): quarterly income statements give actual EPS/revenue; estimates use
   the prior-year quarter as a baseline. True analyst estimates still need an
   FMP upgrade or Finnhub.
2. **institutional ownership** (`/:symbol/ownership`) — RESOLVED via SEC 13F
   (`ownership.form_13f`) exposed at openst `/equity/ownership/institutional/{t}` /
   cachest `/ownership/institutional/{t}`. Insider trading (Form 4) also covered.
3. **peers** (`/:symbol/peers`) — RESOLVED by composition (I8b): same-sector
   compare rows over a curated large-cap candidate pool with live sector
   profiles. FMP `stock_peers` remains the research path for true broker peers.
4. **seasonality** (`/:symbol/seasonality`) — RESOLVED in module (I8b):
   monthly last-closes from multi-year OHLCV → avg/median/min/max.
5. **investor-relations events / transcripts** — PARTIALLY RESOLVED (2026-09-07):
   events derived from real reported quarters; SEC filings now give the
   underlying documents (10-K/10-Q/8-K + report URLs) and MD&A supplies the
   management discussion text. A true earnings-call Q&A **audio transcript**
   (`fundamental.transcript`) is still FMP-only/premium — no audio in tier.

## Provider quirks worth remembering

- **intrinio**: nearly all probes fail with "Results not found" despite valid key —
  research key entitlements before adding it to any fallback chain beyond dividends.
- **nasdaq**: provider arg-shape mismatch for calendars in 4.7.1 (validation error).
- **calendar windows**: unfiltered calls are free; anything symbol-scoped is premium.
