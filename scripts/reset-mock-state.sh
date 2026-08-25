#!/usr/bin/env bash
# Resets the mock backend to its seeded state before an e2e run.
# example-service-mock keeps portfolio/wallet state in memory, so mutating tests
# (add position, delete transaction...) would otherwise be order-dependent.
set -euo pipefail

docker compose restart example-service-mock >/dev/null

for i in $(seq 1 30); do
  if curl -sf -o /dev/null -H "Authorization: Bearer mock-dev-token" \
    "http://localhost:4010/api/auth/me"; then
    
# Real wallets module: truncate its schema so the container re-seeds parity
# data on restart (volatile tmpfs postgres keeps state while up).
docker compose exec -T postgres psql -U portfoliost -d portfoliost \
  -c "truncate wallets.wallet_transactions, wallets.fx_rates, wallets.fx_sync_state, wallets.wallets cascade;" >/dev/null 2>&1 || true
docker compose restart wallets >/dev/null 2>&1 || true

echo "mock backend reseeded"
    exit 0
  fi
  sleep 1
done

echo "mock backend did not come back healthy" >&2
exit 1
