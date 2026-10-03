#!/usr/bin/env bash
# Resets the e2e stack to a clean seed state before an e2e run (plan §48.4c).
#
# Two approaches were benchmarked (2026-09-22, this machine):
#   A. `docker compose down -v && docker compose up -d` — full re-bootstrap
#      (fresh tmpfs postgres, migrations, pricebars-sim, mock-db-seed): ~90s
#   B. Restart the in-memory mock + TRUNCATE the app-state schemas + re-run
#      mock-db-seed (this script): ~15s
# B wins: the only stale state across runs is (1) in-memory mock state
# (auth/watchlists/news) and (2) app-state rows in the module schemas — both
# handled below. Reference data (ticker_reference/exchange_reference, 62k
# rows, instruments.logos) is kept to skip the re-insert, and migrations
# state is untouched. A full `docker compose down -v && docker compose up -d`
# remains the fallback if a schema-level reset ever looks incomplete.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. In-memory mock state (auth sessions, watchlists, news, charting...).
docker compose restart example-service-mock >/dev/null

healthy=""
for i in $(seq 1 30); do
  if curl -sf -o /dev/null -H "Authorization: Bearer mock-dev-token" \
    "http://localhost:4010/api/auth/me"; then
    healthy="yes"
    break
  fi
  sleep 1
done
if [ -z "$healthy" ]; then
  echo "mock backend did not come back healthy" >&2
  exit 1
fi

# 2. App-state tables: truncate every base table in the module schemas
#    except the reference data. mock-db-seed re-inserts everything else
#    (wallets + demo FX into instruments.fx_rates, portfolios, user prefs,
#    ticker reference, openst no-price bonds).
#
#    `news_articles` is in the keep-list for a specific reason (2026-10-03): it is
#    a provider-backed read-through cache, but GET /api/portfolios/:id/news is
#    served by wallets and reads it WITHOUT triggering the sync — only
#    GET /api/news/articles does that. So truncating it empties the news tab and
#    nothing re-seeds it, which broke portfolios.spec.ts:77 and the research
#    news specs. Like ticker_reference it is fixture data, not app state.
TABLES=$(docker compose exec -T postgres psql -U portfoliost -d portfoliost -At \
  -c "select string_agg(quote_ident(table_schema) || '.' || quote_ident(table_name), ', ')
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema in ('wallets','portfolios','instruments','openst','admin')
        and table_name not in ('ticker_reference','exchange_reference','logos','schema_migrations','news_articles')")
if [ -z "$TABLES" ]; then
  echo "no app-state tables found (is postgres up?)" >&2
  exit 1
fi
docker compose exec -T postgres psql -U portfoliost -d portfoliost \
  -c "truncate $TABLES cascade;" >/dev/null

# 3. Re-seed. pricebars-sim first: the deterministic daily series it seeds
#    (plan §48.4a) were truncated above and it normally only runs on
#    `compose up`; anchored to "today" it also re-arms the price-bars
#    gap-fill so the suite never depends on the live provider. All seeds are
#    idempotent; they run against the just-truncated state.
docker compose run --rm pricebars-sim >/dev/null 2>&1
docker compose run --rm mock-db-seed >/dev/null 2>&1

echo "mock backend reseeded"
