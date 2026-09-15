# plan.md — example-service.ai parity (Investments main page + portfolio transactions) - archived work

Long-running plan. Each step is implemented, verified (build + unit + mock + e2e), committed, and then marked here.

Legend: `[ ]` pending · `[x]` done

## 1. Investments main page + portfolio transactions (example-service parity)

### 1.1 Mock + API + store: cash movement fields (foundation) (was Step 1)
- [x] `mocks/wallets/index.js` `mutate()`: read `transaction_date`, `payment_method`, `fees`, `fees_type`, `to_wallet_id`; deposit returns `new_balance`, withdraw returns `remaining_balance`, transfer also credits destination wallet.
- [x] `src/api/wallets.ts` + `src/stores/wallets.ts`: extend deposit/withdraw/transfer input types and pass-through.
- [x] `mocks/tests/run.mjs`: round-trip checks for new fields.
- [x] Verify: `npm run test:mock` + `build` + `test`. Commit. — `509209f`

### 1.2 Main page: cash balance currency breakdown (was Step 2)
- [x] `InvestmentsView.vue`: total + per-currency rows (USD 100%) from `walletsStore.wallets`.
- [x] Update `tests/unit/modules/portfolios/InvestmentsView.test.ts`.
- [x] Verify: `npm run test:mock` + `build` + `test` + `test:e2e`. Commit. — `6c40ec7`

### 1.3 PortfolioCard: Add Position opens AddPositionDialog (was Step 3)
- [x] `PortfolioCard.vue`: "Add Position" link → button emitting `add-position`; `InvestmentsView.vue` hosts `AddPositionDialog` for the selected portfolio. News link already targets the portfolio news tab (verify).
- [x] Update `tests/e2e/parity-portfolios.spec.ts` (link → button + dialog assertion).
- [x] Verify: `npm run test:mock` + `build` + `test` + `test:e2e`. Commit. — `4fa6dc7`

### 1.4 Deposit/Withdraw/Transfer modal rework (shared component) (was Step 4)
- [x] New `WalletCashModals.vue` used by card + detail screen.
  - Deposit: Amount, Description (optional), Transaction Date, Confirmation summary, Cancel/Deposit.
  - Withdraw: Available Balance, Amount, Transaction Date, Description, Payment Method select (Bank Transfer / Card / Wire / PayPal), confirmation w/ Remaining Balance.
  - Transfer: From Wallet (pre-filled), To Wallet, Amount + "Transfer All" + Available, Transfer Date, Fees (optional, % / $ toggle), Cancel/Transfer.
- [x] Rewire `CashWalletCard.vue` + `WalletsView.vue` to use it.
- [x] Fix mock: transfers debit source (amount + fees) and credit destination.
- [x] Verify: `npm run test:mock` + `build` + `test` + `test:e2e`. Commit. — `e313e47`

### 1.5 Wallet detail screen + card navigation (was Step 5)
- [x] Route `wallets/:id` → `/en/portfolios/wallets/:id` (example-service path): back, Rename, metric strip (Balance/Available/Currency), Deposit/Transfer/Withdraw/Delete, always-visible Balance History chart with timeframe + High/Low/Avg stats, Recent Transactions + View All.
- [x] `CashWalletCard.vue`: chart always visible (drop `showHistory`), History button + card click → wallet detail.
- [x] Verify: `npm run test:mock` + `build` + `test` + `test:e2e`. Commit. — `149117b`

### 1.6 Edit portfolio transaction modal (was Step 6)
- [x] `TransactionsView.vue` + `PortfolioTransactionsTab.vue`: stock header (logo, symbol (US) type, name, Historical Price), Purchase Date, Cash portfolio select, Quantity × Price per share, Fees $/% toggle, Total Cost. PATCH adds `executedAt`, `walletId`, `feesType`. — `f900704`

### 1.7 Delete confirmation dialogs (was Step 7)
- [x] `TransactionsView`, `PortfolioTransactionsTab`, `CashTransactionsView`: confirm dialog before delete (mirror existing delete-confirm pattern). — `1554756`

### 1.8 Buy position modal fields (was Step 8)
- [x] `AddPositionDialog.vue` stock step: Purchase Date, Cash portfolio select, Fees $/% toggle, Total. Wire `walletId`, `feesType`, `executedAt` through `createPortfolioPosition` + mock POST `/positions`. — `c2e8976`

### 1.9 Grouping filter on transactions (was Step 9)
- [x] Mock: enrich transactions with `sector`/`country` via symbol join from positions.
- [x] `TransactionsView` (+ `PortfolioTransactionsTab`): "Group by" — None / Kind of investment / Sector / Country (reuse holdings grouping pattern). — `4803970`

### 1.10 Wallet transactions column order fix (was Step 10)
- [x] `CashTransactionsView.vue`: header order → Date, Wallet, Type, Description, Amount (matches body). (97be3dd)

### 1.11 Wallet detail recent transactions actions (was Step 11)
- [x] `WalletDetailView.vue`: Recent Transactions rows gain Edit + Delete (with confirmation) actions; edit modal (Type/Amount/Date/Description) + ConfirmDeleteModal mirror example-service. Mock `/wallets/:id/transactions` now reflects recent PATCH/DELETE overrides. — `397f1c7`

### 1.12 Dark mode (class strategy + sidebar toggle) (was Step 12)
- [x] Theme foundation: `tailwind.config.js` `darkMode: "class"`, `src/stores/theme.ts` (light/dark/system with `localStorage` + `matchMedia`, reactive `systemDark` so OS changes apply live in system mode), `index.html` inline pre-hydration script (no FOUC), `init()` in `src/main.ts`, `dark:` base styles in `src/styles/main.css` (`body`, `.card`, `.btn-secondary`, `.btn-ghost`, `.btn-red-ghost`, `.input`, `.label`).
- [x] `SidebarNav.vue` + `AppLayout.vue`: sidebar, main area, nav items get `dark:` variants; Theme dropdown (Light/Dark/System) with sun/moon/monitor icons. `ProfileView` gains an Appearance card with the same three options.
- [x] All views/components get `dark:` variants for their mapped slate/blue/red/green/amber tokens (bg/text/border/divide), including modals (`AddPositionDialog`, `EditPositionDialog`, `EditTransactionModal`, `WalletCashModals`, `ConfirmDeleteModal`, `InstrumentSearchModal`) and active pagination/history pills (`dark:bg-slate-700`).
- [x] Tests: `tests/unit/stores/theme.test.ts` (default/apply/persist/system/fallback) + e2e coverage for the sidebar dropdown and profile appearance switcher.
- [x] Verify: `npm run build` + `test` + `test:mock` + `test:e2e`. Commit.

---

## 2. portfoliost-backend — Database Layer (Drizzle + SQLite) *(historical — superseded by §7 Postgres Migration)*

Backend lives at `../portfoliost-backend/`. Current database proposal: `../portfoliost-backend/docs/database-postgres-drizzle.md`. Steps below are a historical record of the original (since-replaced) SQLite implementation.

### 2.1 (was B1) — Project scaffold
- [x] `../portfoliost-backend/`: `package.json` (type: module), `tsconfig.json`, `src/index.ts` (Hono server with `/health` endpoint), `vitest.config.ts`.
- [x] `npm test` passes (health endpoint test).
- [x] Commit. — `300cf40`

### 2.2 (was B2) — Drizzle + SQLite setup
- [x] Install `drizzle-orm`, `@libsql/core`, `@libsql/client`, `drizzle-kit`. Add `src/db/schema.ts`, `src/db/index.ts` (DB connection), `drizzle.config.ts`.
- [x] Schema: `user_preferences` table (userId PK, language, uiPreferences JSON, customBenchmarks JSON, customTimeframes JSON, onboardingStatus JSON, onboardingDraft JSON, createdAt, updatedAt).
- [x] Generate initial migration: `npx drizzle-kit generate`.
- [x] `npm test` passes.
- [x] Commit. — `3edc30c`

### 2.3 (was B3) — User preferences CRUD endpoints
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

### 2.4 (was B4) — Dockerize
- [x] `Dockerfile` (node:22-alpine, build + run, expose 3000, healthcheck).
- [x] `.dockerignore` (exclude node_modules, .git, tests).
- [x] `src/server.ts` — Hono server entrypoint with `@hono/node-server`.
- [x] Build: `docker build -t portfoliost-backend .` succeeds.
- [x] Container healthcheck passes, profile endpoint returns correct data.
- [x] Commit. — `76b8d0f`

### 2.5 (was B5) — Add to docker compose
- [x] `portfoliost-backend` service in `docker-compose.yml` with volume for SQLite data persistence.
- [x] Update KrakenD env var `API_USERS_URL` → `http://portfoliost-backend:3000`.
- [x] Add `X-User-*` headers to KrakenD `input_headers` for user endpoints.
- [x] `docker compose up --build` works, all 4 services start.
- [x] User endpoints accessible through KrakenD at `localhost:8080/api/users/*`.
- [x] Existing mock routes (portfolios, wallets, etc.) still work.
- [x] `npm run test` + `npm run test:mock` pass in portfoliost.
- [x] Commit. — `5a60063`

---

## 3. OpenAPI Contracts Repo + Integration

Separate contracts repo at `github.com/Marx2/portfoliost-contracts`, published to GitHub Packages as `@marx2/contracts`. Source of truth for API types, consumed by both frontend (openapi-typescript) and backend (hono-zod-openapi).

### 3.1 (was C1) — Create portfoliost-contracts repo
- [x] Create GitHub repo `Marx2/portfoliost-contracts`.
- [x] `package.json` — `name: "@marx2/contracts"`, type: module, exports `./openapi.yaml`.
- [x] `.npmrc` — `registry=https://npm.pkg.github.com`.
- [x] `openapi.yaml` — copy `example-service-real-api.yaml`, add `/api/users/*` endpoints from portfoliost-backend, adjust `info.title` → "Portfoliost API", adjust `servers`.
- [x] `example-service-reference/example-service-real-api.yaml` — original example-service spec as reference.
- [x] `.github/workflows/publish.yml` — on push to main: `npm publish` to GitHub Packages.
- [x] `README.md` — brief description, how both repos consume it.
- [x] Verify: push, confirm package appears in GitHub Packages.
- [x] Commit.

### 3.2 (was C2) — Backend: contract-first with hono-zod-openapi
- [x] Install `@marx2/contracts`, `hono-zod-openapi`, `zod` in portfoliost-backend.
- [x] Create `src/schemas/users.ts` — Zod schemas for all user endpoints (request params, body, headers, responses).
- [x] Rewrite `src/routes/users.ts` — use `openApi(operation)` middleware + `c.var.res()` typed responses.
- [x] Add `src/doc.ts` — `createOpenApiDocument()` mounting at `GET /api/doc`.
- [x] Register `/api/doc` route in `src/index.ts`.
- [x] Add `npm run gen:openapi` script — exports generated spec to `dist/openapi.yaml`.
- [x] Tests: all existing endpoint tests pass, new test validates generated spec.
- [x] Commit.

### 3.3 (was C3) — Frontend: openapi-typescript replaces gen-types.mjs
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

### 3.4 (was C4) — Cleanup
- [x] Move `docs/proposals/database-drizzle-sqlite-postgres.md` → `../portfoliost-backend/docs/`.
- [x] Update this plan with commit hashes for C1–C3.
- [x] Commit.

---

## 4. PocketID OIDC Auth Integration

Gradual migration: local mock stays as-is for development, cluster uses PocketID. Frontend detects mode via `VITE_OIDC_ISSUER_URL` / `VITE_OIDC_CLIENT_ID` env vars.

### 4.1 (was A1) — Backend auth infrastructure
- [x] Install `jose` in portfoliost-backend for JWT validation.
- [x] Create `src/auth.ts` — `userIdentityMiddleware` (dual-mode: X-User-* headers for Docker Compose, JWT validation for cluster), `validateJwt`, `requireGroup`.
- [x] Create `src/routes/auth.ts` — `GET /api/auth/me`, `POST /api/auth/logout`.
- [x] Register auth routes in `src/index.ts`.
- [x] Update `src/routes/users.ts` to import from `auth.ts` instead of `context.ts`.
- [x] Delete `src/context.ts`.
- [x] Build + test pass. Commit.

### 4.2 (was A2) — Contracts: groups in AuthUser
- [x] Add `groups` array to `AuthUser` schema in `portfoliost-contracts/openapi.yaml`.
- [x] Commit + push contracts. GitHub Actions publishes.
- [x] Regenerate frontend types (`npm run gen:types`).
- [x] Regenerate backend OpenAPI spec (`npm run gen:openapi`).

### 4.3 (was A3) — Frontend OIDC flow
- [x] Create `src/auth/pkce.ts` — PKCE utilities (code_verifier, code_challenge, state, authorization URL builder).
- [x] Create `src/modules/auth/AuthCallback.vue` — handles `/auth/callback` redirect, validates state, exchanges code via backend.
- [x] Add `/auth/callback` route to router.
- [x] Update `src/api/auth.ts` — add `loginWithCode()` calling `POST /api/auth/token`.
- [x] Update `src/stores/auth.ts` — add `loginWithCode()` action.
- [x] Update `LoginView.vue` — detect OIDC mode, show "Sign in with Passkey" button above email form.
- [x] Typecheck + unit tests + mock tests pass. Commit.

### 4.4 (was A4) — Switch from npm registry to git URL
- [x] Remove `@marx2/contracts` from GitHub Packages (private: true, delete publish workflow).
- [x] Switch both repos to `github:Marx2/portfoliost-contracts` in package.json.
- [x] Remove `.npmrc` files, `GITHUB_TOKEN` Dockerfile arg.
- [x] Docker build succeeds without auth tokens. Commit.

### 4.5 (was A5) — Backend: token exchange endpoint
- [x] Add `POST /api/auth/token` to portfoliost-backend — exchanges OIDC code + code_verifier for JWT via PocketID token endpoint.
- [x] Env vars: `POCKETID_CLIENT_ID`, `POCKETID_CLIENT_SECRET`, `POCKETID_TOKEN_URL`.
- [x] Frontend sends `{ code, code_verifier, redirect_uri }` to backend; backend calls PocketID, validates JWT, upserts user_preferences, returns `{ access_token, token_type, expires_in, user }`.
- [x] Tests. Commit.

### 4.6 (was A6) — Frontend: backend token exchange integration
- [x] Update `AuthCallback.vue` to call `POST /api/auth/token` with code + verifier.
- [x] Update `auth.ts` API client — `loginWithCode()` sends to backend instead of direct exchange.
- [x] Test flow with Docker Compose (mock mode) — callback redirects to login in mock mode.
- [x] Typecheck + tests. Commit.

### 4.7 (was A7) — Mock OIDC endpoints for local development
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

### 4.8 (was A8) — Profile avatar from OIDC
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

## 5. Cluster Deployment

### 5.1 (was K1) — portfoliost-backend HelmRelease
- [x] Create `cluster/apps/pfire/portfoliost-backend/` directory structure (ks.yaml, app/kustomization.yaml, app/helmrelease.yaml).
- [x] HelmRelease: `app-template` chart, image `ghcr.io/marx2/portfoliost-backend:latest`, replicas: 1.
- [x] Env vars: `POCKETID_CLIENT_ID`, `POCKETID_CLIENT_SECRET`, `POCKETID_ISSUER_URL`, `POCKETID_AUDIENCE`, `POCKETID_TOKEN_URL`.
- [x] Volume for SQLite data (or use CrunchyData Postgres).
- [x] Healthcheck endpoint `/health`.
- [x] Add to `cluster/apps/pfire/kustomization.yaml`. Commit.

### 5.2 (was K2) — KrakenD ConfigMap: route auth + users to backend
- [x] Update `cluster/apps/pfire/krakend/app/krakend-configmap.yaml`:
  - Change `API_AUTH_URL` from mock to `http://portfoliost-backend.pfire.svc.cluster.local:3000`.
  - Change `API_USERS_URL` from mock to `http://portfoliost-backend.pfire.svc.cluster.local:3000`.
- [x] Verify all other endpoints still route to mock. Commit.

### 5.3 (was K3) — portfoliost ingress: remove oauth2-proxy auth
- [x] Remove `nginx.ingress.kubernetes.io/auth-url` and `auth-signin` annotations from portfoliost HelmRelease.
- [x] Auth is now handled by the app itself (PocketID OIDC). Commit.

### 5.4 (was K4) — PocketID OIDCClient CRD
- [x] Create `PocketIDOIDCClient` CRD for portfoliost in `cluster/apps/networking/pocket-id-operator/app/`.
- [x] callbackURLs: `https://portfoliost.${SECRET_DOMAIN}/auth/callback`.
- [x] logoutURLs: `https://portfoliost.${SECRET_DOMAIN}/logout`.
- [x] Operator creates client and writes credentials to secret `portfoliost-oidc-credentials`.
- [x] Reference secret in portfoliost-backend HelmRelease. Commit.

## Related Proposals

- [Testing Strategy — Mock Phase-Out and Database Environment Tiers](proposals/testing-strategy.md)

## 6. Testing Strategy Implementation

### 6.1 (was Phase 1) — Environment-Aware SQLite + Seed System
- [x] Add `DATABASE_URL` env var to `portfoliost-backend/src/db/index.ts` (defaults to `file:data/portfoliost.db`).
- [x] Update `drizzle.config.ts` to respect `DATABASE_URL`.
- [x] Create `seed/run.mjs` + `src/db/seed.ts` seed runner (checks if `user_preferences` is empty, runs SQL fixtures).
- [x] Create `seed/001_user_preferences.sql` with test user data.
- [x] Add `db:seed` npm script to `portfoliost-backend/package.json`.
- [x] Update `portfoliost-backend/Dockerfile`: copy `seed/`, CMD runs `db:migrate && db:seed`.
- [x] Update `docker-compose.yml`: remove `backend-data` volume, add `tmpfs: [/tmp]`, set `DATABASE_URL=file:/tmp/portfoliost.db`.
- [x] Fix pre-existing auth test bug (`code_verifier` → `verifier`).
- [x] Verify: build + unit + mock + e2e (50/51, 1 pre-existing charting flake). Commit. — `06fa23a` (backend) `8ab90ba` (frontend)

### 6.2 (was Phase 2) — First Endpoint Migration

- [x] Pick endpoint to migrate (suggestion: `GET /api/users/preferences`).
- [x] Implement in `portfoliost-backend`.
- [x] Write backend unit tests.
- [x] Add seed data if needed.
- [x] Switch gateway route in `deploy/services.env`: `API_USERS_URL` →
  `http://portfoliost-backend:3000`.
- [x] Add E2E test for the endpoint.
- [x] Delete mock handler.
- [x] Verify: build + unit + mock + e2e. Commit.

### 6.3 (was Phase 3) — Subsequent Endpoints

- [x] `/api/auth/*` + `/api/users/*` (partially done — auth + users routes exist).
- [x] `/api/portfolios/*`
- [x] `/api/wallets/*`
- [ ] `/api/watchlists/*`
- [x] `/api/instruments/*`
- [ ] `/api/charting/*`

### 6.4 (was Phase 4) — Mock Removal

- [x] Refactor `mocks/` directory. Do separate container.

---

## 7. Postgres Migration

Backend switches from SQLite/libSQL to **Postgres everywhere** (unit tests via PGlite, docker compose, cluster). See `../portfoliost-backend/docs/database-postgres-drizzle.md`.

> **Cluster deployment changes are deferred to the last point of this phase and will be discussed separately before implementation** (credentials, network policy, migration job against the existing cluster Postgres).

### 7.1 (was G1) — Proposal rewrite + plan
- [x] Rename `docs/database-drizzle-sqlite-postgres.md` → `docs/database-postgres-drizzle.md`, rewrite as Postgres-only proposal (jsonb columns, ISO-text timestamps, volatile compose DB, PGlite unit tests).

### 7.2 (was G2) — Backend dialect switch (SQLite → Postgres)
- [x] `src/db/schema.ts` → `drizzle-orm/pg-core` (`pgTable`, `jsonb`).
- [x] Driver: `@libsql/client` → `postgres` (postgres-js); remove `@libsql/client` + `@libsql/core`.
- [x] `drizzle.config.ts` → `dialect: "postgresql"`; regenerate fresh baseline migration.
- [x] Unit tests → embedded Postgres (PGlite) running the real migrations folder; drop hand-written DDL.
- [x] Seed runner + fixtures in Postgres SQL (`ON CONFLICT DO NOTHING`).
- [x] Routes/auth: drop manual JSON.stringify for jsonb columns.
- [x] Verify: backend `npm run build` + `npm run test`; migrate+seed verified against disposable `postgres:17-alpine`. Commit. — `f0d33f3` (backend)

### 7.3 (was G3) — Docker compose: volatile Postgres
- [x] Add `postgres` service (`postgres:17-alpine`, tmpfs data dir → fresh database on every start, `pg_isready` healthcheck).
- [x] Backend `DATABASE_URL` → compose Postgres; backend keeps migrate+seed on start (seeds fresh DB each start for tests).
- [x] Verified: volatility (marker row gone after recreate, DB reseeded), backend health via compose, frontend `build` + `test` (66) + `test:mock` (140), backend tests (17). Commit. — `550a42c`
- [x] E2E baseline confirmed **50/51 with `--workers=1`** (CI mode): single failure is `charting adds stocks via search`, caused by the KrakenD issue below — pre-existing, unrelated to this migration.
- [x] **Resolved blocker for Phase 2**: KrakenD CE stripped query strings on all endpoints even with `querystring_params` configured (verified with minimal repro against `krakend:2.13`). Resolved by replacing KrakenD with an nginx gateway (Backend Topology T2, `a9a4a5b`) — nginx forwards query strings natively; charting e2e now passes.
- [ ] **Note (e2e determinism)**: local runs use `fullyParallel`; multiple workers race on the shared stateful mock (`example-service-mock` keeps mutations in memory across runs), so assertion failures drift run-to-run. Serial (`--workers=1`) against a freshly recreated stack is deterministic and is what CI uses. If local parallel e2e fails oddly: `docker compose restart example-service-mock` (or down/up) first.

### 7.4 (was G4) — Docs sweep: remove remaining SQLite mentions
- [x] Rewrite `docs/proposals/testing-strategy.md` environment tiers for Postgres (incl. KrakenD query-string blocker note).
- [x] Update backend cross-reference `docs/testing-strategy.md`; auth proposal wording; plan.md pointers (historical steps kept as record).
- [x] Commit. — `f796be9` (frontend), `5836edb` (backend)

### 7.5 (was G5) — Cluster deployment (**last point — discuss separately first**)
- [x] Dedicated user + database via operator: `portfoliost` user (least-privilege, non-superuser) owning `portfoliost` DB added to `postgrescluster-pfire.yaml` → secret `postgres-pfire-pguser-portfoliost`. Commit `7e30d4042` (homelab).
- [x] One-time manual fix for PG15+ public-schema lockdown: PGO creates the DB owned by `postgres`, so `public` is not writable by the app role and drizzle-kit migrate fails with a silent exit 1 (`42501 insufficient_privilege`). Applied as superuser in DB `portfoliost`: `ALTER SCHEMA public OWNER TO portfoliost;` — re-run if the DB is ever recreated.
- [x] Backend HelmRelease switched to cluster Postgres: `DATABASE_URL` from secret key `uri`, image v1.0.7 (first Postgres build), command override skips `db:seed` in production, SQLite PVC dropped. Commit `16769db49` (homelab).
- [x] Verified live: migrations apply at boot, `user_preferences` table created (owned by `portfoliost`, 0 rows = no seed), pod Ready on `/health`.

---

## 8. Backend Topology — Coarse Modules + nginx Edge

Proposal: [backend-topology.md](proposals/backend-topology.md) (accepted 2026-08-22). Splits the backend into coarse modules (`users-auth`, `portfolio-domain` incl. wallets, `watchlists`, `market-data`, `misc`, future `backtest`), replaces KrakenD with nginx, and introduces one URL source of truth for per-module mock↔real switching.

> Cluster (homelab) changes are deferred to the last step of this phase.

### 8.1 (was T1) — Proposal
- [x] Write `docs/proposals/backend-topology.md` — decisions D1–D11 (nginx edge, provider tier openst/cachest, services.env→ConfigMap switching, `/__meta`, per-module JWT, schema-per-module, sync REST + event candidates, sync UI, auth_request preflight, public shares, jobs/backtest pattern). Commit. — `ec99b3f`

### 8.2 (was T2) — Replace KrakenD with nginx in docker compose
- [x] Create `deploy/services.env` — single source of truth, one `API_*_URL` key per module, all defaulting to `http://example-service-mock:4010`.
- [x] Create `gateway/default.conf.template` (envsubst templating): `listen 8080`; per-module `location` blocks → upstream vars; CORS headers with `always` (origins `:3000`/`:8080`, methods GET/POST/PATCH/PUT/DELETE, headers Authorization/Content-Type/Accept); `OPTIONS` → 204; `/.well-known/*` → auth upstream.
- [x] Delete `krakend/` directory.
- [x] Rewire `docker-compose.yml`: `krakend` service → `gateway` (`nginx:alpine`, templates mount, `env_file: deploy/services.env`, port `8080:8080`); rename issuer refs to `http://gateway:8080` (mock `OIDC_ISSUER`, backend `POCKETID_ISSUER_URL`). — `a9a4a5b`
- [x] Smoke verified through gateway: login round-trip, `/api/charting/compare?symbols=` returns real comparison data (query strings preserved), OIDC discovery doc (`issuer=http://gateway:8080`), OPTIONS preflight → 204 + CORS headers, CORS on error responses, no ACAO for disallowed origins, unauthenticated parity (404/401 identical to direct-mock).
- [x] Fix pre-existing broken test: `edit position ... add row` expected `toHaveCount(11)` — an erroneous adaptation from `069adf2` that only matched polluted stateful-mock state; restored the authored `toHaveCount(2)` from `6cf127d` (dialog is positionId-filtered; seeded META has exactly 1 tx). — `bbe62fb`
- [x] Verify: build ✓ · unit 66/66 ✓ · mock 140/140 ✓ · **e2e 51/51** (CI mode, freshly recreated stack) — charting query-string flake resolved by design.

### 8.3 (was T3) — Docs sweep
- [x] README.md + mocks/README.md: replace KrakenD sections with nginx gateway; flip instructions now point at `deploy/services.env` (shell-env overrides no longer reach containers after moving URLs into `env_file`); service table includes gateway/backend/postgres; e2e determinism note added.
- [x] `docs/proposals/testing-strategy.md`: query-string blocker marked resolved (Phase 2 unblocked), KrakenD wording → nginx gateway.
- [x] `mocks/oidc/index.js`: stale KrakenD comments updated (behavior unchanged).
- [x] Mark T2/T3 done here; adjust Phase 2 "Switch KrakenD route" wording. Commit.

### 8.4 (was T5, users-auth) — First module: users-auth extracted (playbook established)
- [x] Renamed `Marx2/portfoliost-backend` → `Marx2/portfoliost-users-auth` (history kept; CI image follows repo name). Module ships `/health`, `/__meta` (D4), `/internal/verify` (D9 stub), `users_auth` schema (D6) with data-preserving hand-written migration. Backend 21/21. CI image v1.0.8. — backend `c707b5d`
- [x] Compose: service `users-auth`; services.env consolidated to one key per module (D3): `API_AUTH_URL`+`API_USERS_URL` → `API_USERS_AUTH_URL`; gateway routes `/api/auth`, `/api/users`, `/.well-known/` via it. Suite green (build, unit 66/66, mock 140/140, e2e 51/51); flip test verified real↔mock switching. — portfoliost `c9493af`
- [x] Cluster: app dir/HelmRelease/service renamed `portfoliost-users-auth` (image pinned to GHCR-verified v1.0.8), ingress paths repointed; live checks passed (`/__meta` = users-auth/v1.0.8, table in `users_auth` with data preserved, old resources pruned). Wedged pending-install recovered per playbook ops notes. — homelab `cab0fecfe`
- [x] Wrote [MODULARISATION.md](MODULARISATION.md) — naming conventions + step-by-step extraction checklist for the next modules.

#### Deferred ideas from the topology phase (largely superseded by §8.5–§8.7)
- Module extraction (market-data first), `/__meta` endpoints, D9 edge auth once `users-auth` is real.
- Cluster rollout: per-module switching via git-managed ingress paths (`service-urls` ConfigMap only for backend-to-backend calls once modules exist).
- Backtest module: DB queue + compose worker, k8s Jobs in cluster (see proposal D11).

### 8.5 (was T4) — Cluster rollout: ingress path routing, drop homelab krakend
- [x] `cluster/apps/pfire/portfoliost/app/helmrelease.yaml`: ingress paths now `/` → portfoliost, `/api/auth` + `/api/users` → portfoliost-backend:3000, `/api` → example-service-mock:4010 (ingress-nginx longest-prefix match replaces the gateway container; cluster switching model = one path entry per module, git-managed). Commit `e6b39b378` (homelab).
- [x] Delete `cluster/apps/pfire/krakend/` + kustomization ref; Flux pruned HelmRelease/deployment/service/configmap.
- [x] Verified live through host: 4 upstreams on ingress; `/api/auth/me` unauth → backend JWT-validation error copy; `/api/charting/compare?symbols=` → mock JSON with query string intact; SPA 200. Mock accepts real PocketID JWTs (sub+email decoded, no signature check) so UI flow unchanged.

### 8.6 (was T5, cluster) — Cluster rollout: instruments module stack
- [x] Provider tier refresh: pushed openst (equity surface + dividend date fix → `ghcr.io/marx2/openst:v1.0.17`) and cachest (instruments routes + 404 pass-through → `v1.0.19`); homelab tags bumped; cluster cachest config gained the 10 instruments routes (FQDN `openst.pfire.svc.cluster.local`) while preserving its legacy routes. Commit `26253fabc` + `10b200287` (homelab).
- [x] Config discipline: merged cluster cachest config validated locally in docker compose against the real `cachest:v1.0.19` image before trusting Flux (first push had a YAML parse break — caught in-cluster, fixed, and the local compose test now guards that path).
- [x] `portfoliost-instruments` deployed: new `cluster/apps/pfire/portfoliost-instruments/` (Kustomization + HelmRelease modeled on users-auth — PocketID issuer/audience for JWT validation, `CACHEST_URL` → cluster cachest, `/health` probes), registered in pfire kustomization; ingress path `/api/instruments` → module ahead of the mock catch-all.
- [x] Ops incident: cachest redis sidecar crash-looped on a stale RDB (`format version 15`, predates current tag) on PVC `cachest-redis`; wiped dump via busybox job and redeployed — cache content is disposable by design.
- [x] Verified live: cachest `/dividends/AAPL` serves full history from 1987 through openst v1.0.17; instruments `/__meta` = `{service:instruments, impl:real, version:v1.0.2}`; unauthed `/api/instruments/AAPL/quote` returns the real module's JWT-validation copy through public ingress; SPA + other modules untouched. Authed end-to-end check pending one real PocketID passkey login.
- [x] T5b (2026-08-23): Research-tab fixes found by UI replay. Compose was 401ing every `/api/instruments/*` call (module demanded X-User headers the mock-IdP SPA never sends) — instruments gained a dev-only bearer fallback (stable identity from token claims; cluster unaffected, strict JWT verified via bogus-token rejection). Projections tab crashed on missing `earnings`/`revenue`/`recommendation` blocks — openst v1.0.18 exposes yfinance recommendation (mean/rating/analysts), instruments derives earnings/revenue baseline blocks from real reported quarters (FMP forward estimates are premium) and maps mean→bucket without inventing distributions; ownership route added as valid empty content (was 404). Verified in-browser: all 10 Research tabs render console-clean; e2e grew 39→47 (research specs now pass against live backend). Cluster bumped to instruments v1.0.3 + openst v1.0.18, caches flushed, `/__meta` = v1.0.3 live.
- [x] T5c (2026-08-23): price chart 3Y/5Y/10Y filters showed only 1 year — `/history` served ~365 days (mock did too, so parity hid the gap). Module now serves 11y daily / 20y monthly (2765 bars verified); SPA got `tickAmount` thinning so long-range x-axis labels stay readable. Verified in-browser: 10Y renders 2015→2026 (+1043% CAGR 27.5%). Cluster bumped to instruments v1.0.4. Commits `462e93e` (portfoliost), `f8ab1ac` (instruments), `89cebd261` (homelab).
- [x] T5d (2026-08-23): benchmark comparison — `/history?compare=spy|qqq|iwm` ignored by the module; now fetches ETF proxies over the same window, date-aligned to the symbol's trading days (carry-forward on gaps). Verified: legend shows AAPL + S&P 500 (SPY), two lines render. Cluster v1.0.5.
- [x] T5e (2026-08-23): Firefox crash investigation (2 minidumps: null-deref in main process at 174MB/64GB free) → search modal rendered 6000+ rows (single-letter SEC query) each with a logo request. Fixed: SPA requires 2+ chars + bounded rendering (`38d279f`, v1.0.11); module caps `/search` at 50 (`f9bca9f`, v1.0.6). Reproduced clean in real Firefox via Playwright.
- [x] T5f (2026-08-23): research symbol switching — same-route param changes never refetched (quick switcher + search select showed stale view); `<router-view :key="symbol">` + profile watcher (`9e6e0cf`).

### 8.7 (was T6) — Ticker reference database (adanos/free-ticker-database)
- [x] Evaluated adanos/free-ticker-database vs MeridianAlgo/No-Ticker-Left-Behind against actual committed data: adanos wins (MIT vs **no license**; 63.8k tickers/86 exchanges verified vs US-only 5.8k; PKN.WA resolves with ISIN+aliases vs zero WSE rows). Chosen as search + identity source; deep fundamentals stay on FMP profile.
- [x] T6a (2026-08-23, `87b7779`): `instruments.ticker_reference` table (first real Drizzle migration — fixed broken empty `_journal.json` scaffold), `tickerref:sync` script (`--file` seed / `--url` live, `--if-empty` boot guard), bundled seed snapshot (61,692 core listings). Compose boot: migrate → seed-if-empty → server, all verified live; PGlite unit tests for parser/upsert/search.
- [x] T6b (2026-08-23, `d008fec`): `/search` DB-first (exact ticker > prefix > name/alias substring, venue-suffix aware: `pkn.wa` → PKN@WSE) with openst fallback keeping e2e green pre-seed. Verified in-browser: PKN.WA search → ORLEN → overview.
- [x] T6c (2026-08-23, `0f1178c`): `/profile` fills ISIN/sector/country/exchange from the reference table when the provider omits them (provider data wins when present).
- [x] T6d (2026-08-23): cluster — DATABASE_URL from `postgres-pfire-pguser-portfoliost`, weekly `tickersync` CronJob (Mondays 04:30 UTC, `--url` live mode, Forbid concurrency), boot limit 128Mi→512Mi (seed OOM'd at 128Mi). Verified: v1.0.7 running, migrations applied, 61,692 rows seeded in cluster Postgres. Commits `91fc34010`, `cff51aca9` (homelab).

## 9. Instruments module (provider tier realized)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — second extracted module; data from openst/cachest via in-module adapters (D2); compose gains redis/openst/cachest for local testing. Local verification only (no cluster changes this phase).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass (unit + docker-compose level, standalone-service compose for provider repos).

### 9.1 (was I1) — AGENTS.md rules
- [x] Working guidelines extended: step-test-commit discipline, provider-tier-first, MODULARISATION.md as the module playbook. — `3946c44`

### 9.2 (was I2) — Proposal
- [x] Write `docs/proposals/instruments-provider-module.md` (D12–D15: full instruments surface JWT-protected, per-endpoint source map openst/cachest/db-seed, no direct gateway→cachest routing, compose provider tier). Commit.

### 9.3 (was I3) — openst extensions
- [x] New endpoints behind existing Redis-cache pattern: profile, quote, price history (ohlcv variant), fundamentals, metrics, projections, calendar (earnings/dividend windows), search. Tokens from `.env`. eps-surprises + institutional ownership verified unreachable at current FMP tier (402) → stay on existing mock calls per D13.
- [x] pytest suite green (92 tests) + standalone docker compose smoke: every new route curl-checked live incl. 4xx paths and cache cold/warm timing. openst@389f29a.

### 9.4 (was I4) — cachest routes
- [x] `config.yaml`: routes proxying new openst endpoints (TTL/stale policy), JSON passthrough verified. Added declared `query_params` support (URL substitution + cache-key inclusion + 422) and collision-free template cache keys. cachest@170b1cf.
- [x] pytest green (58 tests) + standalone docker compose smoke incl. cache-hit behavior (MISS→HIT, per-window key separation, 422 on missing params).

### 9.5 (was I5) — portfoliost-instruments scaffold
- [x] New private repo `Marx2/portfoliost-instruments` from users-auth skeleton (Hono/Drizzle/Postgres/PGlite/jose, /health + /__meta (`service: instruments`) + /internal/verify, CI pipeline). JWT-protected `/api/instruments/symbols` stub; empty `instruments` pgSchema (no seeds per D13). 5 vitest green + tsc clean locally.
- [x] Push → first CI image published on GHCR: release v1.0.0, image `ghcr.io/marx2/portfoliost-instruments:v1.0.0` verified via manifest inspect.

### 9.6 (was I6) — schema + persistence scope
- [x] Superseded per decision 2026-08-23 (user): no DB seeding — providerless endpoints (eps-surprises, ownership, peers, seasonality, IR/transcripts) keep existing mock-backed gateway calls until provider research unlocks them (see docs/openst-coverage.md). Module keeps Drizzle+Postgres wiring per playbook but ships no seed data; any schema is limited to what real features need.

### 9.7 (was I7) — controllers pt1
- [x] search, :symbol detail, profile, metrics, overview-metrics, quote, history (+price) — adapters call cachest, translate to example-service shapes (`generated/api-types`). Market-phase detection, fractional percentChange normalization, monthly OHLCV aggregation included.
- [x] Handler tests with mocked cachest adapter + pure translation tests green (28 tests, tsc clean). CI v1.0.1 image published.

### 9.8 (was I8) — controllers pt2
- [x] fundamentals, eps-surprises, calendar, ownership, dividends, peers, seasonality, projections, compare, investor-relations (+transcript). — All shipped via I8a/I8b below. Exception: ownership has no reachable provider (FMP 402 / intrinio 401) and serves valid empty content pending a provider upgrade.
- [x] I8a (2026-08-23): fundamentals, calendar, dividends, projections, compare + `price?date=` historical close. Wired into compose (`instruments`+`cachest`+`openst`+`redis`, gateway upstream flipped); verified live through gateway. Required: cachest `/dividends/{ticker}` route + 404 pass-through; openst dividend-history date fix for non-datetime indexes. Tests: instruments 66 unit, cachest 61, openst 93, frontend build/unit/mock/e2e green.
- [x] I8b (2026-08-23): seasonality (real — monthly avg/median/min/max returns computed from OHLCV), eps-surprises (derived from quarterly income statements; estimates = YoY-baseline quarter since FMP free tier has no estimate endpoints), peers (same-sector compare rows from curated large-cap candidate universe with live sector profiles), investor-relations (+transcript stub) derived from reported quarters. FMP premium blocks ownership/historical-eps/transcripts (402 verified); ownership endpoint deferred until a provider exists — frontend falls back gracefully. Tests: instruments 46 unit, frontend build/unit/mock/e2e green.
- [x] Tests green; `/__meta` reflects real impl. — `{"service":"instruments","impl":"real","version":"0.1.0"}` verified live through the gateway; instruments 46 unit + frontend build/unit/mock/e2e/stack green.

### 9.9 (was I9) — module stack test
- [x] Compose stack: instruments + openst + cachest (+redis) standalone test with contract-shape curl checks through the gateway template. — `scripts/instruments-stack-test.mjs` (`npm run test:stack`): 29 contract checks across the full `/api/instruments/*` surface (detail, profile, quote, metrics, overview-metrics, search, history, fundamentals, calendar, dividends, projections, compare, seasonality, eps-surprises, peers, IR events+transcript, historical price) with upstream auto-detection.
- [x] Flip test: API_INSTRUMENTS_URL → real module; distinguishing checks vs mock. — Ran both modes: `real` 29/29 (detected real via dividend history predating 2000), flipped gateway to example-service-mock: `mock` 29/29 (shapes identical across backends). Rest state stays on the real module (mock phase-out direction); I10's "default stays mock" is superseded by I8a wiring.

### 9.10 (was I10) — portfoliost wiring
- [x] docker-compose.yml: redis + openst (env_file ../openst/.env) + cachest services; services.env default stays mock; docs sweep (README, mocks/README). — Compose services landed with I8a; the "default stays mock" line is superseded: `API_INSTRUMENTS_URL` now defaults to the real stack (`http://instruments:3000`), fallback to mock documented in README/mocks/README/services.env. Docs swept (README architecture + service table + env table + migration note; mocks/README env table).
- [x] Full suite green: build · unit 66 · mock 140 · e2e 39 (plan's "51" was stale) · stack 29/29 (real mode).

### 9.11 (was I11) — closeout
- [x] plan.md final marks + proposal source-map cross-check corrected from implementation findings. — `docs/proposals/instruments-provider-module.md` D13 table updated with I8a/I8b status per endpoint (eps-surprises/peers/seasonality/IR now derived in module; ownership = empty-content stub pending provider; compare is single-symbol composition); `docs/openst-coverage.md` gaps annotated. Stale "Later phases" `/__meta` note corrected (instruments ships one).

## 10. Fees & FX-rate entry (contract / mock / UI)

Proposal: [fees-and-custom-fx.md](proposals/fees-and-custom-fx.md) (accepted 2026-08-24, D25–D33). FX foundation and supported-currency registry first, then: fees may carry their own currency (default = transaction currency) and transaction/fee each accept a custom exchange rate (`automatic` default). Applies to portfolio AND wallet transactions; finalizes wire shapes the wallets module (§11) consumes.

- [x] 10.1 Contracts — extend `Transaction`/`CashTransaction` + request bodies with `feeCurrency`, `rateSource`, `feeExchangeRate`, `feeRateSource`; `exchangeRate` nullable; regenerate `generated/api-types`; release contracts
- [x] 10.2 Mock — persist/echo resolved fields; static demo FX table settles foreign-currency fees; manual rates drive converted outputs; 422 on invalid manual rates; round-trip tests
- [x] 10.3 SPA buy/sell step + edit modal — fee currency select (preselected tx ccy), "Exchange rate" disclosure (Automatic | Custom) for amount and fee, live totals, `custom fx` badge
- [x] 10.4 SPA wallet cash modals — fee currency select; transfer source→target rate inputs aligned with wallets D22 elastic shape
- [x] 10.5 Transactions tables — render fee with its own currency + custom-rate marker/tooltips
- [x] 10.6 Tests — unit, mock contract round-trips, e2e flows updated (defaults, pct ignores feeCurrency, custom-rate propagation)
- [x] 10.7 Available-currencies registry — contract `GET /api/currencies` (D26), mock serves from demo rates, SPA fetch-once-and-cache consumed by every currency selector
- [ ] 10.8 Docs sweep — AGENTS.md conventions note (camelCase for new fields), cross-links between proposals

### 10a. FX entry UX unification (addendum D38–D41, 2026-08-25)

- [x] 10.9 Extract reusable `FeeFields.vue` + `FxRateFields.vue` (one disclosure per leg: transaction/fee) + `useTargetCurrency` composable (D38/D40); `getLatestRate(from, to, date?)`
- [x] 10.10 Stock form (AddPositionDialog) — separate transaction + fee disclosures, custom rate prefilled from selected date (D39)
- [x] 10.11 EditTransactionModal — same treatment
- [x] 10.12 WalletCashModals — FX disclosures on deposit/withdraw (transaction + fee legs); transfer keeps elastic target leg (D22) and gains the fee leg
- [x] 10.13 Options form parity — FeeFields/FxRateFields replace hardcoded-USD fee entry (D41)

## 11. Wallets & transactions module (`portfoliost-wallets`)

Proposal: [wallets-module.md](proposals/wallets-module.md) (accepted 2026-08-24, decisions D16–D23). Cash-wallet domain as its own module: wallets, cash ledger transactions, unified recent-transactions feed, balance history, multicurrency (local FX store: ECB/frankfurter primary + openst/cachest fallback). Multi-user: every table and query is user-scoped (D24). No implementation started yet.

- [x] 11.1 Scaffold repo from users-auth skeleton (`/health`, `/__meta`, `/internal/verify`, CI release pipeline); compose service `wallets`, env key `API_WALLETS_URL`
- [x] 11.2 Drizzle migrations per D17/D24: `wallets.wallets` (mandatory `currency`, `base_currency` default from user prefs), `wallets.wallet_transactions` (user-scoped ledger, mandatory currency, `rate_source`/`fee_rate_source`, `transfer_fx_rate`, `fee_currency`), `fx_rates`, `fx_sync_state`
- [x] 11.3 Wallet CRUD endpoints — create requires currency (422 otherwise), rename, list; delete guarded per D18/D24: only when zero transactions and unreferenced (409 otherwise)
- [x] 11.4 Cash movement endpoints — deposits/withdrawals (overdraft 422) /transfers incl. cross-currency elastic legs (source+target amounts + rate on both linked rows)
- [x] 11.5 Transaction edit/delete with real ledger recomputation of wallet balances
- [x] 11.6 History & pagination — `/wallets/:id/transactions`, `/wallets/transactions`, `/recent-transactions` feed shapes per contract
- [x] 11.7 FX subsystem — one-shot historical import (frankfurter/ECB), daily incremental CronJob, lazy gap backfill via provider tier (openst→cachest), carry-forward across non-business days
- [x] 11.8 Serve `GET /api/currencies` from `fx_rates` × contracts metadata catalog; gateway route switch mock→wallets
- [x] 11.9 Conversion service — auto/manual rate snapshots on write, valuation at latest rate, per-date conversion for balance-history, total-balance aggregation breakdown
- [x] 11.10 users-auth preference integration — read `baseCurrency` via internal route for defaults
- [x] 11.11 Gateway + compose wiring, contract tests green against mock AND module, e2e switch via `API_WALLETS_URL`
- [x] 11.12 Cluster rollout — HelmRelease, ingress path, FX-sync CronJob

## 12. Instrument logos (provider-resolved, permanently stored)

Proposal: [logos.md](proposals/logos.md) (accepted 2026-08-25, D34–D37). Resolve logos once through the provider tier, persist binaries on disc + metadata in Postgres, serve from our own infrastructure; generated initials as terminal fallback.

Verified provider facts (2026-08-25): FMP's legacy `financialmodelingprep.com/image/logo/{T}.png` path is dead (403) — the live keyless CDN is `images.financialmodelingprep.com/symbol/{T}.png` (covers WSE names like KTY.WA). OpenBB's yfinance profile carries **no** logo field; its `company_url` (website) feeds the favicon fallback. Google s2 favicons verified reachable from the compose network.

- [x] 12.1 openst `/equity/logo/{ticker}` route: FMP CDN HEAD → yfinance profile `company_url` → favicon chain, returns `{source, remote_url}` or 404; pytest suite
- [x] 12.2 cachest `OPENST_LOGO` route (`/logo/{ticker}`, short TTL) caching resolution lookups only — binaries never flow through cachest (D36)
- [x] 12.3 instruments: `instruments.logos` migration (`symbol PK, source, remote_url, file, bytes, sha256, fetched_at, refresh_after`) + resolve/persist/single-flight service + adapter `fetchLogo`
- [x] 12.4 `/api/logos/:symbol` (+`/logos/:symbol` parity alias) serving local files with immutable caching; deterministic initials SVG fallback (ported from mock), never persisted; auth-exempt (SPA `<img>` tags carry no JWT); gateway flip `API_LOGOS_URL` → instruments; mock handler retired
- [x] 12.5 disc volume: bind mount `../portfoliost-instruments/data/logos` in compose; cluster HelmRelease persistence deferred with the module's cluster rollout (D15 scope)
- [x] 12.6 stack-test logo checks (real/mock distinguishing) + e2e: WSE ticker renders a logo (real or initials); file persisted on disc; I10 full suite green

## 13. Shared Redis for the provider tier (cluster)

Follow-up to §12's cachest outage (2026-08-25): the per-app **redis sidecars** used floating tags (`8-alpine`) with long-lived PVCs — a restart pulled a different build whose RDB version couldn't load the old dump → CrashLoop → deployment never Ready (the `sh.helm.release.v1.cachest.v18 not found` noise was fallout: helm-controller persists release storage only after readiness succeeds).

Target: apps stay stateless; the namespace-level shared instance (`redis`, pinned `8.10.1`, `--requirepass`) serves every cache consumer, mirroring what local compose already does.

| Consumer | DB | Isolation |
|---|---|---|
| ghostfolio (existing) | 0 | unchanged |
| cachest | 1 | logical DB |
| openst | 2 | logical DB |

- [x] 13.1 cachest HelmRelease — remove `redis` sidecar + `cachest-redis` PVC persistence; ConfigMap points at shared instance (`host: redis`, `${SECRET_REDIS_PASS}`, `db: 1`)
- [x] 13.2 openst HelmRelease — drop localhost redis sidecar; `REDIS_HOST=redis`, `${SECRET_REDIS_PASS}`, `REDIS_DB=2`
- [x] 13.3 cutover complete (2026-08-25): sidecars gone (single `app` container on both), shared redis carries openst db2 + cachest db1 (ghostfolio db0 untouched); stale `REDIS_HOST=localhost` env removed from cachest HR; orphaned `cachest-redis` PVC deleted
- [x] 13.4 local compose hygiene — pin floating minor (`redis:7-alpine` → `redis:7.4-alpine`) across portfoliost / openst / cachest compose files (dev-only isolation unaffected)

## 14. Admin module (`portfoliost-admin`)

Proposal: [admin-module.md](proposals/admin-module.md) (D42–D52). Read-only admin panel: system versions, FX rates, OIDC users. No database. Backend is a new Hono+jose repo that proxies other modules' APIs. Frontend lives in the existing SPA under `/en/admin/*`, gated by `portfoliost_admin` group.

### 14.1 — Admin backend scaffold + compose wiring (D42, D51)
- [x] New repo `Marx2/portfoliost-admin` from users-auth skeleton (strip Drizzle, DB, seed — no database).
- [x] `src/index.ts`: Hono app with `/health`, `/__meta` (`{ service: "admin", impl: "real", version }`), `/internal/verify` (JWT preflight).
- [x] `src/auth.ts`: copy `validateJwt` + `userIdentityMiddleware` + `requireGroup("portfoliost_admin")` from users-auth.
- [x] `Dockerfile`: node:22-alpine, `npm ci && npm run build`, `node dist/server.js` (no migrate/seed).
- [x] Tests: `/health` returns 200, `/__meta` returns correct shape, `/internal/verify` 201/401, admin middleware 403 for non-admin.
- [x] `docker-compose.yml`: `admin` service (build `../portfoliost-admin`, expose 3000, env `API_USERS_AUTH_URL`, `API_WALLETS_URL`, `API_INSTRUMENTS_URL`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, depends_on postgres).
- [x] `deploy/services.env`: add `API_ADMIN_URL=http://example-service-mock:4010` (default mock).
- [x] `gateway/default.conf.template`: add `location /api/admin/ { proxy_pass ${API_ADMIN_URL}; }`.
- [x] Verify: `docker compose up -d --build`, admin `/health` + `/__meta` reachable through gateway, full unit+mock green. Commit.

### 14.2 — SPA router + sidebar admin entry (D43, D44, D45)
- [x] `src/api/admin.ts`: `http.get` wrappers for `/api/admin/system/versions`, `/api/admin/currencies/rates`, `/api/admin/users`.
- [x] `src/stores/auth.ts`: add `isAdmin` computed (`user.value?.groups?.includes("portfoliost_admin") ?? false`).
- [x] `src/router/index.ts`: add admin routes under `/en/admin` with `meta: { requiresAuth: true }`:
  - `/en/admin` → redirect to `/en/admin/system`
  - `/en/admin/system` → `SystemInfoView` (lazy)
  - `/en/admin/currencies` → `CurrencyRatesView` (lazy)
  - `/en/admin/users` → `UsersView` (lazy)
- [x] Router guard: extend `beforeEach` — if route has `meta.admin` and `!auth.isAdmin`, redirect to `/en/investments`.
- [x] `src/layout/SidebarNav.vue`: add "Admin" item (`router-link to="/en/admin"`, cog/shield icon, `v-if="auth.isAdmin"`) between main nav and bottom section.
- [x] `src/modules/admin/SystemInfoView.vue`: empty shell (heading only).
- [x] `src/modules/admin/CurrencyRatesView.vue`: empty shell.
- [x] `src/modules/admin/UsersView.vue`: empty shell.
- [x] Tests: `isAdmin` computed, router guard blocks non-admin, sidebar hides for non-admin. Build + unit + mock green. Commit.

### 14.3 — System versions screen (D46)
- [x] Admin backend `GET /api/admin/system/versions`: for each configured module URL (users-auth, wallets, instruments, admin itself, openst, cachest, example-service-mock), call `GET /__meta`. Aggregate into `{ services: [{ service, version, impl }], fetchedAt }`. Unreachable → `{ version: "unreachable", impl: "unknown" }`.
- [x] Unit tests: all reachable, some unreachable, all unreachable.
- [x] `SystemInfoView.vue`: card layout, one row per service, status badge (green=real, yellow=mock, red=unreachable), auto-refresh every 30s via `setInterval` + `onUnmounted` cleanup.
- [x] Verify: `docker compose up -d --build`, navigate to `/en/admin/system`, cards render with live data from `/__meta` endpoints. Unit+mock green. Commit.

### 14.4 — Wallets admin FX rates endpoint + admin proxy + frontend table (D47)
- [x] **Wallets module** `src/routes/admin.ts`: `GET /api/wallets/admin/fx-rates` with `requireGroup("portfoliost_admin")`, query params: `page`, `per_page` (max 200), `sort_by` (date/base_currency/quote_currency/rate), `sort_dir`, `base_currency`, `quote_currency`, `date_from`, `date_to`. Query `wallets.fx_rates` with filters/sort/pagination. Response: `{ items: [...], pagination: { total, page, per_page, total_pages } }`.
- [x] Mount in wallets `src/index.ts`: `api.route("/admin", createAdminRoutes())`.
- [x] Wallets unit tests: admin endpoint returns paginated results, filtered, sorted, 403 without admin group.
- [x] **Admin backend** `GET /api/admin/currencies/rates`: proxy to `GET ${API_WALLETS_URL}/admin/fx-rates` with same query params, pass through response.
- [x] Admin unit test: proxy forwards params and response.
- [x] `CurrencyRatesView.vue`: Tailwind table with sortable column headers (click toggles asc/desc/none), filter row (2 `<select>` for base/quote from `/api/currencies`, 2 `<input type="date">`), pagination controls (prev/next + page indicator). All server-side.
- [x] Verify: `docker compose up -d --build`, navigate to `/en/admin/currencies`, table renders FX rates, sort/filter/paginate work. Unit+mock green. Commit.

### 14.5 — Users-auth admin endpoint + OIDC enrichment + frontend table (D48, D48b, D49)
- [x] **Users-auth** `src/routes/admin.ts`: `GET /api/users/admin/list` with `requireGroup("portfoliost_admin")`, query: `page`, `per_page` (max 200), `search` (user_id prefix). Query `users_auth.user_preferences` for `userId`, `createdAt`, `updatedAt`. Response: `{ items: [...], pagination: {...} }`.
- [x] Mount in users-auth `src/index.ts`: `api.route("/users/admin", createAdminRoutes())`.
- [x] Users-auth unit tests: admin endpoint returns paginated results, search filter, 403 without admin group.
- [x] **Admin backend** `GET /api/admin/users`: call users-auth `GET /api/users/admin/list`, then for each user call OIDC provider `GET /oauth2/userinfo` with server-side client-credentials token (D49). Merge identity fields. Cache results 5 min. Env vars: `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`. Response: `{ items: [{ id, email, firstName, lastName, groups, lastLogin, createdAt }], pagination }`.
- [x] Admin unit tests: mock users-auth + OIDC calls, verify merge + caching.
- [x] `UsersView.vue`: Tailwind table, client-side sort (reusable sortable-column pattern), client-side text filter (across email/firstName/lastName), group badges (`portfoliost_admin` highlighted), read-only (no edit actions).
- [x] Verify: `docker compose up -d --build`, navigate to `/en/admin/users`, table renders users with groups. Unit+mock green. Commit.

### 14.6 — Admin authorization middleware enforcement (D50)
- [x] **Admin backend**: all `/api/admin/*` routes wrapped with `userIdentityMiddleware` + `requireGroup("portfoliost_admin")` at router level. Non-admin JWT → 403 `{ error: "Admin access required" }`.
- [x] **Wallets module**: admin routes (`/api/wallets/admin/*`) already gated by `requireGroup` from 14.4 — verify.
- [x] **Users-auth module**: admin routes (`/api/users/admin/list`) already gated by `requireGroup` from 14.5 — verify.
- [x] Unit tests: 403 for non-admin JWT on all three modules, 200 for admin JWT.
- [x] Full suite: build + unit + mock + e2e green. Commit.

### 14.7 — Docs sweep + closeout
- [x] Update `docs/proposals/admin-module.md`: status → Implemented.
- [x] Update `docs/plan.md`: all 14.x points marked done.
- [x] Update `README.md`: admin module in service table, `API_ADMIN_URL` in env table.
- [x] Final: full test suite green across all repos. Commit.

### 14.8 — lastLogin tracking
- [x] **Users-auth** schema: add `lastLogin: text("last_login")` column to `user_preferences`.
- [x] **Users-auth** migration: `0003_add_last_login.sql` (auto-generated via drizzle-kit).
- [x] **Users-auth** `POST /api/auth/token`: stamp `lastLogin` to current timestamp on every token exchange.
- [x] **Users-auth** admin list: return `lastLogin` from `GET /api/users/admin/list`.
- [x] **SPA** `src/api/admin.ts`: add `lastLogin: string | null` to `AdminUser` interface.
- [x] **SPA** `UsersView.vue`: add sortable "Last Login" column (formatted date).
- [x] Verify: build + unit tests (22/22) + docker compose. Commit + push. — users-auth `a28dd7a`, portfoliost `c915714`.

### 14.9 — Secret mirroring via Kubernetes Reflector
- [x] Deploy Reflector to `system` namespace (emberstack HelmRepository + HelmRelease v10.0.65).
- [x] Annotate `pocket-id-static-api-key` in `networking` for auto-mirror to `pfire`.
- [x] **Admin HelmRelease**: reference mirrored secret (`pocket-id-static-api-key` / key `token`), drop `optional: true`, bump to v1.0.3.
- [x] Create `portfoliost-admin/README.md` documenting mirroring setup.
- [x] Commit + push. — homelab `b30442710`.

## 15. Portfolio management in the wallets module (replace all portfolio mocks)

Proposal: [portfolios-module.md](proposals/portfolios-module.md) (proposed 2026-08-26, D53–D64). Extends the live `portfoliost-wallets` service with a `portfolios` Postgres schema: CRUD first, then transaction actions (shared FeeFields/FxRateFields wire format), history display, aggregates/shares, flip; analytics & charting designed up front (D61–D64: value snapshots, performance/risk math, dividends/calendar/compare composition) but executed as the final phases before one cluster cutover. No new repo/container; D19 cash-movement push becomes an in-process ledger write.

### Phase A — foundation
- [x] A1 `portfolios` pgSchema + drizzle migration (portfolios, positions, transactions, shares per D54); PGlite schema test
- [x] A2 dev seeds from `mocks/shared/data/raw/portfolio*.json`; seed skipped in prod
- [x] A3 `scripts/portfolios-stack-test.mjs` scaffold

### Phase B — portfolio CRUD
- [x] B1 POST `/api/portfolios` (+422 rules, prefs default) · GET list · GET `/light`
- [x] B2 GET/PATCH `/:id` with computed metrics + position summaries (404 scoping)
- [x] B3 guarded DELETE (409)
- [x] B4 stack-test CRUD round-trips; multi-user isolation tests

### Phase C — transaction actions
- [x] C1 POST `/:id/transactions` BUY/SELL/DIVIDEND (fee-fx via wallets `fee-fx.ts`, D56 math, 422 matrix)
- [x] C2 position mutation + totals in one SQL tx; FIFO fallback; synthesized opening lots
- [x] C3 wallet cash integration (`PORTFOLIO_*` references, balances, cross-ccy settlement)
- [x] C4 PATCH/DELETE transaction + full recompute (position, totals, paired wallet rows)
- [x] C5 position PATCH metadata-only rule + soft-close DELETE
- [x] C6 unit + stack-test write flows

### Phase D — history display
- [x] D1 GET `/:id/transactions` (pagination, type/positionId filters, sort map)
- [x] D2 GET `/transactions` cross-portfolio feed (sortBy/sortOrder)
- [x] D3 export endpoint (paginated JSON)
- [x] D4 pagination/filter/sort parity tests

### Phase E — positions & allocation reads
- [x] E1 positions read pipeline: quote refresh via instruments adapter (staleness/fallback) → derived fields (D58 impl: quotes.ts, refreshQuotes wired into GET positions/allocation/cfd-hints/detail/POST)
- [x] E2 `/positions/bare` + `/positions/cfd-hints`
- [x] E3 `/:id/allocation`
- [x] E4 refresh caching/fallback + derived-math tests

### Phase F — flip to real
- [x] F1 stub audit: unimplemented endpoints answer valid empty content
- [x] F2 services.env/gateway change (drop `API_PORTFOLIOS_URL`, public-shares location), wallets gains `API_INSTRUMENTS_URL`
- [x] F3 stack-test both modes; full frontend suite green against flipped stack
- [x] F4 docs sweep

### Phase G — aggregates & shares
- [x] G1 total-metrics · held-stocks · merged/light from real data
- [x] G2 summary-metrics + snapshot computed subsets
- [x] G3 shares CRUD (10-limit) + auth-exempt public route with view-count
- [x] G4 privacy-projection + limit tests

### Phase H — price data warehouse + value snapshots + analytics chart (D61)

- [x] H1 `value_snapshots` migration + schema test — table exists in `0001_colorful_iron_patriot.sql`, 0 rows in cluster

**Context from investigation (2026-08-28):**

Data sources available:
- **stooq DB** (`stooq` Postgres DB in pfire namespace, PostgREST at `http://postgrest.pfire.svc/daily`):
  27M rows, US-only (all tickers `SYMBOL.US`), coverage 1984-01-02 → 2026-05-13 (last download).
  Access: JWT with `web_anon` role, secret `mrt3g309vhfdsvrebgredfwgwf4gff4t5ytg6h5g`.
  Query pattern: `GET /daily?ticker=eq.AAPL.US&date=gte.2025-01-01&select=date,close&order=date.asc`
  No Polish (KRU.WA) or German (RHM.DE) stocks — US exchange only.
- **openst → cachest**: all symbols work, but Redis TTL cache only (cachest has no Postgres storage).
  Rate-limited, can fail for obscure tickers or network issues.
- **portfoliost-instruments**: has Postgres + Drizzle (`instruments` schema). Already the market data
  service. Natural home for persistent price storage.
- **FX**: `fx_rates` table in portfoliost-wallets, `latestRates()` helper works.

Current state: `value_snapshots` table exists (0 rows), `GET /:id/analytics` is a permanent stub
returning `{performance: [], benchmarks: []}`.

**Architecture:**
```
read path for symbol price history
  1. price_bars table in portfoliost-instruments (persistent cache)
  2. if gap or missing:
     a. US symbol, date ≤ stooq latest_date → query stooq PostgREST (fast, no rate limits)
     b. US symbol, date > stooq latest_date → fetch from openst, write to price_bars
     c. non-US symbol (KRU.WA, RHM.DE etc) → always openst, write to price_bars
  3. merge and return

value_snapshots (portfoliost-wallets)
  = Σ (qty_held_on_date × price_on_date × fx_rate) per portfolio per day
  feeds analytics endpoint
```

Stooq covers deep US history without openst. openst fills: recent US tail + all non-US.
Stooq download job should run monthly to keep the floor moving.

**Gap detection:**
- `price_bar_metadata(symbol, earliest_date, latest_date, last_backfill_at, backfill_status)`
- Gap = `today - latest_date > 3 days` (tolerates weekends/holidays)
- `last_backfill_at` acts as circuit breaker: skip re-attempt within 1h on failure
- No explicit "last backfill date" needed — infer gap from data itself via `MAX(date)`

**Async backfill / UI:**
- Analytics request with empty `value_snapshots` → enqueue backfill job (k8s Job or in-process
  background task), return partial response immediately with `backfillStatus: "pending"`
- Frontend: render partial chart (even 1–2 points), show "Historical data is loading..." banner,
  poll `GET /:id/analytics` every 5s while `backfillStatus !== "complete"`
- Subsequent requests (gap fill, next week): incremental only — fast, no banner needed

---

- [ ] H2 — price_bars table in portfoliost-instruments

  Add to `instruments` schema in portfoliost-instruments:

```sql
instruments.price_bars(
  symbol        TEXT NOT NULL,          -- native symbol as used in our system (AAPL, KRU.WA, RHM.DE)
  date          DATE NOT NULL,
  open          NUMERIC(28,8),
  high          NUMERIC(28,8),
  low           NUMERIC(28,8),
  close         NUMERIC(28,8) NOT NULL,
  volume        BIGINT,
  currency      CHAR(3) NOT NULL,       -- instrument native currency
  source        TEXT NOT NULL,          -- 'stooq' | 'openst'
  PRIMARY KEY (symbol, date)
)

instruments.price_bar_metadata(
  symbol           TEXT PRIMARY KEY,
  earliest_date    DATE,
  latest_date      DATE,
  last_backfill_at TIMESTAMPTZ,
  backfill_status  TEXT NOT NULL DEFAULT 'pending'  -- 'pending'|'complete'|'partial'|'failed'
)
```

  Drizzle migration. Unit test: schema compiles, upsert is idempotent.

- [ ] H3 — price history read endpoint in portfoliost-instruments

  `GET /api/instruments/:symbol/price-bars?from=YYYY-MM-DD&to=YYYY-MM-DD`

Logic:
1. Check `price_bar_metadata` for symbol. Compute gap = `[from, to] \ [earliest_date, latest_date]`.
2. If gap exists and `last_backfill_at` is null or > 1h ago:
   a. **US symbol** (`instrumentCurrency = USD`, no exchange suffix or `.US`):
      - Stooq portion: query PostgREST `http://postgrest.pfire.svc/daily?ticker=eq.{SYMBOL}.US&date=gte={from}&date=lte={min(to, stooq_latest)}&select=date,close,open,high,low,volume&order=date.asc`
      - Recent tail (stooq_latest+1 → to): fetch from openst via existing `fetchOhlcv(symbol, start, end)`
   b. **Non-US symbol** (KRU.WA, RHM.DE, etc.): fetch entirely from openst via `fetchOhlcv`
   c. Upsert results into `price_bars`; update `price_bar_metadata`.
3. Serve from `price_bars` for the requested range. Include `{ stale: boolean }` in response if
   gap could not be fully filled (openst unavailable).

Stooq ticker mapping: strip exchange suffix from our symbol format → append `.US`.
Non-US: use symbol as-is to openst (it handles the suffix natively).

  Note: stooq `latest_date` is determined once at startup or cached with 1h TTL
  (`SELECT MAX(date) FROM daily` via PostgREST count endpoint or metadata query).

- [ ] H4 — passive write-through from existing quote fetches

  In `portfoliost-instruments`, when a `/quote` or `/history` response is served from openst,
also write the returned daily bars to `price_bars` (upsert). This means price_bars accumulates
data organically from normal usage without any explicit backfill trigger for well-queried symbols.

  This is cheap: the data is already fetched, the upsert is a background write.

- [ ] H5 — snapshot-on-read: today's value_snapshots row

  In `portfoliost-wallets`, inside `refreshQuotes()` (already called on every GET /positions),
after persisting position quote fields, compute and upsert today's portfolio value:

```
portfolioValue = Σ pos.marketValue × fx(pos.instrumentCurrency → portfolio.baseCurrency)
invested       = Σ pos.totalCostBasis × fx(pos.instrumentCurrency → portfolio.baseCurrency)
```

  Upsert: `INSERT INTO value_snapshots ... ON CONFLICT (portfolio_id, snapshot_date) DO UPDATE`.
  Uses `latestRates()` which already works. No scheduler needed.

- [ ] H6 — backfill job: historical value_snapshots

  A k8s Job (CronJob or on-demand via portfoliost-wallets triggering it) that:

1. For the target portfolio, query `MIN(executed_at)` from `portfolioTransactions` → `firstTxDate`.
2. Build the holdings timeline: for each calendar day from `firstTxDate` to yesterday, compute
   `qty_held(symbol, date)` from cumulative BUY/SELL transactions up to that date.
3. For each symbol needed, call portfoliost-instruments `GET /price-bars?from=firstTxDate&to=yesterday`
  (H3 above — serves from price_bars, filling from stooq+openst if needed).
4. For each day: `value = Σ qty_held(sym, day) × price(sym, day) × fx(instrCcy → baseCurrency)`.
   Price carry-forward: if no bar for a day (weekend/holiday), use last known close.
   FX: `latestRates()` (current rate — acceptable approximation for 1–3 month history windows).
5. Bulk upsert into `value_snapshots`. Idempotent.
6. Update `backfill_status` in a `portfolio_backfill_metadata` table
   (or inline in the analytics response flag).

  Job is triggered asynchronously from `GET /:id/analytics` when `value_snapshots` has < 2 rows.
  Returns 202-equivalent response with `backfillStatus: "pending"` immediately.
  On re-request while job is running: return whatever rows exist + `backfillStatus: "pending"`.
  On completion: `backfillStatus: "complete"`.

  Bounded: never writes future dates. If job fails mid-run, existing rows are preserved (idempotent
  upserts); next trigger resumes from gap.

- [ ] H7 — wire GET /:id/analytics

  Replace the permanent stub in `portfoliost-wallets routes/portfolios.ts`:

1. Check `value_snapshots` row count for portfolio.
2. If < 2 rows: trigger backfill job async, return `{ backfillStatus: "pending", performance: { timeSeries: [] }, benchmarks: [] }`.
3. Otherwise: read `value_snapshots` ordered by `snapshot_date ASC`, filter by timeframe:
   - `6M` = last 183 days, `1Y` = last 366, `2Y` = last 730, `ALL` = all rows
4. Compute and return:
   ```json
   {
     "timeframe": "6M",
     "backfillStatus": "complete",
     "performance": {
       "timeSeries":        [{ "date": "YYYY-MM-DD", "value": 12345.67 }],
       "totalValue":        12345.67,
       "totalInvested":     11000.00,
       "totalReturn":       1345.67,
       "totalReturnPercent": 12.23,
       "monthlyReturns":    [{ "month": "YYYY-MM", "returnPercent": 3.2 }]
     },
     "benchmarks": []
   }
   ```
   `monthlyReturns`: group by `YYYY-MM`, `(last_value / first_value - 1) × 100` per month.
  5. Sufficient for: `PortfolioCard` sparkline (reads `timeSeries`) + `PortfolioPerformanceTab`
     equity + monthly bar charts.

- [ ] H8 — frontend: polling + loading banner

  In `PortfolioCard.vue` and `PortfolioPerformanceTab.vue`:

- If `analytics.backfillStatus === "pending"`: show subtle banner
  "Historical data is loading, chart will update in a moment"
- Poll `GET /:id/analytics` every 5s while `backfillStatus !== "complete"`
  - Stop polling on `complete` or after 5 minutes (failure guard)
  - Render whatever `timeSeries` points exist immediately — even 1 point beats "Loading chart..."

- [ ] H9 — tests

  `portfoliost-instruments`:
- `price-bars.test.ts`: stooq ticker mapping (AAPL → AAPL.US), gap detection logic, upsert
  idempotence, circuit breaker (no retry within 1h on failure), weekend carry-forward
- `price-bars-stooq.test.ts`: mock PostgREST response → correct rows in price_bars

`portfoliost-wallets`:
- `snapshots.test.ts`: today snapshot with 2 USD positions; multi-currency (PLN, EUR);
  backfill with 3 positions over 10 days; timeframe filter; empty portfolio → `timeSeries: []`

- [ ] H10 — stooq download job cadence (homelab)

  Add a monthly CronJob in homelab that runs stooq-downloader + stooq-importer-pgloader.
  This keeps the stooq floor within ~30 days of today, limiting the openst tail to 1 month
  for US stocks. Document in homelab README.

---

H5 alone makes the chart show today's single data point — unblocks basic smoke-testing.
H7 makes the sparkline and performance chart fully functional.
H6+H3 together are the bulk of the work.

### Phase H execution order

```
H1   value_snapshots migration + schema test
H2   price_bars schema + migration (portfoliost-instruments)
H3   price history read endpoint with stooq + openst layering
H4   passive write-through from existing quote/history fetches
H5   snapshot-on-read in refreshQuotes (portfoliost-wallets)   ← chart shows today's dot
H6   backfill job: historical value_snapshots
H7   wire GET /:id/analytics                                   ← chart shows full history
H8   frontend polling + loading banner
H9   tests
H10  stooq monthly CronJob (homelab)
```

### Phase I — performance analytics & charting (D62)
- [ ] I1 shared series/returns service (TWR, XIRR/MWR, annualization + withhold rules)
- [ ] I2 GET `/:id/analytics` (+ benchmark normalization via instruments `/history`) — superseded by H4 for the basic chart; I2 adds TWR/MWR/sharpe/benchmark overlay on top
- [ ] I3 promote stubs: `/merged`, `externalCapital*` wallet-deposit basis
- [ ] I4 fixture + property tests; stack-test

### Phase J — risk metrics (D63)
- [ ] J1 GET `/:id/risk-metrics`: volatility/maxDrawdown/sharpe/sortino/calmar/win-rate
- [ ] J2 withholding-rule and empty-history tests

### Phase K — derived content (D64)
- [ ] K1 dividends composition within holding windows
- [ ] K2 calendar composition
- [ ] K3 compare enrichment from instruments metrics
- [ ] K4 summary-metrics income source switch

### Phase L — cluster cutover + closeout
- [ ] L1 homelab ingress paths → `portfoliost-wallets:3000`; separated snapshot Kubernetes Jobs (D11 job-pod pattern, not in-process scheduler)
- [ ] L2 live verification (`/__meta`, CRUD + analytics through host); e2e green
- [ ] L3 plan/proposal status marks; retire `mocks/portfolios/index.js`; docs sweep

### Phase M — transaction form deduplication
- [x] M1 extract `useTransactionForm` composable (shared computed chain: positionCost, feeValue, txRate, feeRate, feeInUsd, costConverted, totalConverted)
- [x] M2 extract `TransactionFormFields.vue` component (logo header + date + wallet + qty/price grid + FeeFields + FxRateFields + summary `<dl>`)
- [x] M3 wire AddPositionDialog stock step through TransactionFormFields
- [x] M4 wire EditPositionDialog "Add Transaction" through TransactionFormFields
- [x] M5 build + 107 unit tests pass + 31 stack tests pass
- [x] M6 transaction FX leg targets the selected wallet (payment) currency, not the portfolio currency: same-currency wallet → no FX; cross-currency wallet → auto/manual rate disclosure (D40 revision; fee leg unchanged)
- [x] M7 mock `GET /api/fx/latest` (demo-rate cross pairs, d39 carry-forward semantics) so automatic suggestions resolve instead of 404ing; wired into `mocks/fx`, 5 new mock round-trips, e2e `fees-fx.spec.ts` rewritten to wallet-driven flow (EUR wallet + deposit + cross-currency buy, market-rate prefill 0.9259, custom-fx badge)
- [x] M8 wire real wallets module into docker compose (all `/api/portfolios` + `/api/wallets` routes → `portfoliost-wallets:3000`); e2e suite fully green against real module. Fixes: share-seeding `::jsonb` cast; wallet seed balance 10 000 (ledger-consistent); `AddPositionDialog` aria-label capitalisation + emit-before-close ordering; `EditPositionDialog` positionId filter arg order + currency in addRow payload + optimistic row push; e2e: en-dash paginator regex, explicit wallet selection (Portfel USD 1 by value), `add-position-*` testids, presence-based grouping assertions, `Create watchlist` dialog-scoped button, `workers: 1` for deterministic shared-DB runs, 15 s timeouts on real-module-backed assertions, upstream-OHLCV-dependent chart tests skip gracefully when provider unavailable. Build ✓ · 109 unit ✓ · 162 mock ✓ · 52 e2e pass / 4 skip (chart data; infrastructure) / 0 fail.

---

### Phase N — Admin Jobs tab: stooq zip upload + import

Design: `docs/proposals/admin-jobs-stooq-upload.md`

Adds a working "Jobs" tab to the admin panel where an admin can upload a stooq bulk-download
zip and trigger a Kubernetes Job (via jobshot) that ingests it into the `stooq` database.
Covers all 20 stooq dataset types (daily/hourly/5-min × all regions). Uses the PGO
auto-created `postgres-pfire-pguser-postgres` secret — no new SOPS entries needed.
portfoliost-admin handles the upload directly (writes to shared PVC), jobshot is only used
for K8s Job creation with volumes/volumeMounts pass-through (minimal jobshot change).

- [x] N1 — contracts: add `StooqDataset` enum + upload/run/status/log schemas + 4 admin paths to `openapi.yaml`; bump minor version to 1.4.0
- [x] N2 — jobshot: add `volumes: job.volumes || []` + `volumeMounts: job.volumeMounts || []` to `runK8sJob`; extend `Job` interface; build passes
- [x] N3 — homelab: add `stooq-upload-pvc` (1 Gi RWX Longhorn); add PVC mount + `JOBSHOT_URL` + `STOOQ_UPLOAD_DIR` to portfoliost-admin HelmRelease
- [x] N4 — portfoliost-admin: upload route (multer diskStorage → PVC), run route (build job spec + call jobshot), status route (proxy jobshot), log route (read stooq_import_log); admin JWT guard; 27 tests pass
- [x] N5 — frontend: `JobsView.vue` (20 dataset cards grouped by region), `/en/admin/jobs` route, "Jobs" tab in `AdminLayout.vue`, `src/api/adminJobs.ts`, XHR upload progress, status polling; mocks; e2e
- [x] N6 — integration: Build ✓ · 19 unit pass · 162 mock pass · committed across contracts/jobshot/homelab/portfoliost-admin/portfoliost

---

## 16. D77 — biznesradar OpenBB provider in openst (TFI funds + Catalyst bonds)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — D77 extension (2026-09-14).

Adds a custom OpenBB provider package `openbb_biznesradar` inside openst that exposes
TFI/FIZ open-end fund NAV history and Catalyst corporate bond price history via standard
OpenBB provider calls.  The existing `/price/ohlcv/{ticker}` openst route and
`OPENST_OHLCV` cachest route are reused unchanged — only the provider list in
`openbb_client.py` is extended.

### Findings from live page inspection (2026-09-14)

- **Historical data URL**: `/notowania-historyczne/{SYMBOL}` (page 1); subsequent pages
  via `/notowania-historyczne/{SYMBOL},{N}` (comma-separated page number). 50 rows/page.
- **Fund table** (`NNEP25.TFI`): 2 columns — `Data | Kurs` (date + single NAV price).
  No OHLCV. Model maps `close=open=high=low=Kurs`, `volume=0`.
- **Bond/stock table** (`BST0327`): 7 columns — `Data | Otwarcie | Max | Min | Zamknięcie | Wolumen | Obrót`.
  Full OHLCV. `Zamknięcie` = close; `Obrót` (turnover) is not exposed in the output model.
- **Date format**: `DD.MM.YYYY`. **Decimal separator**: dot (not comma) — standard float parse.
- **Symbol stripping**: biznesradar URLs never carry exchange suffixes. Strip any trailing
  `.WA` (or other dot-suffixed exchange tag) before building the URL, so
  `NNEP25.TFI.WA` → `NNEP25.TFI` and `AAPL.WA` → `AAPL`. The `.TFI` / `.FIZ` part of
  the symbol is the biznesradar venue code and must be preserved.
- **Rate limiting policy**: add `BIZNESRADAR_FETCH_DELAY_S` env (default `2.0` s) inter-page
  delay. cachest `cache_ttl: 86400` (24 h) means at most one scrape per symbol per day in
  production. Never batch parallel requests to biznesradar.

### Fetcher architecture

Two OpenBB fetcher classes in one package, sharing a private page scraper:

| Fetcher | Symbols | Data source | Table shape |
|---------|---------|-------------|-------------|
| `FundHistoricalFetcher` | `*.TFI`, `*.FIZ` | `/notowania-historyczne/{symbol}` | `Data\|Kurs` (2 cols) |
| `BondHistoricalFetcher` | `BST*`, `INS*`, `KRI*` etc. | `/notowania-historyczne/{symbol}` | `Data\|Otwarcie\|Max\|Min\|Zamknięcie\|Wolumen\|Obrót` (7 cols) |

Both share a private `_scrape_pages(symbol, start_date, end_date)` generator that paginates
`/notowania-historyczne/{symbol},{N}`, stops early once `date < start_date`, and applies
the inter-page delay. Each fetcher passes a `cols` argument to tell the scraper which
columns to extract.

A third fetcher `EquityHistoricalFetcher` is **not added** in D77 — ordinary equities
on biznesradar are already covered by yfinance/fmp; biznesradar is added as a fallback
only for `.TFI`, `.FIZ`, and Catalyst bond symbols that upstream providers don't cover.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per `openst/CLAUDE.md` and `cachest/CLAUDE.md`).

---

### 16.1 — HTML fixture capture

- [x] Fetch and save HTML fixtures for both table shapes (single `requests.get` call each —
  no loops, no automation):
  - `openst/tests/fixtures/biznesradar/NNEP25.TFI.html` — fund page (2-col table)
  - `openst/tests/fixtures/biznesradar/BST0327.html` — bond page (7-col table)
  - Also save page 2 of one symbol to verify pagination HTML structure:
    `openst/tests/fixtures/biznesradar/BST0327_p2.html`
    (`https://www.biznesradar.pl/notowania-historyczne/BST0327,2`)
- [x] Confirm from fixtures: CSS class of the main data table, exact column header text,
  date column index, value column index(es), pagination link pattern.
- [x] Document exact selectors in a comment block at the top of
  `openst/plugins/openbb_biznesradar/openbb_biznesradar/scraper.py` (docstring-only file,
  committed with this step's fixtures; no logic yet).
- [x] Commit fixtures only (no code changes yet).

#### Selectors confirmed from fixtures (openst commit `16.1`)

- **Main data table CSS class**: `qTableFull` — exactly one per page.
- **Header row**: first `<tr>` inside the table; cells are `<th>`. Data rows are the
  subsequent `<tr>`s with `<td>` cells. 50 data rows per page, newest-first.
- **Fund/TFI/FIZ table (2 cols)**: header text `Data | Kurs` → indices 0=date, 1=Kurs.
- **Bond/Catalyst table (7 cols)**: header text
  `Data | Otwarcie | Max | Min | Zamknięcie | Wolumen | Obrót` → indices 0=date,
  1=open, 2=high, 3=low, 4=close, 5=volume, 6=Obrót (turnover — not used in output).
- **Date**: `DD.MM.YYYY` (verified `11.09.2026`), parsed with `%d.%m.%Y`; decimal
  separator is a dot. `Wolumen` plain integer; `Obrót` uses a space thousands
  separator (`6 078`) — irrelevant since it is not exposed.
- **Pagination**: `<div class="buttons pages">` after the table. Current page is a
  non-link `<span class="pages_pos_current">N</span>`; other pages are
  `<a class="pages_pos" href="/notowania-historyczne/{symbol},{N}">N</a>` (`{N}` = page
  number, comma-separated); next page is `<a class="pages_right" title="następna">`.
  Ellipsis `<span class="pages_pos dots">…</span>` present on long histories — ignore.
  Advance one page at a time: `{symbol}`, `{symbol},2`, `{symbol},3`, …

---

### 16.2 — `openbb_biznesradar` plugin package scaffold

- [x] Create `openst/plugins/openbb_biznesradar/` with the standard OpenBB provider
  extension layout:
  ```
  openst/plugins/openbb_biznesradar/
  ├── pyproject.toml
  ├── openbb_biznesradar/
  │   ├── __init__.py           # exposes biznesradar_provider (Provider instance)
  │   ├── scraper.py            # shared _scrape_pages() + symbol stripping
  │   └── models/
  │       ├── __init__.py
  │       ├── equity_historical.py    # EquityHistoricalFetcher (single dispatch fetcher)
  │       ├── fund_historical.py      # 2-col Data|Kurs parser
  │       └── bond_historical.py      # 7-col OHLCV parser
  └── tests/
      ├── __init__.py
      ├── test_scraper.py
      ├── test_equity_historical.py
      ├── test_fund_historical.py
      └── test_bond_historical.py
  ```
- [x] `pyproject.toml` uses **setuptools** (not Poetry — avoids lock-file clash with the
  parent `requirements.txt` approach). Note: the plan's
  `setuptools.backends.legacy:build` spelling does not exist; the correct legacy
  backend is `setuptools.build_meta:__legacy__` (verified: `pip install -e` works,
  entry point registers).
- [x] `__init__.py` instantiates `biznesradar_provider` — see *architecture change*
  below; `fetcher_dict` is keyed on the OpenBB **model name** `EquityHistorical`.
- [x] Add `beautifulsoup4==4.15.0` and `lxml==6.1.3` to `openst/requirements.txt`.
- [x] Add `-e ./plugins/openbb_biznesradar` to `openst/requirements.txt` so the editable
  install registers the entrypoint at container build time.
- [x] Dockerfile: `COPY plugins/ ./plugins/` in the builder (before pip install — the
  `-e` relative path resolves there) and `COPY plugins/ /build/plugins/` in the test +
  runtime stages (the PEP 660 editable finder bakes that absolute source path at
  install time). Test stage also gets `COPY plugins/ /app/plugins/` so
  `pytest plugins/` can be run in-container; the default CMD stays `pytest tests/`
  only.
- [x] Commit scaffold (stubs only, tests expected to fail/skip).

##### Architecture change vs original plan (fetcher wiring)

OpenBB routes `obb.equity.price.historical(...)` (model `EquityHistorical`, confirmed
in `openbb_equity/price/price_router.py`) to a provider by the model-name key in
`Provider.fetcher_dict`. The plan's keys `FundHistorical`/`BondHistorical` match no
registered model, so 16.5's provider fallback loop would never reach biznesradar;
additionally only one fetcher may be registered per `(provider, model)` key.
Approved change (per user): **one** `EquityHistoricalFetcher` under the
`EquityHistorical` key that dispatches by symbol shape to the fund (2-col) vs bond
(7-col) scraper — the two scraping code paths stay separate in `fund_historical.py`
/ `bond_historical.py`.

##### Docker suite note (pre-existing failures — since fixed)

At 16.2 time the docker suite was **already red on `main`**, unrelated to this step:
3 dividend tests failed since commit `bb00f87` (2026-08-28), which — while sanitizing
NaN/Inf floats — accidentally changed the API contract: `get_dividend_yield` moved from
2-decimal to 4-decimal rounding (`2.4568` vs the `2.46` asserted since 2026-05-24) and
`get_dividend_history` moved from fixed 4-decimal amount strings to `str(round(...))`
(`"0.25"` vs `"0.2500"`). Fixed in a dedicated commit (`fix(openst): restore dividend
contract…`): keep `_safe_float` NaN-safety, restore `ndigits=2` for yield and
`f"{amount:.4f}"` for amounts. Suite is green again (138 passed).

---

### 16.3 — shared scraper + unit tests

- [x] Implement `openbb_biznesradar/scraper.py`:
  - `strip_wa_suffix(symbol: str) -> str`: strips the literal `.WA` suffix if present,
    preserves everything else. `NNEP25.TFI.WA` → `NNEP25.TFI`; `BST0327.WA` → `BST0327`;
    `NNEP25.TFI` → `NNEP25.TFI` (unchanged); `AAPL` → `AAPL` (unchanged).
  - `_scrape_pages(symbol, start_date, end_date, fetch_delay_s, col_indices) -> Iterator[dict]`:
    - Builds URL `https://www.biznesradar.pl/notowania-historyczne/{symbol}` for page 1,
      `/{symbol},{N}` for N≥2.
    - Uses `httpx.get` with `User-Agent: Mozilla/5.0` (bot-neutral header).
    - Parses HTML with `BeautifulSoup(html, "lxml")`, finds the first `<table>`.
    - Iterates rows; parses `DD.MM.YYYY` dates with `datetime.strptime`.
    - Stops pagination early once `date < start_date` (oldest-to-newest ordering:
      verify from fixtures — page 1 is newest-first; stop when date exits range).
    - Applies `time.sleep(fetch_delay_s)` between page fetches (not on the first page).
    - On HTTP error (non-200) or missing table: raises `BiznesRadarNotFound(symbol)`.
- [x] Unit tests in `tests/test_scraper.py` using fixture HTML (mock `httpx.get`):
  - correct date + value extraction for both table shapes.
  - early stop: given `start_date=2026-01-01`, stops before fetching a page whose
    first row is `2025-12-31`.
  - `strip_wa_suffix` matrix test: `NNEP25.TFI.WA` → `NNEP25.TFI`; `BST0327.WA` →
    `BST0327`; `NNEP25.TFI` → `NNEP25.TFI`; `AAPL` → `AAPL`.
  - sleep called between pages, not before first page.
  - raises on 404.
- [x] All scraper tests pass: `pytest openst/plugins/openbb_biznesradar/tests/test_scraper.py`.
- [x] Commit.

#### Implementation notes

- `strip_wa_suffix` strips a configured suffix set (`{"WA"}`), not any last dotted
  segment — the `.TFI` / `.FIZ` venue codes and bare Catalyst codes must pass through.
- The sleep sits **before** the page-N (N≥2) fetch, i.e. strictly between fetches;
  page 1 is fetched immediately. Pagination stops when the per-page
  `a.pages_right[title="następna"]` link is absent, or early on `date < start_date`.
- Value cells parse as float except the `volume` column (int; whitespace thousands
  separators stripped — `Obrót` is not extracted at all).
- Plugin tests resolve fixtures via `Path(__file__).parents[3] / "tests/fixtures/biznesradar"`
  — works both in-container (`/app/plugins/...` → `/app/tests/...`) and on host.
- Verified: `pytest plugins/` → 8 passed (scraper), 3 skipped (16.4 stubs);
  full compose suite stays green (138 passed).

---

### 16.4 — `FundHistoricalFetcher` + `BondHistoricalFetcher` + unit tests

Note: as only a single fetcher can be registered per (provider, model) key — and the
`EquityHistorical` model is the one wired in 16.5 — the plan's `FundHistoricalFetcher`
/ `BondHistoricalFetcher` names became *parsers + column maps* in
`fund_historical.py`/`bond_historical.py`, dispatched by a single
`EquityHistoricalFetcher` in `equity_historical.py` (user-approved 16.2 change).
- [x] `models/fund_historical.py` — `FundHistoricalFetcher`:
  - Input: `symbol`, `start_date`, `end_date`.
  - Calls `_scrape_pages` with `col_indices={date: 0, close: 1}`.
  - Maps each row to OpenBB `EquityHistoricalData` shape:
    `{date, open=close, high=close, low=close, close, volume=0}`.
  - Returns `OBBject` with `results` list.
- [x] `models/bond_historical.py` — `BondHistoricalFetcher`:
  - Same signature. Calls `_scrape_pages` with
    `col_indices={date:0, open:1, high:2, low:3, close:4, volume:5}`.
  - Maps each row to the same `EquityHistoricalData` shape (OpenBB unifies on this).
- [x] Unit tests (`test_fund_historical.py`, `test_bond_historical.py`) using fixture HTML
  (mock `_scrape_pages` or mock `httpx.get`):
  - happy-path: correct `close`, `open=high=low=close`, `volume=0` for fund.
  - happy-path: distinct `open/high/low/close`, real volume for bond.
  - date range filtering: rows outside `[start_date, end_date]` excluded.
  - empty result (symbol exists but no data in range) → empty `results`, not 404.
- [x] All fetcher tests pass: `pytest openst/plugins/openbb_biznesradar/tests/`.
- [x] Commit.

#### Implementation notes

- `EquityHistoricalFetcher` dispatches by symbol shape: `.TFI` / `.FIZ` →
  `FUND_COLUMNS` + `parse_fund_row`; anything else → `BOND_COLUMNS` +
  `parse_bond_row` (`.WA` stripped by `strip_wa_suffix` first).
- The fetcher implements the **sync** `extract_data` (scraper is sync);
  `transform_data` returns `BiznesRadarEquityHistoricalData` — the `OBBject` wrapper is
  applied by the OpenBB router, not the fetcher.
- `BIZNESRADAR_FETCH_DELAY_S` (default `2.0`) is read from env at extract time (no
  extra plumbing through OpenBB credentials).
- Missing `start_date`/`end_date` default to `date.min`/`date.max` bounds → full
  available history; an in-range-empty page set yields `[]`, not 404.
- Shared test helpers moved to a plugin-local `tests/conftest.py` — a bare `conftest`
  import fails because pytest imports the plugin test dir as a `tests` package.
- Verified: `pytest plugins/` → 23 passed; full compose suite stays green
  (138 passed); fetcher imports in-container with `require_credentials=False`.

---

### 16.5 — wire into `openbb_client.py` + openst suite

- [x] In `openst/src/openbb_client.py`:
  - Add `"biznesradar"` to `PRICE_PROVIDERS` list **at the end** (yfinance/fmp/…
    tried first; biznesradar is the last-resort fallback for PL-venue symbols).
  - Read `BIZNESRADAR_FETCH_DELAY_S = float(os.getenv("BIZNESRADAR_FETCH_DELAY_S", "2.0"))`.
    The env value is picked up by the fetcher via OpenBB credentials kwargs or directly
    from env inside the fetcher — confirm the cleanest approach when wiring.
  - No route changes: the existing `get_ohlcv_history()` provider-fallback loop calls
    `obb.equity.price.historical(ticker, ..., provider="biznesradar")` automatically.
- [x] Extend `openst/tests/test_openbb_client.py` with mocked `obb.equity.price.historical`
  for the biznesradar fallback path: returns fixture-shaped rows for `NNEP25.TFI`.
- [x] Run full openst test suite via docker compose (all tests must pass):
  ```bash
  docker compose --profile test run --rm test
  ```
- [x] Commit. Push openst to `main`. Wait for GHA image build.

#### Implementation notes

- Confirm: the **direct-env-read** approach is cleanest — `equity_historical.py` already
  reads `BIZNESRADAR_FETCH_DELAY_S` itself via `_fetch_delay_s()`, so `openbb_client.py`
  requires zero env plumbing (a compose env var is all that's needed to tune the delay).
- Real-router smoke in-container (live HTTP): `obb.equity.price.historical(
  "NNEP25.TFI", start=, end=, provider="biznesradar")` returns fund rows with
  `open==high==low==close`, `volume=0`; `"BST0327.WA"` returns real OHLCV/volume and
  `to_df()` yields a `date`-indexed frame (index values are `datetime.date` — the
  existing `hasattr(idx, "date")` check falls through to the raw value; output is the
  same "YYYY-MM-DD" string).
- Router plumbing discovery: `fetch_data()` forwards router-level kwargs
  (`preferences`, …) into `extract_data`, so the fetcher's `extract_data` signature
  needed `**kwargs` added (post-16.4 fix) or the live call raised
  `extract_data() got an unexpected keyword argument 'preferences'`.
- The `symbol` mock assertion uses `call.args[0]`, not `kwargs["symbol"]` — the router
  hands the ticker over positionally.
- Verified: full compose suite 141 passed (138 + 3 new biznesradar fallback/order
  tests), 5 deselected; plugin suite still 23 passed.

---

### 16.6 — openst standalone compose smoke (local, real HTTP)

- [x] Start openst standalone compose: `docker compose up -d` (redis + app).
- [x] Smoke-curl — **one request per symbol** (not a loop):
  ```bash
  curl "http://localhost:8080/price/ohlcv/NNEP25.TFI?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with {date, open, high, low, close, volume} rows; close==open==high==low
  curl "http://localhost:8080/price/ohlcv/BST0327?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with real OHLCV; or 404 if no data in range
  ```
- [x] Second call to each URL: confirm Redis cache HIT (no outbound HTTP to biznesradar).
- [x] Mark step done; note results inline. `docker compose down`.

#### Implementation notes

- Live results via compose stack (local build, `impl: real`):
  - `NNEP25.TFI` → 200, **123 rows** `2026-01-02 → 2026-06-30`, every row
    `close==open==high==low`, `volume=0` (e.g. `2026-01-02: 14.32`)
    — correct fund/NAV shape.
  - `BST0327` → 200, **33 rows** `2026-01-13 → 2026-06-30`, real distinct OHLCV +
    volume (e.g. `2026-01-13: o 103.50 h 103.50 l 102.00 c 102.00 vol 64`;
    `2026-06-30: vol 176`) — correct bond/Catalyst shape.
  - Repeat calls: **0.04s** each (first call ~8s of biznesradar paging) and both
    `price_ohlcv:*` keys present in Redis → cache HIT, no outbound HTTP.
- Fix required to run the standalone stack: `app` service in `docker-compose.yml` was
  missing `REDIS_HOST: redis` (default `localhost` wouldn't reach the container);
  now set explicitly like the `test` service.

---

### 16.7 — cachest: `OPENST_OHLCV_FUNDS` route (24 h TTL)

- [x] In `cachest/config.yaml`, add after `OPENST_OHLCV`:
  ```yaml
  - name: OPENST_OHLCV_FUNDS
    path: /ohlcv/fund/{ticker}
    url: "http://openst:8080/price/ohlcv/{ticker}?start={start}&end={end}"
    query_params: [start, end]
    cache_ttl: 86400           # 24h — NAV updates once per business day
    stale_ttl: 2592000
    fetch_interval: 60         # 60s min between upstream fetches
    fetch_max_wait: 4
  ```
  Rationale: separate route with longer TTL vs equity `OPENST_OHLCV` (6 h) because fund
  NAV and Catalyst bond prices change at most once per business day.
- [x] Add `test_real_config_has_ohlcv_funds_route` to `cachest/tests/test_config.py`.
- [x] Run cachest test suite (all tests must pass):
  ```bash
  docker compose --profile test run --rm test
  ```
- [x] Commit cachest config + test. Push to `main`. Wait for GHA image build.

#### Implementation notes

- Routing conflict check passed: `/ohlcv/fund/{ticker}` (3 segments, registered via
  `add_api_route`) can never be shadowed by `/ohlcv/{ticker}` (2 segments) — Starlette
  matches `/ohlcv/fund/NNEP25.TFI` against the 3-segment route only.
- Test suite green: **69 passed** (incl. the new config test), 1 warning.

---

### 16.8 — portfoliost compose stack smoke (full chain)

- [x] Update openst and cachest image references in portfoliost `docker-compose.yml` to
  pick up the new versions (rebuild or bump `ghcr.io` tags).
- [x] Start: `docker compose up -d redis openst cachest instruments`.
- [x] Smoke-curl through cachest (**single requests**):
  ```bash
  curl "http://localhost:<cachest_port>/ohlcv/fund/NNEP25.TFI?start=2026-01-01&end=2026-06-30"
  # X-Cache: MISS first call; HIT on repeat
  ```
- [x] Run `npm run test:stack` — existing 29 contract checks must stay green (no equity
  regression).
- [x] Commit note: `chore: verify D77 smoke through full compose stack`.

#### Implementation notes

- openst/cachest are wired as `build:` services in portfoliost compose → a `--build`
  rebuild picks up openst `v1.1.9` + cachest `v1.0.28` (no ghcr tags in this file).
- cachest had no host port for smoke curl → added `8090:8080` to the `cachest` service.
- Smoke through cachest: `GET /ohlcv/fund/NNEP25.TFI?start=…&end=…` → **200, 123 rows**,
  `X-Cache: MISS` on first; repeat → **`X-Cache: HIT`**, identical 11875-byte payload.
  Proves the full chain cachest → openst → biznesradar on the 24h fund route.
- `npm run test:stack` green: **32/32 checks**, `detected upstream: real` (incl. `logo
  KTY.WA` long-tail) — no equity regression. (Plan said "29"; current suite is 32.)
- Note: the stack test targets the nginx gateway (`:8080`), whose nginx resolves all
  upstream hostnames at startup — the instruments-only start is not enough; run the full
  `docker compose up -d` (or at least all module containers) beforehand.

---

### 16.9 — closeout

- [x] Update `docs/proposals/instruments-provider-module.md` D77 status to `done`.
- [x] Update `docs/openst-coverage.md` to note biznesradar provider coverage for
  `*.TFI`, `*.FIZ`, and Catalyst bond symbols.
- [x] Archive this section to `plan-archive.md` once all steps are `[x]`.

## 18. D78 — crypto via `openbb-crypto` extension in openst

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — D78 (2026-09-14).

Installs `openbb-crypto` (compatible with OpenBB 4.7.2) into openst, adds
`get_crypto_ohlcv` / `get_crypto_quote` client functions and two new routes
(`/crypto/ohlcv/{pair}`, `/crypto/quote/{pair}`), then exposes both through cachest
(`OPENST_CRYPTO_OHLCV`, `OPENST_CRYPTO_QUOTE`).  Pair symbols follow yfinance convention
(`BTC-USD`).  No instruments-module changes in this step — routing for the new asset
class is deferred to D81.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per openst and cachest CLAUDE.md).

---

### 18.1 — verify `openbb-crypto` version + pin

- [x] In the openst repo, resolve the correct `openbb-crypto` pin that is compatible with
  `openbb==4.7.2`.  The `openbb` meta-package pins `openbb-core`; `openbb-crypto` must
  require the same core version.  Strategy: run
  `pip install "openbb==4.7.2" "openbb-crypto" --dry-run` inside a clean venv (or the
  existing openst Docker build) and record the resolved version.
- [x] Verify `obb.crypto.price.historical("BTC-USD", provider="yfinance")` and
  `obb.crypto.price.quote("BTC-USD", provider="yfinance")` are callable with the
  resolved version (smoke in a Python REPL, not a full test yet).
- [x] Record the pinned version (e.g. `openbb-crypto==1.6.2`) as a comment in this step.
- [x] Commit note only (no requirements change yet — that lands in 18.2).

  **Result (2026-09-15, clean venv py3.12, pip `--dry-run` + live install of `openbb==4.7.2`):**
  - Pinned version: **`openbb-crypto==1.6.2`** ↔ resolves against `openbb-core==1.6.13`
    (same core the `openbb==4.7.2` meta-package pins).  Note: `openbb==4.7.2` already
    depends transitively on `openbb-crypto` — the explicit pin in 18.2 just locks it.
  - `obb.crypto.price.historical("BTC-USD", start_date=…, end_date=…, provider="yfinance")`
    works: returns a RangeIndex DataFrame, columns `[open, high, low, close, volume]`
    (5 rows for a 2026-06-01→05 window).
  - **Deviation — `obb.crypto.price.quote` does NOT exist in openbb-crypto 1.6.2.**
    `CryptoHistorical` is the only crypto-price command; the extension exposes exactly
    `crypto.price.historical` + `crypto.search` (search is fmp-only).  Providers for
    `CryptoHistorical` are `[yfinance, fmp, tiingo]` — matches the planned
    `CRYPTO_PROVIDERS`.  The 18.3 `get_crypto_quote` design must change: derive the
    quote from the latest `historical` row (or revisit whether a quote endpoint is even
    needed).

---

### 18.2 — add `openbb-crypto` to openst requirements + Dockerfile

- [x] Add `openbb-crypto==<pinned>` to `openst/requirements.txt` after the existing
  `openbb==4.7.2` line.
- [x] Rebuild the openst Docker image locally:
  ```bash
  docker compose --profile test build
  ```
  Confirm the build succeeds and `obb.crypto` is importable inside the container:
  ```bash
  docker compose run --rm test python -c "from openbb import obb; print(obb.crypto)"
  ```
- [x] Run existing openst test suite (must stay green):
  ```bash
  docker compose --profile test run --rm test
  ```
- [x] Commit `openst/requirements.txt` change.

  **Result (2026-09-15):** `openbb-crypto==1.6.2` added after `openbb==4.7.2`.  Build
  succeeded; `obb.crypto` imports in the `test` container with `crypto@1.6.2`
  (`/crypto/price/historical` + `/crypto/search` routers present).  Full suite:
  143 passed, 5 deselected.

---

### 18.3 — `get_crypto_ohlcv` / `get_crypto_quote` in `openbb_client.py`

> Reworked for the 18.1 finding: `obb.crypto.price.quote` does not exist in
> `openbb-crypto==1.6.2` — the only crypto-price command is `crypto.price.historical`.
> `get_crypto_quote` therefore derives a quote snapshot from the latest `historical`
> rows instead of calling a nonexistent command (signature unchanged, so 18.4/18.6
> routes stay as planned).

- [x] In `openst/src/openbb_client.py` add two functions mirroring the equity OHLCV
  pattern:
  - `CRYPTO_PROVIDERS = ["yfinance", "fmp", "tiingo"]`  — provider fallback list
    (yfinance first; fmp and tiingo only if keys are present; same
    `_provider_is_blocked` guard as `get_ohlcv_history`).
  - `get_crypto_ohlcv(pair: str, start_date: str, end_date: str) -> list[dict] | None`
    — calls `obb.crypto.price.historical(pair, start_date=start_date,
    end_date=end_date, provider=provider).to_df()`, applies the same RangeIndex-date
    normalization as `get_ohlcv_history`, returns `None` if all providers fail or
    return empty.
  - `get_crypto_quote(pair: str) -> dict | None`
    — snaps the latest quote from `obb.crypto.price.historical(pair, provider=provider)`
    (no explicit window — provider default, ~last 90d for yfinance):
      - take the last row `{date, open, high, low, close, volume}` (via the same
        RangeIndex-date normalization);
      - if ≥2 rows exist, compute `change = close − prev_close` and
        `change_percent = change / prev_close` (rounded to 2/4 dp, consistent with
        `_safe_float`);
      - return `{"symbol": pair, "price": close, "open": …, "high": …, "low": …,
        "volume": …, "change":…, "change_percent":…, "date": latest-row date}`
        (skipping `change`/`change_percent` when less than 2 rows);
      - same fallback loop as `get_ohlcv_history` (blocked provider skipped, rate-limit
        blocks provider, invalid-pair logs & continues, continue on empty); returns
        `None` if all providers fail or empty.
- [x] Unit tests in `openst/tests/test_openbb_client.py`:
  - `get_crypto_ohlcv` happy path: mocked `obb.crypto.price.historical` returns fixture
    frame for `BTC-USD`; assert returned list shape and date normalization.
  - `get_crypto_ohlcv` all-empty: all providers return empty DataFrame → `None`.
  - `get_crypto_ohlcv` provider block: blocked provider skipped; next provider used.
  - `get_crypto_quote` happy path: mocked `historical` returns ≥2 rows for `ETH-USD`;
    assert dict keys (`symbol`, `price`, `change`, `change_percent`, `open`, `high`,
    `low`, `volume`, `date`) and that `price` equals the latest close.
  - `get_crypto_quote` single-row frame: quote returned without `change`/`change_percent`.
  - `get_crypto_quote` failure: exception from all providers → `None`.
- [x] Run full openst test suite (docker compose):
  ```bash
  docker compose --profile test run --rm test
  ```
- [x] Commit.

  **Result (2026-09-15):** `CRYPTO_PROVIDERS = ["yfinance", "fmp", "tiingo"]` with a
  `_provider_has_key` guard (fmp → `FMP_API_KEY`, tiingo → `TIINGO_TOKEN`) so key-gated
  providers are only tried when the key is set. `get_crypto_ohlcv` mirrors the equity
  `get_ohlcv_history` normalization; `get_crypto_quote` derives the snapshot from the
  latest `historical` rows (change/change_percent computed when ≥2 rows, `change` at 4 dp,
  `change_percent` at 2 dp). 7 new unit tests cover row shape + date normalization,
  all-empty → `None`, rate-limit block → next provider, keyless-provider skip,
  quote dict keys/bounds, single-row quote (no change fields), and all-providers-fail →
  `None`. **Correction (18.4):** the first test run reused the stale `test` image (no
  rebuild) and reported 143 passed — after `docker compose --profile test build` the real
  result is **156 passed, 5 deselected**. The keyless-provider test must explicitly
  `delenv("FMP_API_KEY"/"TIINGO_TOKEN")` because the local `.env` ships live keys.

---

### 18.4 — new openst routes `/crypto/ohlcv/{pair}` and `/crypto/quote/{pair}`

- [x] In `openst/src/main.py` add two routes following the `/price/ohlcv` pattern:
  - `GET /crypto/ohlcv/{pair}?start&end` — calls `get_crypto_ohlcv`; returns JSON
    array of OHLCV dicts or `404` if `None`; same `start`/`end` default-window logic
    (365-day default if omitted, via `_default_dates()`) as the equity route.
  - `GET /crypto/quote/{pair}` — calls `get_crypto_quote`; returns single JSON object
    or `404`.
- [x] Update `openst/tests/` with route-level tests (mock `get_crypto_ohlcv` /
  `get_crypto_quote`):
  - `200` with correct JSON body for a valid pair.
  - `404` when client returns `None`.
  - `start`/`end` query params forwarded to the client function.
- [x] Run full openst test suite (docker compose — all tests must pass).
- [x] Commit.

  **Result (2026-09-15):** routes follow the existing `/price/ohlcv` pattern verbatim —
  `_default_dates()` fallback (note: the equity route's actual default is the 365-day
  window, not 90-day) and `_cached_or_404` (JSON array / single object, `404` when the
  client returns `None`). 6 route tests added in `tests/test_main.py` (200 body, 404,
  explicit-window forwarding, bad-date 422 for OHLCV; 200 + 404 for quote). After a test
  image rebuild the full suite is **156 passed, 5 deselected** (18.3 + 18.4 together;
  the stale-image first run had reported a misleading 143).

---

### 18.5 — openst standalone compose smoke (local, real HTTP)

- [x] Start openst standalone compose: `docker compose up -d` (redis + app).
- [x] Smoke-curl — **one request per endpoint** (not a loop):
  ```bash
  curl "http://localhost:8080/crypto/ohlcv/BTC-USD?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with {date, open, high, low, close, volume} rows
  curl "http://localhost:8080/crypto/quote/BTC-USD"
  # expect: single JSON object with price/volume fields
  ```
- [x] Second call to each URL: confirm Redis cache HIT (no outbound HTTP).
- [x] Note results (row count, field sample) inline below.
- [x] `docker compose down`.
- [x] Commit note (no code change — observations only).  Push openst to `main`.
  Wait for GHA image build.

  **Note:** host port 8080 was already published by the `portfoliost-gateway` stack
  (its 8080-only port mapping, while openst standalone also wants 8080), so the smoke ran
  on `localhost:18080` via a one-off container from the freshly built `openst-app` image
  on the standalone `openst_default` network (`--env-file .env -e REDIS_HOST=redis`).

  **Results (2026-09-15, live data via yfinance):**
  - `GET /crypto/ohlcv/BTC-USD?start=2026-01-01&end=2026-06-30` → **181 rows**.
    First/last:
    ```json
    {"date": "2026-01-01", "open": 87508.0469, "high": 88803.2266, "low": 87399.4062, "close": 88731.9844, "volume": 18849043990}
    {"date": "2026-06-30", "open": 60136.4531, "high": 60173.2188, "low": 58111.6719, "close": 58558.8594, "volume": 32747419391}
    ```
  - `GET /crypto/quote/BTC-USD` → single object (latest close 2026-09-15):
    ```json
    {"symbol": "BTC-USD", "price": 77134.2031, "open": 78181.3281, "high": 78232.375, "low": 76735.1797, "volume": 29305964544, "date": "2026-09-15", "change": -1029.1797, "change_percent": -0.01}
    ```
  - **Cache HITs:** second call to each URL returned identical bodies at
    0.0134 s / 0.0071 s (no outbound fetch); Redis keys present with default TTL
    (`crypto_ohlcv:BTC-USD:2026-01-01:2026-06-30`, `crypto_quote:BTC-USD`).

---

### 18.6 — cachest: `OPENST_CRYPTO_OHLCV` + `OPENST_CRYPTO_QUOTE` routes

- [x] In `cachest/config.yaml`, add after `OPENST_OHLCV_FUNDS`:
  ```yaml
  - name: OPENST_CRYPTO_OHLCV
    path: /crypto/ohlcv/{pair}
    url: "http://openst:8080/crypto/ohlcv/{pair}?start={start}&end={end}"
    query_params: [start, end]
    cache_ttl: 21600           # 6h — mirrors OPENST_OHLCV
    stale_ttl: 2592000
    fetch_interval: 2
    fetch_max_wait: 4

  - name: OPENST_CRYPTO_QUOTE
    path: /crypto/quote/{pair}
    url: "http://openst:8080/crypto/quote/{pair}"
    cache_ttl: 21600           # 6h — daily prices only
    stale_ttl: 2592000
    fetch_interval: 2
    fetch_max_wait: 4
  ```
- [x] Add `test_real_config_has_crypto_ohlcv_route` and
  `test_real_config_has_crypto_quote_route` to `cachest/tests/test_config.py`
  (assert `name`, `url`, `query_params` for OHLCV; `name`, `url` for quote).
- [x] Run cachest test suite (all tests must pass):
  ```bash
  docker compose --profile test run --rm test
  ```
- [x] Commit cachest config + tests.  Push cachest to `main`.  Wait for GHA image build.

  **Result (2026-09-15):** both routes added in `config.yaml` exactly as specced (after
  `OPENST_OHLCV_FUNDS`, `fetch_timeout` left at default — crypto providers are plain HTTP,
  no biznesradar-style scrape). 2 new `test_config.py` assertions; full suite
  **73 passed** (fresh image build first — config/tests are baked into the `test` image).

---

### 18.7 — portfoliost compose stack smoke (full chain)

- [x] Rebuild openst + cachest images in portfoliost compose to pick up the new versions:
  ```bash
  docker compose up -d --build redis openst cachest
  ```
- [x] Smoke-curl through cachest (**single requests**):
  ```bash
  curl "http://localhost:8090/crypto/ohlcv/BTC-USD?start=2026-01-01&end=2026-06-30"
  # X-Cache: MISS on first call; HIT on repeat
  curl "http://localhost:8090/crypto/quote/BTC-USD"
  # X-Cache: MISS on first call; HIT on repeat
  ```
- [x] Run `npm run test:stack` — existing contract checks must stay green (no regression).
- [x] Commit note: `chore: verify D78 smoke through full compose stack`.

  **Result (2026-09-15):** rebuilt `portfoliost-openst` + `portfoliost-cachest` from the
  local `../openst` / `../cachest` sources (config.yaml rides the existing volume mount).
  Full-chain smoke through cachest on `:8090`:
  - `GET /crypto/ohlcv/BTC-USD?start=2026-01-01&end=2026-06-30` → 200, **181 rows**
    (last bar 2026-06-30 close 58558.8594); `X-Cache: MISS` then `X-Cache: HIT`,
    bodies identical.
  - `GET /crypto/quote/BTC-USD` → 200, latest close 76907.7266 (2026-09-15);
    `X-Cache: MISS` then `X-Cache: HIT`, bodies identical.
  - `npm run test:stack` → **32/32 checks passed** (no regression; instrument contract
    checks hit the same live openst through cachest, upstream detected `real`).

---

### 18.8 — closeout

- [x] Update `docs/proposals/instruments-provider-module.md` D78 status to `done`.
- [x] Update `docs/openst-coverage.md` to note crypto provider coverage via
  `openbb-crypto` for `BTC-USD`-style pairs.
- [x] Archive this section to `plan-archive.md` once all steps are `[x]`.

  **Result (2026-09-15):** D78 verdict cell in `instruments-provider-module.md`
  coverage table set to `done`; `openst-coverage.md` gained two crypto rows
  (OHLCV `/crypto/ohlcv/{p}` and quote `/crypto/quote/{p}`, both via
  `crypto.price.historical`, providers yfinance/fmp/tiingo, 6h cachest TTLs, and the
  quote-is-derived note) with the coverage date bumped to 2026-09-15. Section archived.

---
