# Proposal: instrument logos — provider-tier resolution with permanent local store

**Status**: draft (2026-08-25) — for discussion
**Builds on**: [backend-topology.md](backend-topology.md) (D1–D11), [instruments-provider-module.md](instruments-provider-module.md) (D12–D15), [fees-and-custom-fx.md](fees-and-custom-fx.md) (D25–D33)
**Scope**: replace the current `/api/logos/:symbol` (mock file lookup — 404s for most real tickers, e.g. `KTY.WA`) with a provider-resolved, **permanently cached** logo pipeline owned by the instruments module.

## Context

The SPA renders `<img src="/api/logos/{symbol}">` everywhere (search results,
position rows, buy dialog). Today that endpoint is a mock file lookup over a
hand-picked set of SVGs — anything outside the seed set 404s and the UI shows a
broken circle. The SPA falls back to generated initials (deterministic color +
ticker letters), which is the correct *terminal* fallback but loses all brand
recognition for the long tail.

Goal: real logos for as many tickers as possible, **without depending on
providers at request time**, per the same philosophy as the FX store — resolve
once, keep forever, serve from our own infrastructure.

### D34 — resolution chain in openst (provider tier, single egress)

openst gains one route, `equity.logo` (name TBD), resolving in order:

1. **FMP logo map** — `financialmodelingprep.com/image/logo/{TICKER}.png`;
   ticker-keyed, strong US coverage, we already hold the key.
2. **yfinance `logo_url`** — from the equity profile payload openst already
   fetches; best international coverage (incl. many WSE names).
3. **Favicon by domain** — `google.com/s2/favicons?domain={website}&sz=128`,
   domain taken from the profile's `website` field; near-universal last resort.

The chain returns `{ source, remote_url | bytes }`. Translation adapter lives in
instruments (D2); openst stays a thin OpenBB/provider wrapper. No other module
talks to providers directly (D12).

### D35 — permanent local store (disc files + Postgres metadata)

Resolved logos are **stored permanently** on our side — provider hits are a
one-time cost per symbol, not a per-request tax:

- **Binaries on disc**, symbol-keyed: `data/logos/{SYMBOL}.{ext}` (compose:
  bind mount; cluster: app-template `persistentVolume` on the instruments
  deployment). Disc over DB bytea: keeps Postgres backups lean, files are
  directly inspectable/purgeable, and we run a single replica — no shared-disc
  concern. (DB storage would only win with multi-replica statelessness.)
- **Metadata in Postgres**: `instruments.logos` —
  `{ symbol PK, source, remote_url, file, bytes, sha256, fetched_at,
  refresh_after }`. The row is the cache index; the file is the cache.
- **Serving**: `/api/logos/:symbol` → file exists ⇒ stream it
  (`Cache-Control: public, max-age=86400, immutable`-ish); miss ⇒ resolve via
  D34 → persist row+file → serve. Single-flight per symbol (in-process map) so
  a cold page with 50 tickers triggers one resolution each, not fifty.
- **Freshness**: logos change rarely. Lazy revalidation on read after
  `refresh_after` (default 30d): serve the stale file immediately, refresh in
  the background. No cron needed.
- **Failure**: chain exhausted or all providers down ⇒ serve generated initials
  SVG (deterministic, already implemented in the mock — move that generator
  into instruments) and DO NOT persist, so a later retry can succeed.

### D36 — cachest role: metadata only, short TTL

cachest keeps its usual job — caching the *resolution lookups* (FMP profile /
yfinance profile / favicon HEAD) with a short TTL (hours). Binaries are never
cached by cachest; their cache is our disc. This bounds provider traffic on
cold starts without double-storing payloads.

### D37 — rejected alternatives

- **Hotlinking provider CDNs from the SPA** (`s.yimg.com/...`, FMP image URLs):
  leaks user IPs to third parties, breaks when CDNs rotate URLs, no offline.
- **Storing bytes in Postgres**: backup bloat, no range/etag ergonomics,
  pointless for single-replica disc.
- **SPA-side third-party calls** (Clearbit/Google favicons from the browser):
  privacy + CORS + availability concerns; also duplicates the chain client-side.
- **Buy a logo database**: nothing ticker-keyed and permissive enough; FMP
  already covers the need inside our existing subscription.

## Plan placement

New plan section **§12 Instrument logos** (pending):

- [ ] 12.1 openst `equity.logo` route (FMP → yfinance → favicon chain) + stack test
- [ ] 12.2 cachest route for logo resolution lookups (short TTL)
- [ ] 12.3 instruments: `logos` table migration + resolve/persist/single-flight service
- [ ] 12.4 `/api/logos/:symbol` serving local files + initials fallback; mock handler retired
- [ ] 12.5 disc volume in compose + cluster HelmRelease persistence
- [ ] 12.6 e2e: search a WSE ticker → logo renders (real or initials), file persisted
