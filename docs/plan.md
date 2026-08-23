# plan.md — example-service.ai parity (Investments main page + portfolio transactions)

Long-running plan. Each step is implemented, verified (build + unit + mock + e2e), committed, and then marked here.

Legend: `[ ]` pending · `[x]` done

## Step 1 — Mock + API + store: cash movement fields (foundation)
- [x] `mocks/wallets/index.js` `mutate()`: read `transaction_date`, `payment_method`, `fees`, `fees_type`, `to_wallet_id`; deposit returns `new_balance`, withdraw returns `remaining_balance`, transfer also credits destination wallet.
- [x] `src/api/wallets.ts` + `src/stores/wallets.ts`: extend deposit/withdraw/transfer input types and pass-through.
- [x] `mocks/tests/run.mjs`: round-trip checks for new fields.
- [x] Verify: `npm run test:mock` + `build` + `test`. Commit. — `509209f`

## Step 2 — Main page: cash balance currency breakdown
- [x] `InvestmentsView.vue`: total + per-currency rows (USD 100%) from `walletsStore.wallets`.
- [x] Update `tests/unit/modules/portfolios/InvestmentsView.test.ts`.
- [x] Verify: `npm run test:mock` + `build` + `test` + `test:e2e`. Commit. — `6c40ec7`

## Step 3 — PortfolioCard: Add Position opens AddPositionDialog
- [x] `PortfolioCard.vue`: "Add Position" link → button emitting `add-position`; `InvestmentsView.vue` hosts `AddPositionDialog` for the selected portfolio. News link already targets the portfolio news tab (verify).
- [x] Update `tests/e2e/parity-portfolios.spec.ts` (link → button + dialog assertion).
- [x] Verify: `npm run test:mock` + `build` + `test` + `test:e2e`. Commit. — `4fa6dc7`

## Step 4 — Deposit/Withdraw/Transfer modal rework (shared component)
- [x] New `WalletCashModals.vue` used by card + detail screen.
  - Deposit: Amount, Description (optional), Transaction Date, Confirmation summary, Cancel/Deposit.
  - Withdraw: Available Balance, Amount, Transaction Date, Description, Payment Method select (Bank Transfer / Card / Wire / PayPal), confirmation w/ Remaining Balance.
  - Transfer: From Wallet (pre-filled), To Wallet, Amount + "Transfer All" + Available, Transfer Date, Fees (optional, % / $ toggle), Cancel/Transfer.
- [x] Rewire `CashWalletCard.vue` + `WalletsView.vue` to use it.
- [x] Fix mock: transfers debit source (amount + fees) and credit destination.
- [x] Verify: `npm run test:mock` + `build` + `test` + `test:e2e`. Commit. — `e313e47`

## Step 5 — Wallet detail screen + card navigation
- [x] Route `wallets/:id` → `/en/portfolios/wallets/:id` (example-service path): back, Rename, metric strip (Balance/Available/Currency), Deposit/Transfer/Withdraw/Delete, always-visible Balance History chart with timeframe + High/Low/Avg stats, Recent Transactions + View All.
- [x] `CashWalletCard.vue`: chart always visible (drop `showHistory`), History button + card click → wallet detail.
- [x] Verify: `npm run test:mock` + `build` + `test` + `test:e2e`. Commit. — `149117b`

## Step 6 — Edit portfolio transaction modal
- [x] `TransactionsView.vue` + `PortfolioTransactionsTab.vue`: stock header (logo, symbol (US) type, name, Historical Price), Purchase Date, Cash portfolio select, Quantity × Price per share, Fees $/% toggle, Total Cost. PATCH adds `executedAt`, `walletId`, `feesType`. — `f900704`

## Step 7 — Delete confirmation dialogs
- [x] `TransactionsView`, `PortfolioTransactionsTab`, `CashTransactionsView`: confirm dialog before delete (mirror existing delete-confirm pattern). — `1554756`

## Step 8 — Buy position modal fields
- [x] `AddPositionDialog.vue` stock step: Purchase Date, Cash portfolio select, Fees $/% toggle, Total. Wire `walletId`, `feesType`, `executedAt` through `createPortfolioPosition` + mock POST `/positions`. — `c2e8976`

## Step 9 — Grouping filter on transactions
- [x] Mock: enrich transactions with `sector`/`country` via symbol join from positions.
- [x] `TransactionsView` (+ `PortfolioTransactionsTab`): "Group by" — None / Kind of investment / Sector / Country (reuse holdings grouping pattern). — `4803970`

## Step 10 — Wallet transactions column order fix
- [x] `CashTransactionsView.vue`: header order → Date, Wallet, Type, Description, Amount (matches body). (97be3dd)

## Step 11 — Wallet detail recent transactions actions
- [x] `WalletDetailView.vue`: Recent Transactions rows gain Edit + Delete (with confirmation) actions; edit modal (Type/Amount/Date/Description) + ConfirmDeleteModal mirror example-service. Mock `/wallets/:id/transactions` now reflects recent PATCH/DELETE overrides. — `397f1c7`

## Step 12 — Dark mode (class strategy + sidebar toggle)
- [x] Theme foundation: `tailwind.config.js` `darkMode: "class"`, `src/stores/theme.ts` (light/dark/system with `localStorage` + `matchMedia`, reactive `systemDark` so OS changes apply live in system mode), `index.html` inline pre-hydration script (no FOUC), `init()` in `src/main.ts`, `dark:` base styles in `src/styles/main.css` (`body`, `.card`, `.btn-secondary`, `.btn-ghost`, `.btn-red-ghost`, `.input`, `.label`).
- [x] `SidebarNav.vue` + `AppLayout.vue`: sidebar, main area, nav items get `dark:` variants; Theme dropdown (Light/Dark/System) with sun/moon/monitor icons. `ProfileView` gains an Appearance card with the same three options.
- [x] All views/components get `dark:` variants for their mapped slate/blue/red/green/amber tokens (bg/text/border/divide), including modals (`AddPositionDialog`, `EditPositionDialog`, `EditTransactionModal`, `WalletCashModals`, `ConfirmDeleteModal`, `InstrumentSearchModal`) and active pagination/history pills (`dark:bg-slate-700`).
- [x] Tests: `tests/unit/stores/theme.test.ts` (default/apply/persist/system/fallback) + e2e coverage for the sidebar dropdown and profile appearance switcher.
- [x] Verify: `npm run build` + `test` + `test:mock` + `test:e2e`. Commit.

---

## portfoliost-backend — Database Layer (Drizzle + SQLite) *(historical — superseded by the Postgres Migration phase below)*

Backend lives at `../portfoliost-backend/`. Current database proposal: `../portfoliost-backend/docs/database-postgres-drizzle.md`. Steps below are a historical record of the original (since-replaced) SQLite implementation.

### Step B1 — Project scaffold
- [x] `../portfoliost-backend/`: `package.json` (type: module), `tsconfig.json`, `src/index.ts` (Hono server with `/health` endpoint), `vitest.config.ts`.
- [x] `npm test` passes (health endpoint test).
- [x] Commit. — `300cf40`

### Step B2 — Drizzle + SQLite setup
- [x] Install `drizzle-orm`, `@libsql/core`, `@libsql/client`, `drizzle-kit`. Add `src/db/schema.ts`, `src/db/index.ts` (DB connection), `drizzle.config.ts`.
- [x] Schema: `user_preferences` table (userId PK, language, uiPreferences JSON, customBenchmarks JSON, customTimeframes JSON, onboardingStatus JSON, onboardingDraft JSON, createdAt, updatedAt).
- [x] Generate initial migration: `npx drizzle-kit generate`.
- [x] `npm test` passes.
- [x] Commit. — `3edc30c`

### Step B3 — User preferences CRUD endpoints
- [x] `GET /api/users/profile` — merge identity (from header `X-User-Id` + `X-User-Email` etc.) + DB language.
- [x] `PATCH /api/users/profile` — update language in DB (ignore identity fields).
- [x] `GET /api/users/preferences` — read from DB by user ID.
- [x] `PATCH /api/users/preferences` — update DB by user ID.
- [x] `GET /api/users/preferences/custom-benchmarks` — read from DB (JSON column).
- [x] `GET /api/users/preferences/custom-timeframes` — read from DB (JSON column).
- [x] `GET /api/users/onboarding/status` — read from DB.
- [x] `GET /api/users/onboarding/draft` — read from DB.
- [x] `POST /api/users/change-password` — return 403.
- [x] `DELETE /api/users/clear-data` — delete row, return 204.
- [x] `DELETE /api/users/account` — delete row, return 204.
- [x] Auto-provision: upsert `user_preferences` row on first access.
- [x] Tests for all endpoints.
- [x] Commit. — `97f995c`

### Step B4 — Dockerize
- [x] `Dockerfile` (node:22-alpine, build + run, expose 3000, healthcheck).
- [x] `.dockerignore` (exclude node_modules, .git, tests).
- [x] `src/server.ts` — Hono server entrypoint with `@hono/node-server`.
- [x] Build: `docker build -t portfoliost-backend .` succeeds.
- [x] Container healthcheck passes, profile endpoint returns correct data.
- [x] Commit. — `76b8d0f`

### Step B5 — Add to docker compose
- [x] `portfoliost-backend` service in `docker-compose.yml` with volume for SQLite data persistence.
- [x] Update KrakenD env var `API_USERS_URL` → `http://portfoliost-backend:3000`.
- [x] Add `X-User-*` headers to KrakenD `input_headers` for user endpoints.
- [x] `docker compose up --build` works, all 4 services start.
- [x] User endpoints accessible through KrakenD at `localhost:8080/api/users/*`.
- [x] Existing mock routes (portfolios, wallets, etc.) still work.
- [x] `npm run test` + `npm run test:mock` pass in portfoliost.
- [x] Commit. — `5a60063`

---

## OpenAPI Contracts Repo + Integration

Separate contracts repo at `github.com/Marx2/portfoliost-contracts`, published to GitHub Packages as `@marx2/contracts`. Source of truth for API types, consumed by both frontend (openapi-typescript) and backend (hono-zod-openapi).

### Step C1 — Create portfoliost-contracts repo
- [x] Create GitHub repo `Marx2/portfoliost-contracts`.
- [x] `package.json` — `name: "@marx2/contracts"`, type: module, exports `./openapi.yaml`.
- [x] `.npmrc` — `registry=https://npm.pkg.github.com`.
- [x] `openapi.yaml` — copy `example-service-real-api.yaml`, add `/api/users/*` endpoints from portfoliost-backend, adjust `info.title` → "Portfoliost API", adjust `servers`.
- [x] `example-service-reference/example-service-real-api.yaml` — original example-service spec as reference.
- [x] `.github/workflows/publish.yml` — on push to main: `npm publish` to GitHub Packages.
- [x] `README.md` — brief description, how both repos consume it.
- [x] Verify: push, confirm package appears in GitHub Packages.
- [x] Commit.

### Step C2 — Backend: contract-first with hono-zod-openapi
- [x] Install `@marx2/contracts`, `hono-zod-openapi`, `zod` in portfoliost-backend.
- [x] Create `src/schemas/users.ts` — Zod schemas for all user endpoints (request params, body, headers, responses).
- [x] Rewrite `src/routes/users.ts` — use `openApi(operation)` middleware + `c.var.res()` typed responses.
- [x] Add `src/doc.ts` — `createOpenApiDocument()` mounting at `GET /api/doc`.
- [x] Register `/api/doc` route in `src/index.ts`.
- [x] Add `npm run gen:openapi` script — exports generated spec to `dist/openapi.yaml`.
- [x] Tests: all existing endpoint tests pass, new test validates generated spec.
- [x] Commit.

### Step C3 — Frontend: openapi-typescript replaces gen-types.mjs
- [x] Install `@marx2/contracts`, `openapi-typescript` in portfoliost.
- [x] Add `npm run gen:types` script — `openapi-typescript @marx2/contracts/openapi.yaml -o generated/api-types.d.ts`.
- [x] Update `src/api/types.ts` — re-export generated types.
- [x] Audit `src/api/users.ts` — replace inline types with generated types.
- [x] Audit `src/api/auth.ts` — replace inline `AuthUser`, `AuthResponse` with generated types.
- [x] Audit remaining API modules — verify generated types match usage.
- [x] Delete `scripts/gen-types.mjs`.
- [x] Delete `docs/proposals/openapi-typescript-integration.md`.
- [x] Verify: `npm run build` + `npm run test` + `npm run test:mock` pass.
- [x] Commit.

### Step C4 — Cleanup
- [x] Move `docs/proposals/database-drizzle-sqlite-postgres.md` → `../portfoliost-backend/docs/`.
- [x] Update this plan with commit hashes for C1–C3.
- [x] Commit.

---

## PocketID OIDC Auth Integration

Gradual migration: local mock stays as-is for development, cluster uses PocketID. Frontend detects mode via `VITE_OIDC_ISSUER_URL` / `VITE_OIDC_CLIENT_ID` env vars.

### Step A1 — Backend auth infrastructure
- [x] Install `jose` in portfoliost-backend for JWT validation.
- [x] Create `src/auth.ts` — `userIdentityMiddleware` (dual-mode: X-User-* headers for Docker Compose, JWT validation for cluster), `validateJwt`, `requireGroup`.
- [x] Create `src/routes/auth.ts` — `GET /api/auth/me`, `POST /api/auth/logout`.
- [x] Register auth routes in `src/index.ts`.
- [x] Update `src/routes/users.ts` to import from `auth.ts` instead of `context.ts`.
- [x] Delete `src/context.ts`.
- [x] Build + test pass. Commit.

### Step A2 — Contracts: groups in AuthUser
- [x] Add `groups` array to `AuthUser` schema in `portfoliost-contracts/openapi.yaml`.
- [x] Commit + push contracts. GitHub Actions publishes.
- [x] Regenerate frontend types (`npm run gen:types`).
- [x] Regenerate backend OpenAPI spec (`npm run gen:openapi`).

### Step A3 — Frontend OIDC flow
- [x] Create `src/auth/pkce.ts` — PKCE utilities (code_verifier, code_challenge, state, authorization URL builder).
- [x] Create `src/modules/auth/AuthCallback.vue` — handles `/auth/callback` redirect, validates state, exchanges code via backend.
- [x] Add `/auth/callback` route to router.
- [x] Update `src/api/auth.ts` — add `loginWithCode()` calling `POST /api/auth/token`.
- [x] Update `src/stores/auth.ts` — add `loginWithCode()` action.
- [x] Update `LoginView.vue` — detect OIDC mode, show "Sign in with Passkey" button above email form.
- [x] Typecheck + unit tests + mock tests pass. Commit.

### Step A4 — Switch from npm registry to git URL
- [x] Remove `@marx2/contracts` from GitHub Packages (private: true, delete publish workflow).
- [x] Switch both repos to `github:Marx2/portfoliost-contracts` in package.json.
- [x] Remove `.npmrc` files, `GITHUB_TOKEN` Dockerfile arg.
- [x] Docker build succeeds without auth tokens. Commit.

### Step A5 — Backend: token exchange endpoint
- [x] Add `POST /api/auth/token` to portfoliost-backend — exchanges OIDC code + code_verifier for JWT via PocketID token endpoint.
- [x] Env vars: `POCKETID_CLIENT_ID`, `POCKETID_CLIENT_SECRET`, `POCKETID_TOKEN_URL`.
- [x] Frontend sends `{ code, code_verifier, redirect_uri }` to backend; backend calls PocketID, validates JWT, upserts user_preferences, returns `{ access_token, token_type, expires_in, user }`.
- [x] Tests. Commit.

### Step A6 — Frontend: backend token exchange integration
- [x] Update `AuthCallback.vue` to call `POST /api/auth/token` with code + verifier.
- [x] Update `auth.ts` API client — `loginWithCode()` sends to backend instead of direct exchange.
- [x] Test flow with Docker Compose (mock mode) — callback redirects to login in mock mode.
- [x] Typecheck + tests. Commit.

### Step A7 — Mock OIDC endpoints for local development
- [x] Add OIDC endpoints to mock backend (`mocks/oidc/index.js`):
  - `GET /.well-known/openid-configuration` — discovery doc
  - `GET /.well-known/jwks.json` — JWKS for validation
  - `GET /authorize` — redirect to callback with code (with PKCE storage)
  - `POST /api/auth/token` — exchange code for RS256-signed JWT (with PKCE verification)
- [x] Register OIDC module in `mocks/gateway/index.js`.
- [x] Add KrakenD routes: `/.well-known/*`, `/authorize`, `/api/auth/token` → mock.
- [x] Set `VITE_OIDC_ISSUER_URL=http://localhost:8080` and `VITE_OIDC_CLIENT_ID=mock-client` in docker-compose.yml (always through KrakenD).
- [x] Set `POCKETID_ISSUER_URL=http://krakend:8080` and `POCKETID_AUDIENCE=mock-client` on backend for JWT validation.
- [x] Tests. Committed.

### Step A8 — Profile avatar from OIDC
- [x] Add `avatarUrl` to `UserProfile` and `AuthUser` in contracts (`openapi.yaml`).
- [x] Add `picture` claim to backend `UserIdentity` (from OIDC JWT `picture` claim).
- [x] Add `avatarUrl` to `UserProfileSchema` (z.string().url().nullable()).
- [x] Return `avatarUrl` in `GET /profile` and `PATCH /profile`.
- [x] Frontend `UserProfile` interface: add `avatarUrl: string | null`.
- [x] `ProfileView.vue`: show avatar image with fallback initial, "managed by identity provider" note.
- [x] Mock: OIDC JWT includes `picture` claim (dicebear initials URL).
- [x] Mock: raw data (`auth_me.json`, `users_profile.json`) includes `avatarUrl`.
- [x] Mock: `resolveUser()` extracts `picture` → `avatarUrl` from JWT payload.
- [x] Unit + mock tests pass. Committed. — `b5dd8cb`

---

## Cluster Deployment

### Step K1 — portfoliost-backend HelmRelease
- [x] Create `cluster/apps/pfire/portfoliost-backend/` directory structure (ks.yaml, app/kustomization.yaml, app/helmrelease.yaml).
- [x] HelmRelease: `app-template` chart, image `ghcr.io/marx2/portfoliost-backend:latest`, replicas: 1.
- [x] Env vars: `POCKETID_CLIENT_ID`, `POCKETID_CLIENT_SECRET`, `POCKETID_ISSUER_URL`, `POCKETID_AUDIENCE`, `POCKETID_TOKEN_URL`.
- [x] Volume for SQLite data (or use CrunchyData Postgres).
- [x] Healthcheck endpoint `/health`.
- [x] Add to `cluster/apps/pfire/kustomization.yaml`. Commit.

### Step K2 — KrakenD ConfigMap: route auth + users to backend
- [x] Update `cluster/apps/pfire/krakend/app/krakend-configmap.yaml`:
  - Change `API_AUTH_URL` from mock to `http://portfoliost-backend.pfire.svc.cluster.local:3000`.
  - Change `API_USERS_URL` from mock to `http://portfoliost-backend.pfire.svc.cluster.local:3000`.
- [x] Verify all other endpoints still route to mock. Commit.

### Step K3 — portfoliost ingress: remove oauth2-proxy auth
- [x] Remove `nginx.ingress.kubernetes.io/auth-url` and `auth-signin` annotations from portfoliost HelmRelease.
- [x] Auth is now handled by the app itself (PocketID OIDC). Commit.

### Step K4 — PocketID OIDCClient CRD
- [x] Create `PocketIDOIDCClient` CRD for portfoliost in `cluster/apps/networking/pocket-id-operator/app/`.
- [x] callbackURLs: `https://portfoliost.${SECRET_DOMAIN}/auth/callback`.
- [x] logoutURLs: `https://portfoliost.${SECRET_DOMAIN}/logout`.
- [x] Operator creates client and writes credentials to secret `portfoliost-oidc-credentials`.
- [x] Reference secret in portfoliost-backend HelmRelease. Commit.

## Related Proposals

- [Testing Strategy — Mock Phase-Out and Database Environment Tiers](proposals/testing-strategy.md)

## Testing Strategy Implementation

### Phase 1 — Environment-Aware SQLite + Seed System
- [x] Add `DATABASE_URL` env var to `portfoliost-backend/src/db/index.ts` (defaults to `file:data/portfoliost.db`).
- [x] Update `drizzle.config.ts` to respect `DATABASE_URL`.
- [x] Create `seed/run.mjs` + `src/db/seed.ts` seed runner (checks if `user_preferences` is empty, runs SQL fixtures).
- [x] Create `seed/001_user_preferences.sql` with test user data.
- [x] Add `db:seed` npm script to `portfoliost-backend/package.json`.
- [x] Update `portfoliost-backend/Dockerfile`: copy `seed/`, CMD runs `db:migrate && db:seed`.
- [x] Update `docker-compose.yml`: remove `backend-data` volume, add `tmpfs: [/tmp]`, set `DATABASE_URL=file:/tmp/portfoliost.db`.
- [x] Fix pre-existing auth test bug (`code_verifier` → `verifier`).
- [x] Verify: build + unit + mock + e2e (50/51, 1 pre-existing charting flake). Commit. — `06fa23a` (backend) `8ab90ba` (frontend)

### Phase 2 — First Endpoint Migration
- [ ] Pick endpoint to migrate (suggestion: `GET /api/users/preferences`).
- [ ] Implement in `portfoliost-backend`.
- [ ] Write backend unit tests.
- [ ] Add seed data if needed.
- [ ] Switch gateway route in `deploy/services.env`: `API_USERS_URL` → `http://portfoliost-backend:3000`.
- [ ] Add E2E test for the endpoint.
- [ ] Delete mock handler.
- [ ] Verify: build + unit + mock + e2e. Commit.

### Phase 3 — Subsequent Endpoints
- [ ] `/api/auth/*` + `/api/users/*` (partially done — auth + users routes exist).
- [ ] `/api/portfolios/*`
- [ ] `/api/wallets/*`
- [ ] `/api/watchlists/*`
- [ ] `/api/instruments/*`
- [ ] `/api/charting/*`

### Phase 4 — Mock Removal
- [ ] Delete `mocks/` directory.
- [ ] Remove `example-service-mock` service from `docker-compose.yml`.
- [ ] Remove `Dockerfile.mock`.
- [ ] Remove `npm run test:mock` script.
- [ ] Remove `scripts/regen-seed.mjs` and `discovery/raw/`.
- [ ] Update `AGENTS.md` to reflect new architecture.

---

## Postgres Migration

Backend switches from SQLite/libSQL to **Postgres everywhere** (unit tests via PGlite, docker compose, cluster). See `../portfoliost-backend/docs/database-postgres-drizzle.md`.

> **Cluster deployment changes are deferred to the last point of this phase and will be discussed separately before implementation** (credentials, network policy, migration job against the existing cluster Postgres).

### Step G1 — Proposal rewrite + plan
- [x] Rename `docs/database-drizzle-sqlite-postgres.md` → `docs/database-postgres-drizzle.md`, rewrite as Postgres-only proposal (jsonb columns, ISO-text timestamps, volatile compose DB, PGlite unit tests).

### Step G2 — Backend dialect switch (SQLite → Postgres)
- [x] `src/db/schema.ts` → `drizzle-orm/pg-core` (`pgTable`, `jsonb`).
- [x] Driver: `@libsql/client` → `postgres` (postgres-js); remove `@libsql/client` + `@libsql/core`.
- [x] `drizzle.config.ts` → `dialect: "postgresql"`; regenerate fresh baseline migration.
- [x] Unit tests → embedded Postgres (PGlite) running the real migrations folder; drop hand-written DDL.
- [x] Seed runner + fixtures in Postgres SQL (`ON CONFLICT DO NOTHING`).
- [x] Routes/auth: drop manual JSON.stringify for jsonb columns.
- [x] Verify: backend `npm run build` + `npm run test`; migrate+seed verified against disposable `postgres:17-alpine`. Commit. — `f0d33f3` (backend)

### Step G3 — Docker compose: volatile Postgres
- [x] Add `postgres` service (`postgres:17-alpine`, tmpfs data dir → fresh database on every start, `pg_isready` healthcheck).
- [x] Backend `DATABASE_URL` → compose Postgres; backend keeps migrate+seed on start (seeds fresh DB each start for tests).
- [x] Verified: volatility (marker row gone after recreate, DB reseeded), backend health via compose, frontend `build` + `test` (66) + `test:mock` (140), backend tests (17). Commit. — `550a42c`
- [x] E2E baseline confirmed **50/51 with `--workers=1`** (CI mode): single failure is `charting adds stocks via search`, caused by the KrakenD issue below — pre-existing, unrelated to this migration.
- [x] **Resolved blocker for Phase 2**: KrakenD CE stripped query strings on all endpoints even with `querystring_params` configured (verified with minimal repro against `krakend:2.13`). Resolved by replacing KrakenD with an nginx gateway (Backend Topology T2, `a9a4a5b`) — nginx forwards query strings natively; charting e2e now passes.
- [ ] **Note (e2e determinism)**: local runs use `fullyParallel`; multiple workers race on the shared stateful mock (`example-service-mock` keeps mutations in memory across runs), so assertion failures drift run-to-run. Serial (`--workers=1`) against a freshly recreated stack is deterministic and is what CI uses. If local parallel e2e fails oddly: `docker compose restart example-service-mock` (or down/up) first.

### Step G4 — Docs sweep: remove remaining SQLite mentions
- [x] Rewrite `docs/proposals/testing-strategy.md` environment tiers for Postgres (incl. KrakenD query-string blocker note).
- [x] Update backend cross-reference `docs/testing-strategy.md`; auth proposal wording; plan.md pointers (historical steps kept as record).
- [x] Commit. — `f796be9` (frontend), `5836edb` (backend)

### Step G5 — Cluster deployment (**last point — discuss separately first**)
- [x] Dedicated user + database via operator: `portfoliost` user (least-privilege, non-superuser) owning `portfoliost` DB added to `postgrescluster-pfire.yaml` → secret `postgres-pfire-pguser-portfoliost`. Commit `7e30d4042` (homelab).
- [x] One-time manual fix for PG15+ public-schema lockdown: PGO creates the DB owned by `postgres`, so `public` is not writable by the app role and drizzle-kit migrate fails with a silent exit 1 (`42501 insufficient_privilege`). Applied as superuser in DB `portfoliost`: `ALTER SCHEMA public OWNER TO portfoliost;` — re-run if the DB is ever recreated.
- [x] Backend HelmRelease switched to cluster Postgres: `DATABASE_URL` from secret key `uri`, image v1.0.7 (first Postgres build), command override skips `db:seed` in production, SQLite PVC dropped. Commit `16769db49` (homelab).
- [x] Verified live: migrations apply at boot, `user_preferences` table created (owned by `portfoliost`, 0 rows = no seed), pod Ready on `/health`.

---

## Backend Topology — Coarse Modules + nginx Edge

Proposal: [backend-topology.md](proposals/backend-topology.md) (accepted 2026-08-22). Splits the backend into coarse modules (`users-auth`, `portfolio-domain` incl. wallets, `watchlists`, `market-data`, `misc`, future `backtest`), replaces KrakenD with nginx, and introduces one URL source of truth for per-module mock↔real switching.

> Cluster (homelab) changes are deferred to the last step of this phase.

### Step T1 — Proposal
- [x] Write `docs/proposals/backend-topology.md` — decisions D1–D11 (nginx edge, provider tier openst/cachest, services.env→ConfigMap switching, `/__meta`, per-module JWT, schema-per-module, sync REST + event candidates, sync UI, auth_request preflight, public shares, jobs/backtest pattern). Commit. — `ec99b3f`

### Step T2 — Replace KrakenD with nginx in docker compose
- [x] Create `deploy/services.env` — single source of truth, one `API_*_URL` key per module, all defaulting to `http://example-service-mock:4010`.
- [x] Create `gateway/default.conf.template` (envsubst templating): `listen 8080`; per-module `location` blocks → upstream vars; CORS headers with `always` (origins `:3000`/`:8080`, methods GET/POST/PATCH/PUT/DELETE, headers Authorization/Content-Type/Accept); `OPTIONS` → 204; `/.well-known/*` → auth upstream.
- [x] Delete `krakend/` directory.
- [x] Rewire `docker-compose.yml`: `krakend` service → `gateway` (`nginx:alpine`, templates mount, `env_file: deploy/services.env`, port `8080:8080`); rename issuer refs to `http://gateway:8080` (mock `OIDC_ISSUER`, backend `POCKETID_ISSUER_URL`). — `a9a4a5b`
- [x] Smoke verified through gateway: login round-trip, `/api/charting/compare?symbols=` returns real comparison data (query strings preserved), OIDC discovery doc (`issuer=http://gateway:8080`), OPTIONS preflight → 204 + CORS headers, CORS on error responses, no ACAO for disallowed origins, unauthenticated parity (404/401 identical to direct-mock).
- [x] Fix pre-existing broken test: `edit position ... add row` expected `toHaveCount(11)` — an erroneous adaptation from `069adf2` that only matched polluted stateful-mock state; restored the authored `toHaveCount(2)` from `6cf127d` (dialog is positionId-filtered; seeded META has exactly 1 tx). — `bbe62fb`
- [x] Verify: build ✓ · unit 66/66 ✓ · mock 140/140 ✓ · **e2e 51/51** (CI mode, freshly recreated stack) — charting query-string flake resolved by design.

### Step T3 — Docs sweep
- [x] README.md + mocks/README.md: replace KrakenD sections with nginx gateway; flip instructions now point at `deploy/services.env` (shell-env overrides no longer reach containers after moving URLs into `env_file`); service table includes gateway/backend/postgres; e2e determinism note added.
- [x] `docs/proposals/testing-strategy.md`: query-string blocker marked resolved (Phase 2 unblocked), KrakenD wording → nginx gateway.
- [x] `mocks/oidc/index.js`: stale KrakenD comments updated (behavior unchanged).
- [x] Mark T2/T3 done here; adjust Phase 2 "Switch KrakenD route" wording. Commit.

### Step T5 — First module: users-auth extracted (playbook established)
- [x] Renamed `Marx2/portfoliost-backend` → `Marx2/portfoliost-users-auth` (history kept; CI image follows repo name). Module ships `/health`, `/__meta` (D4), `/internal/verify` (D9 stub), `users_auth` schema (D6) with data-preserving hand-written migration. Backend 21/21. CI image v1.0.8. — backend `c707b5d`
- [x] Compose: service `users-auth`; services.env consolidated to one key per module (D3): `API_AUTH_URL`+`API_USERS_URL` → `API_USERS_AUTH_URL`; gateway routes `/api/auth`, `/api/users`, `/.well-known/` via it. Suite green (build, unit 66/66, mock 140/140, e2e 51/51); flip test verified real↔mock switching. — portfoliost `c9493af`
- [x] Cluster: app dir/HelmRelease/service renamed `portfoliost-users-auth` (image pinned to GHCR-verified v1.0.8), ingress paths repointed; live checks passed (`/__meta` = users-auth/v1.0.8, table in `users_auth` with data preserved, old resources pruned). Wedged pending-install recovered per playbook ops notes. — homelab `cab0fecfe`
- [x] Wrote [MODULARISATION.md](MODULARISATION.md) — naming conventions + step-by-step extraction checklist for the next modules.

## Phase 3 — instruments module (provider tier realized)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — second extracted module; data from openst/cachest via in-module adapters (D2); compose gains redis/openst/cachest for local testing. Local verification only (no cluster changes this phase).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass (unit + docker-compose level, standalone-service compose for provider repos).

### Step I1 — AGENTS.md rules
- [x] Working guidelines extended: step-test-commit discipline, provider-tier-first, MODULARISATION.md as the module playbook. — `3946c44`

### Step I2 — Proposal
- [x] Write `docs/proposals/instruments-provider-module.md` (D12–D15: full instruments surface JWT-protected, per-endpoint source map openst/cachest/db-seed, no direct gateway→cachest routing, compose provider tier). Commit.

### Step I3 — openst extensions
- [x] New endpoints behind existing Redis-cache pattern: profile, quote, price history (ohlcv variant), fundamentals, metrics, projections, calendar (earnings/dividend windows), search. Tokens from `.env`. eps-surprises + institutional ownership verified unreachable at current FMP tier (402) → stay on existing mock calls per D13.
- [x] pytest suite green (92 tests) + standalone docker compose smoke: every new route curl-checked live incl. 4xx paths and cache cold/warm timing. openst@389f29a.

### Step I4 — cachest routes
- [x] `config.yaml`: routes proxying new openst endpoints (TTL/stale policy), JSON passthrough verified. Added declared `query_params` support (URL substitution + cache-key inclusion + 422) and collision-free template cache keys. cachest@170b1cf.
- [x] pytest green (58 tests) + standalone docker compose smoke incl. cache-hit behavior (MISS→HIT, per-window key separation, 422 on missing params).

### Step I5 — portfoliost-instruments scaffold
- [x] New private repo `Marx2/portfoliost-instruments` from users-auth skeleton (Hono/Drizzle/Postgres/PGlite/jose, /health + /__meta (`service: instruments`) + /internal/verify, CI pipeline). JWT-protected `/api/instruments/symbols` stub; empty `instruments` pgSchema (no seeds per D13). 5 vitest green + tsc clean locally.
- [x] Push → first CI image published on GHCR: release v1.0.0, image `ghcr.io/marx2/portfoliost-instruments:v1.0.0` verified via manifest inspect.

### Step I6 — schema + persistence scope
- [x] Superseded per decision 2026-08-23 (user): no DB seeding — providerless endpoints (eps-surprises, ownership, peers, seasonality, IR/transcripts) keep existing mock-backed gateway calls until provider research unlocks them (see docs/openst-coverage.md). Module keeps Drizzle+Postgres wiring per playbook but ships no seed data; any schema is limited to what real features need.

### Step I7 — controllers pt1
- [x] search, :symbol detail, profile, metrics, overview-metrics, quote, history (+price) — adapters call cachest, translate to example-service shapes (`generated/api-types`). Market-phase detection, fractional percentChange normalization, monthly OHLCV aggregation included.
- [x] Handler tests with mocked cachest adapter + pure translation tests green (28 tests, tsc clean). CI v1.0.1 image published.

### Step I8 — controllers pt2
- [ ] fundamentals, eps-surprises, calendar, ownership, dividends, peers, seasonality, projections, compare, investor-relations (+transcript).
- [x] I8a (2026-08-23): fundamentals, calendar, dividends, projections, compare + `price?date=` historical close. Wired into compose (`instruments`+`cachest`+`openst`+`redis`, gateway upstream flipped); verified live through gateway. Required: cachest `/dividends/{ticker}` route + 404 pass-through; openst dividend-history date fix for non-datetime indexes. Tests: instruments 66 unit, cachest 61, openst 93, frontend build/unit/mock/e2e green.
- [x] I8b (2026-08-23): seasonality (real — monthly avg/median/min/max returns computed from OHLCV), eps-surprises (derived from quarterly income statements; estimates = YoY-baseline quarter since FMP free tier has no estimate endpoints), peers (same-sector compare rows from curated large-cap candidate universe with live sector profiles), investor-relations (+transcript stub) derived from reported quarters. FMP premium blocks ownership/historical-eps/transcripts (402 verified); ownership endpoint deferred until a provider exists — frontend falls back gracefully. Tests: instruments 46 unit, frontend build/unit/mock/e2e green.
- [ ] Tests green; `/__meta` reflects real impl.

### Step I9 — module stack test
- [x] Compose stack: instruments + openst + cachest (+redis) standalone test with contract-shape curl checks through the gateway template. — `scripts/instruments-stack-test.mjs` (`npm run test:stack`): 29 contract checks across the full `/api/instruments/*` surface (detail, profile, quote, metrics, overview-metrics, search, history, fundamentals, calendar, dividends, projections, compare, seasonality, eps-surprises, peers, IR events+transcript, historical price) with upstream auto-detection.
- [x] Flip test: API_INSTRUMENTS_URL → real module; distinguishing checks vs mock. — Ran both modes: `real` 29/29 (detected real via dividend history predating 2000), flipped gateway to example-service-mock: `mock` 29/29 (shapes identical across backends). Rest state stays on the real module (mock phase-out direction); I10's "default stays mock" is superseded by I8a wiring.

### Step I10 — portfoliost wiring
- [x] docker-compose.yml: redis + openst (env_file ../openst/.env) + cachest services; services.env default stays mock; docs sweep (README, mocks/README). — Compose services landed with I8a; the "default stays mock" line is superseded: `API_INSTRUMENTS_URL` now defaults to the real stack (`http://instruments:3000`), fallback to mock documented in README/mocks/README/services.env. Docs swept (README architecture + service table + env table + migration note; mocks/README env table).
- [x] Full suite green: build · unit 66 · mock 140 · e2e 39 (plan's "51" was stale) · stack 29/29 (real mode).

### Step I11 — closeout
- [ ] plan.md final marks + proposal source-map cross-check corrected from implementation findings.

### Later phases (not started)
- Module extraction (market-data first), `/__meta` endpoints, D9 edge auth once `users-auth` is real.
- Cluster rollout: per-module switching via git-managed ingress paths (`service-urls` ConfigMap only for backend-to-backend calls once modules exist).
- Backtest module: DB queue + compose worker, k8s Jobs in cluster (see proposal D11).

### Step T4 — Cluster rollout: ingress path routing, drop homelab krakend
- [x] `cluster/apps/pfire/portfoliost/app/helmrelease.yaml`: ingress paths now `/` → portfoliost, `/api/auth` + `/api/users` → portfoliost-backend:3000, `/api` → example-service-mock:4010 (ingress-nginx longest-prefix match replaces the gateway container; cluster switching model = one path entry per module, git-managed). Commit `e6b39b378` (homelab).
- [x] Delete `cluster/apps/pfire/krakend/` + kustomization ref; Flux pruned HelmRelease/deployment/service/configmap.
- [x] Verified live through host: 4 upstreams on ingress; `/api/auth/me` unauth → backend JWT-validation error copy; `/api/charting/compare?symbols=` → mock JSON with query string intact; SPA 200. Mock accepts real PocketID JWTs (sub+email decoded, no signature check) so UI flow unchanged.
