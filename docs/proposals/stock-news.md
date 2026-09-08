# Proposal: Company News via Provider Tier

**Status**: accepted (2026-09-08)
**Builds on**: [instruments-provider-module.md](instruments-provider-module.md) (D12–D15), [MODULARISATION.md](../MODULARISATION.md)
**Scope**: per-ticker company news articles (Polygon/FMP) with DB-backed persistence; local verification only.

## Context

The SPA already has two news views wired: the portfolio news tab (`PortfolioNewsTab.vue` →
`GET /api/portfolios/:id/news`) and the research news tab (`ResearchNews.vue` →
`GET /api/news/articles?ticker=...`). Both currently hit mocks/stubs, and the wallets
`/:id/news` stub returns a contract-invalid shape (`{articles, total}` vs `NewsArticleList`
`{data, pagination}`).

OpenBB (4.7.2) provides `obb.news.company()` with Polygon/FMP/Yahoo providers; the
`POLYGON_API_KEY` is already configured in openst's env. News data flows provider-tier-first,
same as every other instrument surface.

**Goal**: replace mock/stub news with real provider-backed data, persisted in the instruments
Postgres schema with a configurable expiry, following the established chain
SPA → gateway → module → cachest → openst.

## Architecture

```
SPA → gateway (instruments) → portfoliost-instruments module
                               ├─ Postgres: news_articles table (default 90-day TTL)
                               └─ cachest (1h TTL) → openst (OpenBB)
```

**Not in scope**: world news, news insights, livestreams, market contexts, standalone news
dashboard (future work), schema tightening of `NewsArticle` (keeps opaque items today).

### N1 — openst: company news endpoint — **done (2026-09-08, openst `86193f9`)** ✅

`GET /news/company/{ticker}?limit=&start_date=&end_date=&provider=` backed by
`get_company_news()` in `src/openbb_client.py`, following the existing provider-fallback
pattern (`COMPANY_NEWS_PROVIDERS = ["polygon", "fmp", "yfinance"]`, `_single_record`
style). Records map to `{date, title, text, url, symbols, source}`. Note OpenBB's
`CompanyNewsQueryParams` is day-granularity (`start_date`/`end_date` are date type), so
incremental sync relies on the URL-primary-key dedup to absorb overlap.

**Verified**: `tests/test_get_company_news.py` (14 tests, mocked obb) + route tests in
`tests/test_main.py` green via `docker compose --profile test run --rm test`; real-API
compose smoke `GET /news/company/AAPL?limit=3` returned 3 polygon articles with mapped
`{date, title, text, url, symbols, source}`; date filters, unknown-ticker 404 and
`limit`/date validation verified. Two fixes found against the real API: OpenBB's kwarg is
`symbol` (not `ticker`), and pandas turns `symbols=None` into NaN (normalized to `[]`).

### N2 — cachest: cached news route — **done (2026-09-08, cachest `e1b705e`)** ✅

Config-only addition in `config.yaml`:
```yaml
- name: OPENST_NEWS
  path: /news/company/{ticker}
  url: http://openst:8080/news/company/{ticker}?start_date={start_date}&limit={limit}
  query_params: [start_date, limit]   # added in N4 (cachest dbd310e) so the instruments
                                      # incremental window reaches openst
  cache_ttl: 3600      # 1h fresh
  stale_ttl: 86400     # 24h stale fallback
  fetch_interval: 300
  fetch_max_wait: 4
```

**Verified**: cachest suite green (63 passed incl. `test_real_config_has_company_news_route`)
and a compose cache HIT/MISS header check against the rebuilt openst N1 endpoint —
first `GET /news/company/AAPL` returned `X-Cache: MISS` (50 real polygon articles via
openst), second returned `X-Cache: HIT`.

### N3 — instruments: news_articles table — **done (2026-09-08, instruments `13f0dd9`)** ✅

New Drizzle table in `src/db/schema.ts` (schema `instruments`), migration via
`npm run db:generate`:

```sql
CREATE TABLE instruments.news_articles (
  url          TEXT PRIMARY KEY,            -- dedup key
  title        TEXT NOT NULL,
  summary      TEXT,
  source       TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  symbols      TEXT[] NOT NULL,             -- e.g. {'AAPL','MSFT'}
  fetched_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL         -- fetched_at + NEWS_EXPIRY_DAYS
);
CREATE INDEX idx_news_symbols   ON instruments.news_articles USING GIN (symbols);
CREATE INDEX idx_news_published ON instruments.news_articles (published_at DESC);
CREATE INDEX idx_news_expires   ON instruments.news_articles (expires_at);
```

### N4 — instruments: news service (incremental sync + on-read purge) — **done (2026-09-08, instruments `81e9b91`)** ✅

`src/services/news.ts`:

```
getNewsForTicker(ticker, limit):
  1. DELETE FROM news_articles WHERE expires_at < NOW()        # prune > NEWS_EXPIRY_DAYS
  2. watermark = MAX(published_at) WHERE ticker ∈ symbols
  3. round watermark DOWN to the nearest hour bucket
     (granularity = NEWS_SYNC_GRANULARITY_HOURS, default 1; 0 = exact timestamp)
  4. start_date = (watermark_hour OR now - 10 days).date()     # 10 days on first fetch
  5. GET CACHEST_URL/news/company/{ticker}?start_date={start_date}&limit={NEWS_FETCH_LIMIT}
  6. UPSERT ... ON CONFLICT (url) DO UPDATE
       SET symbols = <symbols ∪ new.symbols>, expires_at = now + NEWS_EXPIRY_DAYS
  7. RETURN SELECT * WHERE ticker ∈ symbols ORDER BY published_at DESC LIMIT {limit}
```

- **Freshness authority is cachest** (1h TTL / stale fallback). The DB is the long-term
  store (default 90 days); on-read purge removes only expired rows.
- Minute/hour rounding of the watermark avoids seconds-drift gaps while keeping the sync
  window small; the caller caps how many articles are persisted per fetch.
- Adapter `fetchCompanyNews`/`translateCompanyNews` in `src/adapters/cachest.ts`: maps
  openst `{date,title,text,url,symbols,source}` → DB columns, falls back to the fetch
  ticker when the provider omits `symbols`, drops records without url/title/date.
- **Deviation from N2 config (cachest `dbd310e`)**: `OPENST_NEWS` declares
  `query_params: [start_date, limit]` + URL placeholders so the incremental sync window
  reaches openst (cachest only forwards declared params). Instruments always sends both.
- **Deviation (PGlite)**: `symbols` union uses `(select array_agg(distinct s) from
  unnest(symbols || excluded.symbols) s)` instead of PG16 `array_union` — PGlite lacks it.

### N5 — instruments: news routes — **done (2026-09-08, instruments `bc73c5e`)** ✅

In `src/routes/instruments.ts`, JWT-protected and returning `NewsArticleList`
(`{data, pagination}`) per contract:

- `GET /news/articles?ticker=AAPL&limit=20` → `N4` single ticker. Tick‌er-less calls
  (e.g. SPA `getAllNews`) return the most recent stored rows — no provider fan-out.
- **Deviation (module boundaries)**: the `/portfolios/:id/news` route lives in the
  wallets module, not here. Instruments owns the News domain only; it must never read
  `portfolios.positions` (wallets-private schema). The wallets module fans out over its
  own holdings and calls instruments `/news/articles` per ticker (see N6).

### N6 — wallets: fan-out over holdings, wired to instruments — **done (2026-09-08, wallets `f08720c`)** ✅

In `src/routes/portfolios.ts`, replace the `{articles: [], total: 0}` stub with a
`NewsArticleList` fan-out:

- Load owned portfolio holdings (`portfolios.positions`, own schema), distinct open
  symbols only.
- Run `GET API_INSTRUMENTS_URL/api/news/articles?ticker={symbol}&limit={NEWS_FETCH_LIMIT}`
  per ticker in parallel (`Promise.allSettled`) — same cross-module HTTP pattern as
  `refreshQuotes` (`src/services/quotes.ts`), forwarding the caller's `Authorization`.
- Merge, dedup by `url`, sort `published_at` desc, cap at `PORTFOLIO_NEWS_TICKER_LIMIT`.
- `getPortfolioNews` is a Portfolios-domain op in the contract; gate `/api/portfolios/:id/news`
  already routes to wallets, so no gateway change needed for it.

### N7 — gateway: reroute /api/news off the mock

In `deploy/services.env`: `API_NEWS_URL=http://example-service-mock:4010` →
`API_NEWS_URL=http://instruments:3000`.

**done (2026-09-08)** ✅ — verified full-stack through the gateway:
`GET /api/news/articles?ticker=AAPL` returns real articles from instruments/cachest/openst
(invested positions fan-out through `/api/portfolios/:id/news`).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEWS_EXPIRY_DAYS` | `90` | Retention before purge |
| `NEWS_FETCH_LIMIT` | `50` | Max articles per ticker per fetch |
| `PORTFOLIO_NEWS_TICKER_LIMIT` | `50` | Max tickers in a portfolio news query |
| `NEWS_SYNC_GRANULARITY_HOURS` | `1` | Watermark rounding (0 = exact timestamp) |

## Testing strategy

Step-test-commit discipline applies per AGENTS.md; each step green before the next.

- **N1 (openst)**: pytest `test_get_company_news.py` (mocked obb) + compose smoke
  `curl /news/company/AAPL?limit=5` (`docker compose --profile test run --rm test`).
- **N2 (cachest)**: compose cache HIT/MISS header check.
- **N3 (instruments)**: PGlite migration applies; `npm run test`.
- **N4**: adapter tests (mocked fetch, assert URL mapping + translation) + service tests
  (purge, watermark rounding incl. granularity=0, UPSERT dedup, first-fetch 10 days).
- **N5**: handler tests against contract shapes; compose `/news/articles` + `/portfolios/:id/news`.
- **N6**: wallets handler proxy test; compose through gateway.
- **N7**: full-stack — SPA portfolio tab and research news tab render real articles.

## Risks

1. **Polygon/FMP rate limits** — cachest 1h TTL + stale fallback absorb them; openst keeps
   its per-provider 24h rate-limit blocking.
2. **News volume** — bounded by `NEWS_FETCH_LIMIT` per ticker and `PORTFOLIO_NEWS_TICKER_LIMIT`
   per portfolio fan-out.
3. **Schema looseness** — `NewsArticle` stays opaque in the contract; SPA keeps its local type.
   Tightening is deferred and documented as future work.
4. **Provider day-granularity** — incremental sync cannot slice under a day at the provider;
   the URL PK dedup plus hour-rounded watermark covers overlap without gaps.