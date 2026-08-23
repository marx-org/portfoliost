# Example service API Mock

Local mock of the Example service API, faithful to the live service at
`https://app.example-service.ai`. All responses were captured from a real authenticated
account on 2026-08-11 and are replayed from `shared/data/`.

- **Contract:** [`example-service-real-api.yaml`](../docs/api/example-service-real-api.yaml) — 78 paths, 70 schemas
- **Runtime:** zero-dependency Node ≥ 22 (no `npm install` needed)
- **Port:** `4010` (override with `PORT`)

## Quick start

```sh
# option A — Docker
docker compose up -d            # http://localhost:4010

# option B — plain Node
node mocks/gateway/index.js     # http://localhost:4010
# or
npm start
```

## Logging in

Authentication is a custom REST flow (it replaces Supabase in the mock):

```sh
curl -X POST http://localhost:4010/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"example-service-mock"}'
```

The response contains `access_token` (Bearer) plus the user object. Send it on
protected endpoints:

```sh
TOKEN=$(curl -s -X POST http://localhost:4010/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"example-service-mock"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -H "Authorization: Bearer $TOKEN" http://localhost:4010/api/portfolios
```

For scripts, a static token is accepted without a login round-trip:

```sh
curl -H "Authorization: Bearer mock-dev-token" http://localhost:4010/api/auth/me
```

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4010` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `EXAMPLE_SERVICE_MOCK_EMAIL` | `demo@example.com` | Accepted login email |
| `EXAMPLE_SERVICE_MOCK_PASSWORD` | `example-service-mock` | Accepted login password |
| `EXAMPLE_SERVICE_MOCK_TOKEN` | `mock-dev-token` | Static bearer token (bypasses login) |

The same variables are forwarded from your shell into the container by
`docker-compose.yml` (with defaults).

### Backend switching (nginx gateway)

The nginx gateway sits in front of the mock and routes `/api/` requests
to backends. Each module has its own env var so they can be migrated
independently. The env vars live in **`deploy/services.env`** (consumed by
the `gateway` service via `env_file`).

| Env var | Gateway route | Default |
| --- | --- | --- |
| `API_USERS_AUTH_URL` | `/api/auth/*`, `/api/users/*`, `/.well-known/*` | `http://example-service-mock:4010` |
| `API_PORTFOLIOS_URL` | `/api/portfolios/*` | `http://example-service-mock:4010` |
| `API_WALLETS_URL` | `/api/wallets/*` | `http://example-service-mock:4010` |
| `API_INSTRUMENTS_URL` | `/api/instruments/*` | `http://instruments:3000` (real module stack; set to `http://example-service-mock:4010` to fall back) |
| `API_WATCHLISTS_URL` | `/api/watchlists/*` | `http://example-service-mock:4010` |
| `API_NOTIFICATIONS_URL` | `/api/notifications/*` | `http://example-service-mock:4010` |
| `API_NEWS_URL` | `/api/news/*` | `http://example-service-mock:4010` |
| `API_BILLING_URL` | `/api/billing/*` | `http://example-service-mock:4010` |
| `API_CHARTING_URL` | `/api/charting/*` | `http://example-service-mock:4010` |
| `API_COPILOT_URL` | `/api/conversations`, `/api/chatbot/*` | `http://example-service-mock:4010` |
| `API_LOGOS_URL` | `/api/logos/*` | `http://example-service-mock:4010` |
| `API_EXCHANGE_RATES_URL` | `/api/exchange-rates` | `http://example-service-mock:4010` |
| `API_SNAPTRADE_URL` | `/api/snaptrade/*` | `http://example-service-mock:4010` |
| `API_PUBLIC_URL` | `/api/public/*` | `http://example-service-mock:4010` |
| `API_BACKEND_URL` | catch-all `/api/*` | `http://example-service-mock:4010` |

**To use the mock backend** (default — no action needed):

```sh
docker compose up -d --build
```

**To migrate a single module** to its real backend (users-auth example):

```sh
API_USERS_AUTH_URL=http://users-auth:3000 docker compose up -d --build gateway
```

**To migrate all modules** to real backends:

```sh
API_USERS_AUTH_URL=http://users-auth:3000 \
API_PORTFOLIOS_URL=https://api.real.com \
API_WALLETS_URL=https://api.real.com \
API_INSTRUMENTS_URL=https://api.real.com \
API_WATCHLISTS_URL=https://api.real.com \
API_NOTIFICATIONS_URL=https://api.real.com \
API_NEWS_URL=https://api.real.com \
API_BILLING_URL=https://api.real.com \
API_CHARTING_URL=https://api.real.com \
API_COPILOT_URL=https://api.real.com \
API_LOGOS_URL=https://api.real.com \
API_EXCHANGE_RATES_URL=https://api.real.com \
API_SNAPTRADE_URL=https://api.real.com \
API_PUBLIC_URL=https://api.real.com \
API_BACKEND_URL=https://api.real.com \
  docker compose up -d --build
```

## What's covered

| Tag | Base path | Highlights |
| --- | --- | --- |
| Auth | `/api/auth/*` | login, register, me, logout |
| Users | `/api/users/*` | profile, preferences, custom benchmarks/timeframes, onboarding |
| Billing | `/api/billing/*` | plans, subscription, entitlements |
| Notifications | `/api/notifications/*` | list, unread count, preferences, symbols |
| News | `/api/news/*` | articles, timeline, market contexts, stats, tracked tickers, livestreams, insights |
| Instruments | `/api/instruments/*` | detail, profile, metrics, overview-metrics, quote, history, search, investor relations + transcripts |
| Premium research | `/api/instruments/{symbol}/...` | fundamentals, ownership, dividends, calendar, seasonality, eps-surprises, projections, price |
| Charting | `/api/charting/*` | presets, compare (also served under `/charting/*`) |
| Portfolios | `/api/portfolios/*` | list, merged, total-metrics, held-stocks, shares, analytics, positions, transactions (+export), snapshot, risk-metrics |
| Wallets | `/api/wallets/*` | list, total-balance, balance-history, deposits/withdrawals/transfers, transactions |
| Watchlists | `/api/watchlists/*` | CRUD + items |
| Copilot | `/api/conversations`, `/api/chatbot/models` | conversations, models |
| Misc | `/api/exchange-rates`, `/api/snaptrade/status` | rates, broker-sync status |
| Logos | `/api/logos/{symbol}` | placeholder SVG logos |

Mutations are fully functional and kept in memory for the process lifetime
(they reset on restart): create/update/delete portfolios and watchlists, add /
close positions, record transactions, deposit/withdraw, create conversations.

### Deliberate deviations from production

1. **Auth** is a custom REST flow (`POST /api/auth/login`) instead of Supabase.
2. **Premium endpoints** (fundamentals, ownership, dividends, projections, news
   insights, AI insights) return **full data** instead of `402/403`.
3. **Realtime** (socket.io) is not emulated — REST endpoints only.

## Data

```
mocks/shared/data/
├── raw/           # byte-for-byte captures from the real API (76 files)
├── research/      # synthesized premium bundles, one JSON per symbol (24)
├── logos/         # placeholder company logos (SVG)
├── universe.json  # instrument catalog
└── benchmarks.json
```

- **Regenerate** the seed (re-copy captures + re-synthesize research):
  `node scripts/regen-seed.mjs`
- **Regenerate types** from the data:
  `node scripts/gen-types.mjs` → `generated/api-types.d.ts`
- Raw captures are never edited by hand — they are refreshed from
  `discovery/raw/` (the live-capture folder) by the seed script.

## Tests

```sh
npm test            # or: node mocks/tests/run.mjs
```

The suite boots its own instance on port `4099` (`TEST_PORT` to override) and
runs ~105 checks: auth flows, every endpoint, pagination, premium data shapes,
the full mutation lifecycle (create → add position → delete), logos, and error
handling. Exit code is non-zero on any failure.

## Example flows

Create a portfolio, add a position, then delete it:

```sh
CID=$(curl -s -X POST http://localhost:4010/api/portfolios \
  -H "Authorization: Bearer mock-dev-token" -H 'content-type: application/json' \
  -d '{"name":"Demo","strategy":"GROWTH","currency":"USD"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

curl -X POST "http://localhost:4010/api/portfolios/$CID/positions" \
  -H "Authorization: Bearer mock-dev-token" -H 'content-type: application/json' \
  -d '{"symbol":"NVDA","quantity":5,"price":208.4}'

curl -X DELETE "http://localhost:4010/api/portfolios/$CID" \
  -H "Authorization: Bearer mock-dev-token"
```

Useful dev endpoints:

```sh
curl http://localhost:4010/health                 # liveness
curl http://localhost:4010/                       # banner with login hint
```
