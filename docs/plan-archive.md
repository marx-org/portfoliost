# plan-archive.md — archived work

Long-running plan. Each step is implemented, verified (build + unit + mock + e2e), committed, and then marked here.

Legend: `[ ]` pending · `[x]` done

Single archive since 2026-09-19 — `plan-archive2.md` merged here; its sections were renumbered to
0 / 29–33 (was 1–5), 17 kept, and the duplicate D77 pointer (was 16) dropped. §25 (D80/D81/D82) archived here at closeout (2026-09-19).

---

# General rules

## Testing strategy, mocking, and migration

### Endpoint migration approach

- [ ] Pick endpoint to migrate (for example: `GET /api/users/preferences`).
- [ ] Implement in respective module, for example `portfoliost-backend`.
- [ ] Write backend unit tests.
- [ ] Add seed data if needed.
- [ ] Switch gateway route to respective module, for example `deploy/services.env`:
  `API_USERS_URL` → `http://portfoliost-backend:3000`.
- [ ] Add E2E test for the endpoint.
- [ ] Delete mock handler.
- [ ] Verify: build + unit + mock + e2e. Commit.

### Subsequent endpoints

- [X] `/api/auth/*` + `/api/users/*`
- [X] `/api/portfolios/*`
- [X] `/api/wallets/*`
- [ ] `/api/watchlists/*`
- [X] `/api/instruments/*`
- [ ] `/api/charting/*`

### Final mock removal steps
- [ ] Delete `mocks/` directory.
- [ ] Remove `example-service-mock` service from `docker-compose.yml`.
- [ ] Remove `Dockerfile.mock`.
- [ ] Remove `npm run test:mock` script.
- [ ] Remove `scripts/regen-seed.mjs` and `discovery/raw/`.
- [ ] Update `AGENTS.md` to reflect new architecture.

---

## 0. Database preparation

- [x] enable `postgres_fdw` extension
- [x] make sure all stooq tables are available in the `stooq` DB on the same Postgres instance
- [x] mapp all stooq tables as foreign tables in `portfoliost-instruments` DB

---

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

---

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

---

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

---

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

---

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

---

## 12. Instrument logos (provider-resolved, permanently stored)

Proposal: [logos.md](proposals/logos.md) (accepted 2026-08-25, D34–D37). Resolve logos once through the provider tier, persist binaries on disc + metadata in Postgres, serve from our own infrastructure; generated initials as terminal fallback.

Verified provider facts (2026-08-25): FMP's legacy `financialmodelingprep.com/image/logo/{T}.png` path is dead (403) — the live keyless CDN is `images.financialmodelingprep.com/symbol/{T}.png` (covers WSE names like KTY.WA). OpenBB's yfinance profile carries **no** logo field; its `company_url` (website) feeds the favicon fallback. Google s2 favicons verified reachable from the compose network.

- [x] 12.1 openst `/equity/logo/{ticker}` route: FMP CDN HEAD → yfinance profile `company_url` → favicon chain, returns `{source, remote_url}` or 404; pytest suite
- [x] 12.2 cachest `OPENST_LOGO` route (`/logo/{ticker}`, short TTL) caching resolution lookups only — binaries never flow through cachest (D36)
- [x] 12.3 instruments: `instruments.logos` migration (`symbol PK, source, remote_url, file, bytes, sha256, fetched_at, refresh_after`) + resolve/persist/single-flight service + adapter `fetchLogo`
- [x] 12.4 `/api/logos/:symbol` (+`/logos/:symbol` parity alias) serving local files with immutable caching; deterministic initials SVG fallback (ported from mock), never persisted; auth-exempt (SPA `<img>` tags carry no JWT); gateway flip `API_LOGOS_URL` → instruments; mock handler retired
- [x] 12.5 disc volume: bind mount `../portfoliost-instruments/data/logos` in compose; cluster HelmRelease persistence deferred with the module's cluster rollout (D15 scope)
- [x] 12.6 stack-test logo checks (real/mock distinguishing) + e2e: WSE ticker renders a logo (real or initials); file persisted on disc; I10 full suite green

---

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

---

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

---

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

---

## 17. D78 — biznesradar search + quote fallback (PL fund/bond lookup end-to-end)

### Finding (2026-09-14 — post-deploy live probe for `BST0327.WA`)

`GET /equity/search/bst0327.wa` 404s and biznesradar is never called. Root cause:

- openst search only tries `SEARCH_PROVIDERS = ["sec", "nasdaq", "cboe"]`
  (`openst/src/openbb_client.py:17`); all three return "Results not found" for the bond → openst
  `_cached_or_404` → 404.
- cachest passes that through: `[not-found] 'http://openst…:8080/equity/search/bst0327.wa'
  returned HTTP 404` → instruments search yields nothing.
- biznesradar **cannot** serve search today: D77 wired it only into
  `PRICE_PROVIDERS` (OHLCV). The plugin registers exactly one fetcher under the
  `EquityHistorical` model key (`openbb_biznesradar/__init__.py`), so
  `obb.equity.search(provider="biznesradar")` has no fetcher to dispatch to.
- Downstream dead-end even with a search hit: the instruments detail fetch for the bond calls openst
  quote/profile, which run
  `QUOTE_PROVIDERS = ["fmp", "yfinance", "cboe"]` /
  `PROFILE_PROVIDERS = ["fmp", "yfinance"]` — none resolve `BST0327.WA`. biznesradar only backs
  `price.historical`.
- biznesradar.pl surface (probed 2026-09-14): the bond resolves at
  `/notowania/BST0327` (the D77 scraper hits it), but the public
  `/szukaj?wartosc=BST0327` results page does **not** index by symbol — a search fetcher must probe
  `/notowania/{symbol}` existence rather than rely on `/szukaj`.

### Decision (2026-09-14)

Build the **search + quote fallback** path (full flow), not search-only.

### Steps

- [x] **17.1** — biznesradar `EquitySearch` fetcher (`models/equity_search.py`):
    - Input `q`; normalize → symbol (uppercase; keep `.WA`/`.TFI`/`.FIZ`).
    - Probe `GET /notowania/{symbol}` (shared rate-limit helper from D77 scraper); 200 + expected
      table ⇒ `[{name, symbol, cik: null}]` (name from page title / table header); 404/missing
      table ⇒ `[]`.
    - Register under OpenBB `EquitySearch` in `fetcher_dict`.
- [x] **17.2** — append `"biznesradar"` to `SEARCH_PROVIDERS` (last). Unit tests: mock `httpx.get`
  on `/notowania/{q}` 200 vs 404; openbb_client search-fallback test (sec/nasdaq/cboe empty →
  biznesradar hit).
- [x] **17.3** — biznesradar quote fetcher (`models/equity_quote.py`, OpenBB
  `EquityQuote`): scrape today/last close + change/volume from `/notowania/{symbol}`
  → `{symbol, name, price, change, change_percent, previous_close, day_high,
  day_low, volume}` (fields used by `price.quote`); stub gracefully when the row is missing.
  Register under `EquityQuote`.
- [x] **17.4** — openst wiring: append `"biznesradar"` to `QUOTE_PROVIDERS`
  (last) and, for full PL coverage, `PROFILE_PROVIDERS` (biznesradar
  `EquityProfile` minimal: `{name, symbol, currency:"PLN"}` or empty list → fall through to existing
  providers). openbb_client fallback tests for both.
- [x] **17.5** — verify: openst compose suite (all pass) + plugin suite; cachest unchanged (same
  routes, no new route needed); full compose stack smoke:
  `curl /equity/search/bst0327.wa` → 200 with a search hit, then instruments
  `/api/instruments/BST0327.WA` detail resolves via quote/profile fallback. Keep
  `npm run test:stack` green.
- [x] **17.6** — commit openst (+ plan), push `main`, wait for GHA image build, bump homelab
  helmrelease, verify in cluster (search + detail for `BST0327.WA`).

---

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

## 19. D79 — retail savings bonds: `openbb_obligacje` provider in openst

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — D79.

Adds the `openbb_obligacje` plugin to openst that prices Polish retail savings bonds
(ROD, EDO, OTS, ROR, DOR, TOS, COI, ROS) on demand via a pure-Python engine.
No market price exists for these instruments — value is computed from issue parameters
and CPI history.  Data (CPI + bond_series catalogue) lives in a new Postgres schema
`openst` in the shared PGO cluster.  Daily k8s CronJobs keep the data fresh.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per openst and cachest CLAUDE.md).

---

### 19.1 — homelab: Postgres `openst` schema + secret

- [x] In the homelab repo, add PGO least-privilege user `openst` and schema `openst`
  alongside existing module schemas (follow the pattern from `portfoliost-instruments`
  or `portfoliost-wallets`).
- [x] Add `DATABASE_URL` to `openst-secrets` (k8s Secret in `pfire` namespace).
- [x] Add `DATABASE_URL` env var to the openst HelmRelease
  (`cluster/apps/pfire/openst/app/helmrelease.yaml`) referencing the secret.
- [x] Commit homelab. Verify secret is present in cluster:
  ```bash
  export KUBECONFIG=$HOME/.kube/homylab
  kubectl get secret openst-secrets -n pfire -o jsonpath='{.data.DATABASE_URL}' | base64 -d
  ```

---

### 19.2 — openst: Postgres connection + schema migrationss

- [x] Add `psycopg2-binary` (or `psycopg[binary]`) to `openst/requirements.txt`.
- [x] Create `openst/src/db.py`: thin module that reads `DATABASE_URL` from env and
  exposes a `get_conn()` helper (plain psycopg2 connection, no ORM needed).
- [x] Create `openst/migrations/001_openst_schema.sql`:
  ```sql
  CREATE SCHEMA IF NOT EXISTS openst;

  CREATE TABLE IF NOT EXISTS openst.cpi_12m (
      date    DATE PRIMARY KEY,
      value   NUMERIC(8,4) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS openst.bond_series (
      symbol          TEXT PRIMARY KEY,   -- e.g. EDO0936
      name            TEXT NOT NULL,
      series_code     TEXT NOT NULL,      -- EDO, ROD, OTS, …
      issue_date      DATE NOT NULL,
      maturity_date   DATE NOT NULL,
      term_months     INT NOT NULL,
      rate_rule       TEXT NOT NULL,      -- 'fixed' | 'cpi_12m+margin'
      margin          NUMERIC(6,4) NOT NULL,
      fee_b           NUMERIC(6,2) NOT NULL,
      nominal         NUMERIC(8,2) NOT NULL DEFAULT 100.00
  );
  ```
- [x] Migration runs at openst startup (add to `src/main.py` lifespan, guarded by
  `DATABASE_URL` presence — openst still starts without DB for non-bond routes).
- [x] Unit test: migration is idempotent (run twice, no error).
- [x] Run full openst test suite (docker compose — must stay green).
- [x] Commit.

---

### 19.3 — CPI importer script + one-shot k8s Job

Requirement vs reality: the live `obligacje.pl/pl/narzedzia/inflacja` page has **no
`Data | Wartość` HTML table** — the CPI series (320 rows, Jan 2000 → now, incl.
negative deflation values for 2014-15) is embedded in a
`google.visualization.arrayToDataTable([...])` JS block as `[new Date(YYYY,M,D), value]`
with a 0-based month and dot-decimal values. Range filtering is server-side via
`…inflacja,data_od-YYYY_MM_DD,data_do-YYYY_MM_DD` (parse, don't paint). The
importer therefore parses the JS array, not a table. The k8s Job/CronJob reuses
the openst image (`ghcr.io/marx2/openst:<tag>`) with a command override —
`python -m src.importers.cpi --mode …` (same pattern as `scanst-job.yaml`).

- [x] Create `openst/src/importers/cpi.py`:
  - Parses the `arrayToDataTable` JS block (regex over `new Date(y,m,d), value]`),
    dates to `YYYY-MM-DD`, values as `Decimal` (dot-decimal, integer, or negative).
  - Upserts rows into `openst.cpi_12m` (INSERT … ON CONFLICT DO NOTHING).
  - `--mode full` fetches `MAX` history (no range params — initial import).
  - `--mode incremental` fetches last 60 days (daily CronJob).
- [x] Unit tests (`openst/tests/test_cpi_importer.py`) with captured
  `obligacje.pl` HTML fixture:
  - Correct date parsing for all 12 (0-based JS) months.
  - Correct value parsing (dot-decimal, plain int, negative).
  - Upsert: duplicate rows are silently ignored.
- [x] Capture HTML fixture: `openst/tests/fixtures/obligacje/inflacja.html`
  (one fetch to the MAX page, saved to file — same approach as biznesradar fixtures).
- [x] Run full openst test suite (docker compose — must stay green).
- [x] Commit.

---

### 19.4 — bond_series importer script + one-shot k8s Job

Requirement vs reality: the live `obligacjeskarbowe.pl` offer pages carry **no HTML
`Data | Wartość`-style table** — each emission's parameters are a
`<ul class="product-details__list">` of `label`/`value` rows, and the redemption
fee is prose in the "Opłaty dodatkowe" section. Two further realities reshape the
scrape:
1. **The site always renders the *currently-active* emission per series** (the
   per-emission detail URL `…/obligacje-{slug}/{symbol}/` is cosmetic — it serves
   the same live parameters). Per-emission scraping therefore accumulates the
   catalog over time (each monthly emission is captured once, then its row is
   immutable via `ON CONFLICT DO NOTHING`); it does **not** recover historical
   parameters (those live in the official `listy-emisyjne` PDFs, out of scope).
2. **Three rate rules, not two**: `fixed` (OTS, TOS), `cpi_12m+margin` (COI, ROS,
   EDO, ROD) and `nbp_ref+margin` (ROR, DOR — indexed to the NBP reference rate +
   margin, not CPI). `rate_rule` is a free `TEXT` column, so the third value is
   valid; D79's pricing engine (19.5) prices `fixed` + `cpi_12m+margin`, and
   `nbp_ref+margin` series are priced once D83 lands NBP reference rates.

- [x] Create `openst/src/importers/bond_series.py`:
  - `--mode full` fetches the eight per-series offer pages
    (`/oferta-obligacji/obligacje-{slug}/`; the slug carries the term, e.g.
    `obligacje-10-letnie-edo`) and parses the active emission from each.
  - `--mode incremental` fetches the current-offer page (`/oferta-obligacji/`),
    follows its per-emission detail links and parses each (~8 active emissions).
  - Parses the `product-details__list` rows (Seria → symbol `{TYPE}{MMYY}`,
    Sprzedaż → issue_date, Oprocentowanie → rate_rule + margin) and the
    "Opłata wynosi X,XX zł" prose (last occurrence) → fee_b; `term_months` from a
    per-series map; `maturity_date` = issue_date + term_months (day-clamped).
  - Upserts into `openst.bond_series` (INSERT … ON CONFLICT DO NOTHING — emissions
    are immutable once published).
- [x] Capture HTML fixtures for all eight series types plus the current-offer page:
  `openst/tests/fixtures/obligacjeskarbowe/{ots,ror,dor,tos,coi,ros,edo,rod,oferta}.html`
  (one fetch each — covers all three rate rules and both modes).
- [x] Unit tests (`openst/tests/test_bond_series_importer.py`) with fixtures:
  - Field extraction (symbol, issue/maturity dates, term, rate_rule, margin, fee_b,
    nominal) for all eight series / all three rate rules.
  - `add_months` day-clamping; margin/fee extraction; fee last-occurrence +
    per-series default fallback; offer-page link parsing; `run` mode plumbing;
    upsert idempotency (duplicate symbols ignored).
- [x] Run full openst test suite (docker compose — must stay green): 212 passed.
- [x] Commit.

---

### 19.5 — pricing engine (`openbb_obligacje` plugin scaffold + engine)

- [x] Create `openst/plugins/openbb_obligacje/` with the same scaffold as
  `openbb_biznesradar`:
  ```
  openst/plugins/openbb_obligacje/
  ├── pyproject.toml
  ├── openbb_obligacje/
  │   ├── __init__.py           # exposes obligacje_provider (Provider instance)
  │   ├── engine.py             # pure pricing functions
  │   └── models/
  │       ├── __init__.py
  │       ├── fixedincome_historical.py
  │       ├── fixedincome_search.py
  │       └── fixedincome_profile.py
  └── tests/
      ├── __init__.py
      ├── test_engine.py
      ├── test_fixedincome_historical.py
      ├── test_fixedincome_search.py
      └── test_fixedincome_profile.py
  ```
- [x] Add `-e ./plugins/openbb_obligacje` to `openst/requirements.txt`.
- [x] Update `openst/Dockerfile` to `COPY plugins/ ./plugins/` (already done for
  biznesradar — verify it covers the new plugin).
- [x] `engine.py` — pure functions, no DB access, fully unit-tested:
  - `price_series(bond: BondSeries, cpi_rows: list[CpiRow], start: date, end: date) -> list[dict]`
  - Capitalized series: `W = N·∏(1+r_k)` across elapsed periods.
  - Redemption value: `WP = N + O − b` with `O = N·r·(a/D)/F` (ACT/ACT accrual).
  - 100 PLN floor in first period; `b ≤ O` cap for capitalized series.
  - Fees per series: OTS 0, ROR 0.50, DOR 0.70, TOS 1.00, COI 2.00, EDO/ROD/ROS 3.00 PLN.
- [x] `test_engine.py` — tests against `obligacjeskarbowe.pl` published worked examples
  for at least: one fixed series (OTS), one CPI-linked series (EDO or COI).
- [x] Commit scaffold + engine (fetcher stubs may skip/fail — engine tests must pass).

---

### 19.6 — fetchers: `FixedIncomeHistoricalFetcher`, `SearchFetcher`, `ProfileFetcher`

**Verified wiring (openbb 4.7.2 / openbb-fixedincome 1.6.2 / openbb-core 1.6.13):** there is
**no** `FixedIncomeHistorical` standard model and **no** `fixedincome.price` router. The
fixed-income suite only exposes `rate`, `spreads`, `government` (yield_curve, treasury_rates,
treasury_auctions, treasury_prices, tips_yields) and `corporate` (bond_prices, spot_rates, …).
Neither fits the redemption OHLCV series: `TreasuryPrices` is a date-only snapshot with no symbol
selector (single `date` param, bid/offer/eod_price), `BondPrices` is a screener (no history).
A provider registered under `FixedIncomeHistorical` is **not callable through any `obb.*` command**
— verified live: `obb.fixedincome.government.treasury_prices(provider="obligacje")` fails
validation (`Input should be 'government_us' or 'tmx'`). Follow the repo precedent — the biznesradar
plugin already overloads the equity models for Catalyst bonds. **Register the obligacje fetchers
under the `EquityHistorical`, `EquitySearch` and `EquityInfo` model keys**, making them reachable
as `obb.equity.price.historical(..., provider="obligacje")`, `obb.equity.search(..., provider="obligacje")`,
`obb.equity.profile(..., provider="obligacje")`.

- [x] Re-point the 19.5 stubs at the equity standard models (and change the model keys in
  `openbb_obligacje/__init__.py` from `FixedIncomeHistorical/Search/Profile` to
  `EquityHistorical/EquitySearch/EquityInfo`):
  - `fixedincome_historical.py` — subclass `EquityHistoricalQueryParams`/`EquityHistoricalData`
    (date/open/high/low/close/volume — exact fit for `engine.price_series` rows).
  - `fixedincome_search.py` — subclass `EquitySearchQueryParams`/`EquitySearchData`
    (`{symbol, name, maturity_date}` mapped onto the optional fields).
  - `fixedincome_profile.py` — subclass `EquityInfoQueryParams`/`EquityInfoData`
    (only `symbol` required; carry `name` and the emission fields where the schema allows).
- [x] `fixedincome_historical.py` — `FixedIncomeHistoricalFetcher`:
  - Reached via `obb.equity.price.historical(symbol, start_date, end_date, provider="obligacje")`.
  - Reads `bond_series` + `cpi_12m` from Postgres via `db.get_conn()`.
  - Calls `engine.price_series(...)` and returns results as an `EquityHistoricalData` list.
  - Returns empty list (not error) if symbol not found in `bond_series`.
  - Raises informative error if `cpi_12m` is stale (latest row older than 40 days).
- [x] `fixedincome_search.py` — queries `bond_series` by symbol prefix or name
  substring; returns `{symbol, name, maturity_date}`.
- [x] `fixedincome_profile.py` — returns static fields from `bond_series` for a
  known symbol; 404-equivalent (empty list) if symbol unknown.
- [x] Unit tests for all three fetchers (mock DB connection).
- [x] `pytest openst/plugins/openbb_obligacje/tests/` — all pass.
- [x] Wire-check in the test image that `provider="obligacje"` now appears in the
  `obb.equity.price.historical` / `obb.equity.search` / `obb.equity.profile` provider Literals.
- [x] Run full openst test suite (docker compose — all pass).
- [x] Commit.

---

### 19.7 — wire into `openbb_client.py` + new openst routes

- [x] In `openst/src/openbb_client.py` add:
  - `get_bond_ohlcv(symbol: str, start_date: str, end_date: str) -> list[dict] | None`
    — calls `obb.equity.price.historical(symbol, start_date=start_date, end_date=end_date,
    provider="obligacje")`; returns `None` if empty or DB unavailable.
  - `get_bond_profile(symbol: str) -> dict | None`
    — calls `obb.equity.profile(symbol, provider="obligacje")`.
  - `search_bonds(query: str) -> list[dict]`
    — calls `obb.equity.search(query, provider="obligacje")`.
- [x] In `openst/src/main.py` add routes:
  - `GET /fixedincome/ohlcv/{symbol}?start&end` → `get_bond_ohlcv`; 404 on None.
  - `GET /fixedincome/profile/{symbol}` → `get_bond_profile`; 404 on None.
  - `GET /fixedincome/search/{query}` → `search_bonds`; empty array on no results.
- [x] Route-level tests (mock client functions): 200/404 for ohlcv and profile;
  200 with array for search.
- [x] Run full openst test suite (docker compose — all pass).
- [x] Commit (folded into 19.7 commit `5942ea6`); openst pushed to `main`.

---

### 19.8 — openst standalone compose smoke (local, real DB)

- [x] Start openst standalone compose with DB populated:
  ```bash
  # Run importers locally against a test DB first
  docker compose up -d redis app
  docker compose run --rm app python -m src.importers.cpi --mode full
  docker compose run --rm app python -m src.importers.bond_series --mode full
  ```
- [x] Smoke-curl — **one request per endpoint**:
  ```bash
  curl "http://localhost:8080/fixedincome/ohlcv/EDO0936?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with daily {date, open, high, low, close, volume} rows
  curl "http://localhost:8080/fixedincome/profile/EDO0936"
  # expect: JSON object with name, maturity_date, rate_rule, margin, fee_b
  curl "http://localhost:8080/fixedincome/search/EDO"
  # expect: JSON array of matching emissions
  ```
- [x] Second OHLCV call: confirm Redis cache HIT.
- [x] `docker compose down`.
- [x] Commit note (observations only).

**Smoke observations (2026-09-16):** to run, `DATABASE_URL` must be added to
`openst/.env` (gitignored — the compose `app` service has no DB wiring otherwise);
point it at the compose postgres (`postgresql://openst:openst@postgres:5432/openst`,
same as the `test` profile). Importers: CPI 320 rows / 317 inserted, bond_series 8
emissions (`OTS1226 ROR0927 DOR0928 TOS0929 COI0930 ROS0932 EDO0936 ROD0938`).
`/fixedincome/profile/EDO0936` and `/fixedincome/search/EDO` return 200 with issue
params / match arrays. The plan's documented OHLCV window (`2026-01-01..2026-06-30`)
returns **404** because the currently-active `EDO0936` only issues **2026-09-01** —
the window predates issuance, so the engine prices zero rows. With a window
overlapping issuance (`2026-09-01..2026-09-30`) the endpoint returns the expected
daily `{date, open, high, low, close, volume}` rows (100.00 floor). Second call:
identical 2910-byte payload + `fixedincome_ohlcv:*` key with ~24h TTL → cache HIT.

---

### 19.9 — cachest: `OPENST_BOND_OHLCV` + `OPENST_BOND_PROFILE` routes

- [x] In `cachest/config.yaml`, add after `OPENST_CRYPTO_QUOTE`:
  ```yaml
  - name: OPENST_BOND_OHLCV
    path: /fixedincome/ohlcv/{symbol}
    url: "http://openst:8080/fixedincome/ohlcv/{symbol}?start={start}&end={end}"
    query_params: [start, end]
    cache_ttl: 21600           # 6h — computed daily prices
    stale_ttl: 2592000
    fetch_interval: 2
    fetch_max_wait: 4

  - name: OPENST_BOND_PROFILE
    path: /fixedincome/profile/{symbol}
    url: "http://openst:8080/fixedincome/profile/{symbol}"
    cache_ttl: 86400           # 24h — static bond metadata
    stale_ttl: 2592000
    fetch_interval: 60
    fetch_max_wait: 4
  ```
- [x] Add `test_real_config_has_bond_ohlcv_route` and
  `test_real_config_has_bond_profile_route` to `cachest/tests/test_config.py`.
- [x] Run cachest test suite (all pass).
- [x] Commit. Push cachest to `main`. Wait for GHA image build.

**Deploy (homelab) — done 2026-09-16:** added both routes to the cluster ConfigMap
`cluster/apps/pfire/cachest/app/config/config.yaml` (k8s URLs
`http://openst.pfire.svc.cluster.local:8080/fixedincome/...`); no nginx ingress
route change was needed — the cachest `path: /` ingress (and openst's) already
route `/fixedincome/*`. Bumped images: openst `v1.1.21` (19.7 build — both `app`
and `cpi-import` refs) and cachest `v1.0.32`. ConfigMap reloader restarts cachest
on config change; Flux synced both commits.

---

### 19.10 — portfoliost compose stack smoke (full chain)

- [x] Rebuild openst + cachest in portfoliost compose:
  ```bash
  docker compose up -d --build redis openst cachest
  ```
- [x] Smoke-curl through cachest (**single requests**):
  ```bash
  curl "http://localhost:8090/fixedincome/ohlcv/EDO0936?start=2026-01-01&end=2026-06-30"
  # X-Cache: MISS then HIT
  curl "http://localhost:8090/fixedincome/profile/EDO0936"
  # X-Cache: MISS then HIT
  ```
- [x] Run `npm run test:stack` — existing contract checks must stay green.
- [x] Commit note: `chore: verify D79 smoke through full compose stack`.

**Done 2026-09-16.** Two compose-prep notes:
- `portfoliost/docker-compose.yml` `openst` service gained an explicit
  `DATABASE_URL: postgres://portfoliost:portfoliost@postgres:5432/portfoliost`
  (plus `depends_on postgres: service_healthy`). The env_file `../openst/.env`
  carries the *standalone* compose DB URL (`openst/openst` db) added in 19.8,
  which does not exist in the portfoliost compose postgres — without the pin,
  openst crash-loops at boot (migration connect fails). openst reuses the shared
  compose DB with its own `openst` schema (same pattern as the cluster).
- After rebuild: openst boot applied `001_openst_schema` into the shared DB;
  seeded via `docker compose run --rm openst python -m src.importers.cpi
  --mode full` (320 rows) and `... bond_series --mode full` (8 emissions).

Smoke results through cachest :8090:
- Plan's documented OHLCV window (`EDO0936` `2026-01-01..2026-06-30`) → **404**
  (same pre-issuance behaviour as 19.8: EDO0936 issues 2026-09-01). Valid window
  `2026-09-01..2026-09-30` → 200, 30 daily rows, `X-Cache: MISS` then `HIT`.
- `profile/EDO0936` → 200 (10y EDO, issue 2026-09-01, margin 2.0, cpi_12m+margin),
  `X-Cache: MISS` then `HIT`.

`npm run test:stack` against the full compose stack (gateway :8080 → instruments
→ cachest → openst): **32/32 checks passed**, upstream detected `real`.

---

### 19.11 — closeout

- [x] Update `docs/proposals/instruments-provider-module.md` D79 status to `done`.
- [x] Update `docs/openst-coverage.md` to note savings bond coverage via
  `openbb_obligacje` for `EDO*`, `ROD*`, `OTS*`, `ROR*`, `DOR*`, `TOS*`, `COI*`, `ROS*`.
- [x] Archive this section to `plan-archive.md` once all steps are `[x]`.

---

  **D79 — DONE (2026-09-16):** all steps verified through test:stack 32/32 + compose smoke; archived from plan.md.

---

## 20. Crypto search + asset-type labels (D78 gap-fix)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — D78
gap-fix (2026-09-15). Step 18 shipped only `/crypto/ohlcv/{pair}` + `/crypto/quote/{pair}`; the
search/profile half of D78 (`openst /crypto/search/{query}` + `/crypto/profile/{pair}`) was
skipped, so the SPA search could never surface a crypto pair.

Scope (4 repos): openst (two routes + client fn), cachest (two routes), portfoliost-instruments
(crypto search leg + `type: "CRYPTO"`), SPA — **no change needed**: the search modal already
renders the `result.type` badge (`InstrumentSearchModal.vue:102`). Bonds: `BOND` type surfaces
once D79 seeds `ticker_reference` (mapping added in step 20.5, no crypto-blocking).

Verified live in cluster (2026-09-15, openst v1.1.16):
- `obb.crypto.search("btc", provider="fmp")` works; **fmp-only** (yfinance/tiingo reject it);
  `FMP_API_KEY` already in `openst-secrets`.
- Rows are FMP-style pairs (`TBTCUSD`, `BTCBUSD`, …) — **not** the yfinance pairs
  (`BTC-USD`) the OHLCV/quote routes accept. `fmp` OHLCV rejects `BTC-USD` (402); yfinance is
  the pair authority. Search results therefore need symbol normalization in instruments.
- `ticker_reference` has only `Stock` (45,210) + `ETF` (16,601) — no crypto rows. The SPA
  placeholder already promises "crypto" (`InstrumentSearchModal.vue:74`).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per openst and cachest CLAUDE.md; portfoliost build + vitest).

---

### 20.1 — openst: `get_crypto_search` client function

- [x] In `openst/src/openbb_client.py` add `get_crypto_search(query: str) -> list[dict]`,
  fmp-only loop mirroring `search_equities` (rate-limit block, empty → continue → `[]`).
- [x] Unit tests in `openst/tests/test_openbb_client.py`: monkeypatched `obb.crypto.search`
  returns rows → pass-through; empty df → `[]`; rate-limited provider → blocked + next.
- [x] Tests: openst full suite via `docker compose --profile test run --rm test`.
- [x] Commit: `feat(openbb_client): crypto search client fn (fmp-only)`.

### 20.2 — openst: `/crypto/search/{query}` + `/crypto/profile/{pair}` routes

- [x] In `openst/src/main.py` add `GET /crypto/search/{query}` (mirror of `/equity/search`:
  `_cached_or_404`, lowercase-normalized query) and `GET /crypto/profile/{pair}` (quote →
  `{ symbol, name, currency }` from the two search/quote fields that exist; pair kept as-is).
- [x] Route tests in `openst/tests/test_main.py`: search returns rows / 404 on empty; profile
  maps quote fields / 404 on missing quote.
- [x] Tests: full openst suite; compose-level smoke `curl /crypto/search/btc` → rows, second
  call → `X-Cache: HIT`; `curl /crypto/profile/btc-usd` → 200.
- [x] Commit: `feat(main): crypto search + profile routes (D78 gap-fix)`.

### 20.3 — cachest: `OPENST_CRYPTO_SEARCH` + `OPENST_CRYPTO_PROFILE`

- [x] `cachest/config.yaml`: `OPENST_CRYPTO_SEARCH` `/crypto/search/{query}` (TTL 7d — universe
  changes rarely, matches `OPENST_SEARCH`) and `OPENST_CRYPTO_PROFILE` `/crypto/profile/{pair}`
  (TTL 6h, matches `OPENST_CRYPTO_QUOTE`).
- [x] Tests: `cachest/tests/test_config.py` gains an assertion per new route.
- [x] Tests: full cachest suite via compose.
- [x] Commit: `feat(config): OPENST_CRYPTO_SEARCH + OPENST_CRYPTO_PROFILE routes`.

### 20.4 — openst standalone smoke

- [x] `docker compose up -d redis openst`; single curls:
  `/crypto/search/btc`, `/crypto/search/eth`, `/crypto/profile/BTC-USD` — rows + payload shape
  recorded in the step result.
- [x] Verify Redis cache: second `curl` each → `X-Cache: HIT`.
- [x] Commit note: `chore: verify crypto search + profile smoke`.

  **Observed 2026-09-15 (openst local build, host `:8081` — `8080` held by portfoliost-gateway):**
  - `/crypto/search/btc` → 200, 30 rows, shape `{symbol, name, exchange, ico_date,
    circulating_supply, total_supply}`; eth/ethereum/bitcoin/sol/ada/etc. also 200.
  - `/crypto/search/eth` → **404**. Upstream anomaly: FMP returns a row with `ico_date=NaN` for
    this query, and OpenBB `FMPCryptoSearchData` model validation rejects it → whole search
    errors (→ honest 404). Typing `ETH` won't suggest via raw search; step 20.5's curated
    base→pair map must cover `eth→ETH-USD`.
  - `/crypto/profile/BTC-USD` → 200 `{"symbol":"BTC-USD","name":null,"currency":"USD"}`.
  - Redis cache confirmed: `crypto_search:btc` + `crypto_profile:BTC-USD` keys present, second
    curls served instantly (openst itself emits no `X-Cache` header — that's cachest 20.6).

### 20.5 — instruments: crypto search leg + symbol normalization

- [x] `portfoliost-instruments/src/adapters/cachest.ts`: add `fetchCryptoSearch(query)` →
  `${BASE_URL}/crypto/search/${q}`.
- [x] `portfoliost-instruments/src/adapters/symbol.ts` (or a new `crypto.ts`): normalize an FMP
  row to a yfinance pair + display name. Curated primary map (base coin → pair, ≥ ~30 majors,
  e.g. `btc→BTC-USD`, `eth→ETH-USD`, `sol→SOL-USD`) so typing `BTC`/`ETH` suggests the exact
  pair; fallback heuristic drops FMP-wrap prefixes/`USD` and only emits `<BASE>-USD` when the
  base parses as a bare coin mnemonic (no `tBTC`, `BTC.BUSD`, leveraged/wrapped variants).
- [x] `src/routes/instruments.ts` `/search`: run crypto search alongside the existing tiers
  (not as last-only fallback — equity search "btc" already returns BTCS Inc. etc., so crypto
  must be additive), merge + de-dupe by symbol, type `"CRYPTO"` (source `"CRYPTO"`).
- [x] `src/adapters/translate.ts`: `toSearchResponse`/new `toCryptoSearchResponse` emit
  `type: "CRYPTO"`; widen `toReferenceSearchResponse` `assetType` mapping to emit `BOND`/`CRYPTO`
  when present (D79-ready; ticker_reference still has none).
- [x] Tests: unit tests for normalization (BTC → BTC-USD, wrapped `TBTCUSD` excluded, `BTCBUSD`
  excluded) + route test: q=btc returns a merged list containing `BTC-USD` type CRYPTO.
- [x] Tests: `npm run build` + `npm run test` in portfoliost-instruments.
- [x] Commit: `feat(search): crypto leg + type CRYPTO with yfinance-pair normalization`.

### 20.6 — full compose stack smoke

- [x] In portfoliost compose, rebuild + run `redis openst cachest instruments`.
- [x] Smoke through cachest: `curl "http://localhost:8090/crypto/search/btc"` MISS→HIT;
  instruments `/api/instruments/search?q=btc` (via worked-upstream) contains `BTC-USD`/CRYPTO.
- [x] Run `npm run test:stack` — existing contract checks stay green.
- [x] Commit note: `chore: verify crypto search through full compose stack`.

  **Verification (live, 2026-09-15):** rebuilt `openst cachest instruments` images in portfoliost
  compose (`NODE_AUTH_TOKEN` set); cachest `/crypto/search/btc` → `x-cache: MISS` then `HIT`;
  instruments `/api/instruments/search?q=btc` via gateway → 50 rows with 6 `CRYPTO`, `BTC-USD`
  first (`type=CRYPTO`, `source=CRYPTO`); `q=eth` → `ETH-USD` first despite the upstream FMP NaN
  `ico_date` rejection (curated suggestion). `npm run test:stack` → 32/32, upstream `real`. The
  smoke exposed that the 50-row cap occluded the crypto leg behind the reference DB's "btc" name
  flood — fixed by leading the merge with the curated crypto exact-pair
  (`portfoliost-instruments` `f3b5f5b`).

### 20.7 — closeout

- [x] Update `docs/openst-coverage.md`: crypto **search** row (fmp-only, `/crypto/search/{query}`)
  + note crypto search symbols normalize to yfinance pairs in instruments; keep date current.
- [x] Archive this section to `plan-archive.md` once all steps are `[x]`.

  **Result (2026-09-15):** `openst-coverage.md` gained the crypto **search** row
  (`/crypto/search/{query}` via `crypto.search`, fmp-only) with the instruments
  symbol-normalization note (curated 38-major map + bare-mnemonic fallback + leading
  exact-pair suggestion) and the `ico_date=NaN` upstream anomaly note; coverage date already
  2026-09-15. Open question resolved: search surfaces native pairs flagged `CRYPTO` via the
  curated map, suggestion keeps `BTC-USD`/`ETH-USD` above the 50-row cap. All four repos
  committed; section archived.

---

## 21. D79 follow-up — savings-bond history import + DB-first search (D79 gap-fix)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — D79
gap-fix (2026-09-16). Step 19 shipped the bond chain (`/fixedincome/search|profile|ohlcv`),
but two defects mean historical emission symbols resolve to "no results, 200 OK" instead of a
row — observed for `ROD1033` and `ROD1033.WA`:

1. **Importer is current-only by construction.** `bond_series.py` fetches the eight per-series
   offer pages (or the current-offer page), and obligacjeskarbowe.pl renders **only the
   currently-active emission** per series. `openst.bond_series` therefore accumulates at most
   one emission per series per monthly run; old emissions (e.g. `ROD1033`, sold 01–31.10.2021,
   marża 1,50% + inflacja) never land in the table. The importer docstring claim that
   per-emission detail URLs are "cosmetic" is **wrong for archived emissions** — verified live:
   `/oferta-obligacji/obligacje-12-letnie-rod/rod1033/` renders `ROD1033`'s own historical
   parameters while `/oferta-obligacji/obligacje-12-letnie-rod/rod0938/` renders the current
   05,60%/2,50%-marża emission. The full catalogue is enumerable from `/listy-emisyjne/`
   (one page, 449 emission codes across all 12 series, each an
   `<option value="/listy-emisyjne/?id={symbol},{series}" data-id="{series}">{SYMBOL}</option>`).
2. **The getters ignore the local table.** `search_bonds` + `get_bond_profile` call only the
   live OpenBB `obligacje` provider, which itself knows only current emissions
   (`obb.equity.search("rod1033", provider="obligacje")` → "Results not found"). Even a fully
   backfilled `openst.bond_series` would be invisible until the getters read the DB. OpenBB's
   search/profile record shapes exactly match the `bond_series` columns (symbol, name,
   maturity_date / symbol, name, series_code, issue_date, maturity_date, term_months, rate_rule,
   margin, fee_b, nominal), so DB-first with OpenBB fallback is a clean swap.

Scope (3 repos): **openst** (importer `archive` mode + DB-first getters + fixtures/tests + fix
the wrong docstring), **portfoliost-instruments** (normalize a trailing venue suffix like `.WA`
in the bond search leg so `ROD1033.WA` resolves), **homelab** (one-shot backfill Job reusing the
openst image). cachest and the SPA need **no change** — the bond chain already exists.

Ticket-style fail at v0: `search?q=rod0938` → the issued-2026-09 ROD row; `search?q=rod1033` →
the issued-2021-10 ROD row; `search?q=rod1033.wa` → same row.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass (unit +
docker-compose per openst CLAUDE.md; `npm run build` + `npm run test` in
portfoliost-instruments).

---

### 21.1 — fixture capture: archive page + a historical emission page (manual, no code)

- [x] Capture `obligacjeskarbowe.pl/listy-emisyjne/` (one GET) → `openst/tests/fixtures/obligacjeskarbowe/emission_archive.html`.
- [x] Capture the `rod1033` emission page (one GET) → `openst/tests/fixtures/obligacjeskarbowe/rod1033.html`; append the already-captured current-ROD page (`rod0938` style, exists in fixture set) as the contrast case.
- [x] Inspect the archive fixture: confirm all 449 emission `<option/>` codes + `data-id` series values parse; note the old series absent from `SERIES_SLUGS` (POS, DOS, TOZ, KOS prefixes appear in the archive but are **skipped** — history import covers the 8 modern `SERIES_SLUGS` series only).
- [x] No TESTS for the fixture itself; it exists to make 21.2–21.4 deterministic.
- [x] Commit: `fixtures: obligacjeskarbowe emission archive + rod1033 (historical vs current ROD)`.

### 21.2 — openst: `--mode archive` in `bond_series.py` (backfill all modern-series emissions)

- [x] Add `parse_archive_codes(html) -> list[(series_code, symbol)]`: regex the
      `<option … data-id="{series}">{SYMBOL}</option>` rows from the capture in 21.1.
- [x] Add `--mode archive`: fetch `/listy-emisyjne/`, map `({series_code}, symbol)` →
      `/oferta-obligacji/{SERIES_SLUGS[series.upper()]}/{symbol}/`, fetch + `parse_emission` each
      (reuse existing code path; `upsert_bonds` already idempotent via `ON CONFLICT DO NOTHING`).
      Filter to series present in `SERIES_SLUGS` (skip POS/DOS/TOZ/KOS — no term map, out of scope).
- [x] Fix the module docstring: per-emission detail URLs are **not** cosmetic — archived
      emissions render their own historical parameters; current-only accumulation describes only
      the `incremental`/`full` modes, and `archive` backfills the rest.
- [x] Tests (`openst/tests/test_bond_series_importer.py`): `parse_archive_codes` from the 21.1
      fixture → ≥400 codes incl. `ROD1033`; archive-mode page list built from a stub `fetch_page`
      returns the correct per-series URL for a sampled emission; `ROD1033` parse → symbol, issue
      `2021-10-01`, maturity `2033-10-01`, margin 1.50.
- [x] Tests: full openst suite via `docker compose --profile test run --rm test`.
- [x] Commit: `feat(bond_series): archive mode backfills all modern-series emissions`.

### 21.3 — openst: DB-first `search_bonds` + `get_bond_profile`

- [x] `openbb_client.py`: when `db.database_url()` is set (guard; openst runs DB-less fine),
      query `openst.bond_series` first —
      `search_bonds(query)`: symbol-prefix OR name ILIKE `%{query}%` (query is already
      lowercased by the route), return `[{symbol, name, maturity_date}]` to match the OpenBB
      search rows; `get_bond_profile(symbol)`: exact symbol (upper-cased) → the 10-column row as
      a dict matching the OpenBB profile shape. Fall back to the existing OpenBB call when the
      DB yields nothing (import not yet run / DB-less).
- [x] Tests (`openst/tests/test_openbb_client.py`): when the DB returns rows, OpenBB is **not**
      called; DB empty → OpenBB fallback called; `search_bonds` maps columns to the search shape;
      no-DB env (monkeypatch `database_url` → `None`) → pure OpenBB path unchanged.
- [x] Tests: full openst suite via compose.
- [x] Commit: `feat(openbb_client): DB-first bond search + profile with OpenBB fallback`.

### 21.4 — openst standalone smoke (backfill + DB-first live)

- [x] In the **openst** standalone compose (`openst/docker-compose.yml`): `docker compose up -d redis openst`,
      run `python -m src.importers.bond_series --mode archive` against the local Postgres
      (dev db from step 19.2; ~8 modern series × ~12 past monthly emissions ≈ 100 rows), and
      verify `openst.bond_series` count jumped from 8 → expected backfill total.
- [x] `curl /fixedincome/search/rod1033` → 200, row `ROD1033`/`Obligacje 12-letnie ROD`, and
      `/fixedincome/search/rod0938` still 200; `curl /fixedincome/profile/ROD1033` → 200 with the
      10-column shape (marża 1.50). Record payloads in the step result.
- [x] Verify Redis: second `curl` each → `X-Cache: HIT` (openst emits its own cache header in
      standalone, per step 20.4 precedent).
- [x] Commit note: `chore: verify bond archive backfill + DB-first search smoke`.

  **Result (2026-09-16):** `docker compose up -d --build` (app service gained `DATABASE_URL` +
  postgres dep) → `--mode full` 8 rows → `--mode archive` 449 fetched / 449 parsed / 441 inserted
  (8 current skipped by `ON CONFLICT`) → **total 449 rows**. The smoke **caught a real bug** in the
  21.2 archive URL construction: the site ships URL typos for 4 archived EDO codes
  (`id=edo07829` renders `EDO0829`, likewise `edo01028/edo01128/edo01228`), so
  `{display symbol lowercased}` paths 404'd. Fixed by having `parse_archive_codes` return
  `(series_code, symbol, url_id)` triples (symbol stays display text, stored correctly) and
  fetching each emission at its raw `url_id`. Curls: `/fixedincome/search/rod1033` → 200
  `[{"symbol":"ROD1033","name":"Obligacje 12-letnie ROD","maturity_date":"2033-10-01"}]`;
  `/fixedincome/search/rod0938` → 200 (current ROD0938, `2038-09-01`); `/fixedincome/profile/ROD1033`
  → 200 10-column shape (`issue_date 2021-10-01`, `margin 1.5000`, `rate_rule cpi_12m+margin`);
  `/fixedincome/profile/EDO0829` → 200 (2019-08-01/2029-08-01, the typo'd emission now resolvable).
  Redis caching verified via the `_cache` (response `X-Cache` header is emitted by cachest, not
  openst — no such header in openst today). suite: 231 passed (incl. the updated url_id tests).

### 21.5 — instruments: venue-suffix normalization in the bond search leg

- [x] `portfoliost-instruments/src/routes/instruments.ts` `bondSearchLeg(q)`: strip a trailing
      venue suffix (`.WA`, `.US`, … — reuse/extend the existing `providerSymbol`-style logic)
      from `q` before calling `fetchBondSearch`, so `ROD1033.WA` resolves the same row as
      `ROD1033`. Do **not** strip elsewhere in the bond chain.
- [x] Tests (`portfoliost-instruments/src/routes/instruments.test.ts`): `q=rod1033.wa` →
      `fetchBondSearch` called with `rod1033`; `q=rod1033` unchanged; existing bond/equity search
      tests still green.
- [x] Tests: `npm run build` + `npm run test` in portfoliost-instruments.
- [x] Commit: `feat(search): normalize venue suffix in bond search leg (ROD1033.WA)`.

  **Result (2026-09-16):** added `venueFreeSymbol()` to `src/adapters/symbol.ts` (cuts any trailing
  `.suffix`; mirrored after crypto.ts's existing `venueFree` concept, unlike `providerSymbol` it
  drops every venue) and applied it in `bondSearchLeg` only — the rest of the bond chain is
  untouched. Route tests assert `q=rod1033.wa` → `fetchBondSearch("rod1033")` + row surfaces and
  `q=rod1033` passed through unchanged; helper tests cover `.WA`/`.US`/bare/name queries. Commit
  `d7fec26`, build clean, suite 217 passed / 16 files.

### 21.6 — full compose stack smoke

- [x] In portfoliost compose: rebuild + run `redis openst cachest instruments`; re-run the
      `archive` backfill inside the compose DB (openst shares the portfoliost Postgres).
- [x] Through cachest: `curl "http://localhost:8090/fixedincome/search/rod1033"` MISS→HIT.
- [x] Through the gateway: `/api/instruments/search?q=rod1033` → 200 with a `BOND`/`OBLIGACJE`
      result (`ROD1033`); `/api/instruments/search?q=rod1033.wa` → same row; `/api/instruments/ROD1033`
      → 200. Record payloads in the step result.
- [x] Run `npm run test:stack` (instruments-stack-test.mjs) — 32/32 stays green.
- [x] Commit note: `chore: verify bond history search through full compose stack`.

  **Result (2026-09-16):** rebuilt `openst` + `instruments` in the compose stack (cachest image
  unchanged — D79 passthrough already present), then `docker compose exec openst python -m
  src.importers.bond_series --mode archive` against the shared Postgres: fetched 449 / parsed 449 /
  inserted 441 → **449 rows**. cachest `http://localhost:8090/fixedincome/search/rod1033` →
  `200 x-cache: MISS` then `200 x-cache: HIT`, payload
  `[{"symbol":"ROD1033","name":"Obligacje 12-letnie ROD","maturity_date":"2033-10-01"}]`. Gateway
  `http://localhost:8080/api/instruments/search?q=rod1033` (X-User-Id/Email headers required) →
  `{count:1, results:[{symbol:"ROD1033",name:"Obligacje 12-letnie ROD",type:"BOND",exchange:"PL",
  countryCode:"PL",source:"OBLIGACJE"}]}` — **identical** for `q=rod1033.wa` (21.5 normalization
  live); `/api/instruments/ROD1033` → `{id, symbol:"ROD1033", type:"BOND", exchange:"PL",
  currency:"PLN"}`. `npm run test:stack` 32/32. Note: compose builds of consumers need
  `NODE_AUTH_TOKEN` from `../portfoliost/.env`/shell (npm ci against @marx2 registry) — absent it
  failed "instruments target ... npm ci ... exit code 1".

### 21.7 — homelab: one-shot backfill Job + deploy bumps

- [x] Add a k8s one-shot Job (pattern: existing openst importer Job/CronJob, e.g. the CPI /
      bond_series incremental CronJob) in `homelab/cluster/apps/pfire/openst/` running
      `python -m src.importers.bond_series --mode archive` once (image `ghcr.io/marx2/openst:<new-tag>`).
- [x] After the openst GHA build: bump `cluster/apps/pfire/openst/app/helmrelease.yaml` image
      tag to the new version; portfoliost-instruments image bump likewise (after its GHA build).
- [x] `git pull --rebase && git push`; Flux picks both up (no cluster access — commit for flux).
- [x] Commit: `chore(openst): bond_series archive backfill Job + image bumps (D79 gap-fix)`.

  **Result (2026-09-16):** pushed openst (4 D79 commits, GHA → **v1.1.22**) and
  portfoliost-instruments (21.5 commit → **v1.0.43**). Homelab (`Marx2/homelab`, Flux
  kustomization `openst`): new one-shot Job `openst-bond-archive`
  (`cluster/apps/pfire/openst/app/bond-archive-job.yaml`, regcred + `postgres-pfire-pguser-openst`
  uri, `ttlSecondsAfterFinished: 3600`, image `ghcr.io/marx2/openst:v1.1.22`; added to
  `kustomization.yaml`), openst helmrelease tag `v1.1.21 → v1.1.22` (app + cpi-import),
  instruments helmrelease tag `v1.0.42 → v1.0.43`. Pushed homelab main `dad81ba4c` → Flux reconciled
  (`openst` kustomization Applied `main@sha1:dad81ba4c…`). Job **ran and completed**: fetched 449 /
  emissions 449 / **inserted 449**; cluster `openst.bond_series` now 449 rows; `ROD1033` margin
  1.50. openst deploy rolled out clean.

### 21.8 — closeout

- [x] Update `docs/openst-coverage.md`: bond history — note `bond_series` now backfills past
      emissions via `--mode archive` + DB-first search/profile getters; keep date current.
- [x] Add a short "gap-fix 2026-09-16" note to `docs/proposals/instruments-provider-module.md`
      under the D79 marker (history import + DB-first getters; `ROD1033`/`.WA` resolution).
- [x] Archive this section to `plan-archive.md` once all steps are `[x]`.

  **Result (2026-09-16):** `search?q=rod1033` and `search?q=rod1033.wa` resolve the 2021-10 ROD
  emission through the existing bond chain (profile fallback + equity-404 tolerance from the
  earlier 404 gap-fix). All three repos committed; section archived.

---

## 22. Recurrent bond import — daily incremental + monthly archive (D79 follow-up)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — the same
D79 gap-fix, made self-maintaining.

Section 21 imports bond history once (one-shot `archive` Job) but nothing recurs: as of 2026-09
the openst app in homelab scheduled only the CPI importer (`cpi-import` CronJob in
`openst/app/helmrelease.yaml`), and the closed system prompt to add forward auto-discovery is the
caveat from 21.2 — the importer enumerates from the live site, never guesses names, so scheduled
runs self-discover new emissions. New savings-bond emissions go on sale on the 1st of the month
for a full calendar month, so a **daily `--mode incremental` CronJob** reliably catches each new
emission during its sale window; a **monthly `--mode archive` CronJob** re-enumerates the full
catalogue (~449 pages, ~4–6 min) as a self-healing backstop for anything incremental missed (e.g.
a full-window outage). Both run on the `ghcr.io/marx2/openst:<tag>` image built by GHA after 21.2
and use the same DATABASE_URL secret pattern as `cpi-import`.

Scope: **homelab only** (openst `helmrelease.yaml` + verification); openst code and tests come
from 21.2–21.3. config-only step — no new unit tests, verified by `kubectl kustomize` build of
the app dir plus the existing openst compose suite.

Rules: one step = one commit; a step is marked `[x]` only after its verification passes
(`kubectl kustomize` build + cluster logs; no new unit tests — importers already covered by
21.2/21.3).

---

### 22.0 - logging

- [x] Job should emit some logs to verify what it's doing in a runtime. Like a discovered emission,
  or succesfully imported emission. This is to verify that the CronJob is actually running and doing
  something.

  **Result (2026-09-16):** openst `feat(bond_series): log discovered/imported emissions per run`
  (`51f7fc3`, GHA → **v1.1.23**). `bond_series` now logs one INFO line per enumerated page, per
  emission parsed (`parsed ROD0938 series=ROD issue=2026-09-01 cpi_12m+margin margin=2.50 fee=3.00`)
  and per symbol inserted (`inserted ROD0938 (…)`; duplicates only at DEBUG), a `done` line with
  fetched/parsed/inserted + elapsed seconds, and keeps the summary JSON as the last stdout line.
  `configure_logging()` is called only by the importer entry point, so the API process keeps its own
  config. Tests: 5 new (log-per-emission, archive enumeration
  count, warning on a page without an emission, stdout routing, PG insert/skip logging) — openst compose suite **236 passed**; live
  against the compose DB `inserted=8`, re-run `inserted=0` with no false "inserted" line.

### 22.1 — homelab: bond-import daily incremental + bond-archive monthly CronJobs

- [x] In `homelab/cluster/apps/pfire/openst/app/helmrelease.yaml` add two controllers mirroring the
      existing `cpi-import` CronJob (app-template v5.1.0, image `ghcr.io/marx2/openst:<tag>`,
      `DATABASE_URL` from `postgres-pfire-pguser-openst` secret, `TZ`/`PYTHONUNBUFFERED` env):
      - `bond-import` — `type: cronjob`, `schedule: "30 4 * * *"` (daily 04:30 UTC),
        `concurrencyPolicy: Forbid`, command `python -m src.importers.bond_series --mode incremental`.
      - `bond-archive` — `type: cronjob`, `schedule: "0 6 3 * *"` (3rd of month 06:00 UTC, after the
        1st-of-month sale start is published), `concurrencyPolicy: Forbid`,
        command `python -m src.importers.bond_series --mode archive`. Idempotent
        (`ON CONFLICT DO NOTHING`), so a missed/unlucky run self-heals next month.
- [x] Verify locally: `kubectl kustomize cluster/apps/pfire/openst/app` renders both CronJobs with
      the new image tag; `git pull --rebase && git push`; Flux picks both up (cluster access was
      available this time, so the rollout was read back with `kubectl` rather than deferred).
- [x] Tests: none new — config-only; the `incremental` and `archive` code paths pass their openst
      compose suite in 21.2/21.3.
- [x] Commit: `chore(openst): recurring bond_series CronJobs (daily incremental + monthly archive)`.

  **Result (2026-09-16):** homelab `6d7fb480d`. Both CronJobs are app-template controllers in
  `openst/app/helmrelease.yaml` on **v1.1.23** (app + cpi-import bumped too). Beyond the two new
  jobs, the two raw one-shot Job manifests (`bond-archive-job.yaml`, `cpi-seed-job.yaml`) are gone:
  kustomize re-applies its resources on every 30m sync, so a TTL self-deleted Job came back and
  re-ran — the 21.7 archive backfill was scraping all 449 pages on every Flux sync. Everything
  openst now runs as a HelmRelease controller, and CronJob pod templates are mutable, so tag bumps
  cannot wedge the release the way a completed Job would. The CPI full-history seed survives as the
  suspended `cpi-seed` CronJob (`kubectl -n pfire create job x --from=cronjob/openst-cpi-seed`).
  Verified locally with `kubectl kustomize` + `helm template` against the pulled app-template 5.1.0
  chart: renders `openst-bond-import` (`30 4 * * *`), `openst-bond-archive` (`0 6 3 * *`),
  `openst-cpi-import`, `openst-cpi-seed` (`suspend=True`), all `concurrencyPolicy: Forbid`,
  `ghcr.io/marx2/openst:v1.1.23`.

### 22.2 — cluster verification of the recurrence

- [x] After the next monthly emission change: confirm a `bond-import` run upserted the new emission
      (`kubectl logs -n pfire -l job-name=bond-import-* --tail=50`, summary JSON shows the new
      symbol) and a `bond-archive` run converges the catalogue (row count stable across consecutive
      runs, equal to the full modern-series set of 449 codes from the 21.1 fixture).
- [x] Record the observed `symbols` payloads in the step result; confirm `X-Cache: HIT` flow through
      cachest is untouched (no cachest change).
- [x] Tests: verification only — no code changes; existing openst/cachest/instruments suites stay
      green as-is.
- [x] Commit note: `chore: verify bond recurring import CronJobs (D79 gap-fix)`.

  **Result (2026-09-16):** Flux reconciled (HelmRelease `pfire/openst.v45`, kustomization
  `main@sha1:f7d1fe43…`); four CronJobs live, the two stale raw Jobs pruned, app rolled to v1.1.23.
  No real month-turn emission was available, so the discovery path was proven by deleting the
  current ROD emission (`ROD0938`, on sale 01–30.09) → 448 rows → `kubectl create job
  bond-import-verify-22 --from=cronjob/openst-bond-import`:
  `inserted ROD0938 (issue 2026-09-01, cpi_12m+margin margin 2.50)` /
  `done mode=incremental fetched=8 parsed=8 inserted=1 in 14.4s` /
  `{"mode":"incremental","fetched":8,"emissions":8,"symbols":["COI0930","DOR0928","EDO0936","OTS1226","ROD0938","ROR0927","ROS0932","TOS0929"],"inserted":1}`
  — the restored row is field-for-field identical to the snapshot taken before the delete.
  `--from=cronjob/openst-bond-archive`: `done mode=archive fetched=449 parsed=449 inserted=0 in
  689.2s` (449 symbols, first eight the current emissions, tail `EDO1026`, `ROD1028`, `EDO0926`,
  `EDO0826`), `openst.bond_series` **449 rows before and after** (min issue 2016-08-01, max
  2026-09-01) — equal to the 21.1 fixture. cachest untouched: `/fixedincome/search/rod0938` →
  `200 x-cache: MISS` then `200 x-cache: HIT`, payload
  `[{"symbol":"ROD0938","name":"Obligacje 12-letnie ROD","maturity_date":"2038-09-01"}]`.
  Suites: openst compose 236 passed, cachest compose 78 passed, instruments `vitest run`
  221 passed (16 files). Verify Jobs deleted afterwards.

### 22.3 — closeout

- [x] Note both CronJobs and their schedules in `docs/openst-coverage.md` under the bond-history
      entry from 21.8 (recurrence: daily incremental + monthly archive self-heal).
- [x] Archive this section to `plan-archive.md` once all steps are `[x]`.

  **Result (2026-09-16):** `bond_series` is self-maintaining — daily incremental discovers each
  month's new emission on sale, monthly archive re-enumerates the full catalogue; no manual or
  name-guessing step required.

---

## 23. Wallets import API

Proposal: [wallets-import-api.md](proposals/wallets-import-api.md) — batch write surface
in `portfoliost-wallets` for external importers. Provides idempotent transaction
submission, wallet bootstrapping, sync-run tracking, deferred portfolio recompute, full
wipe for clean re-imports, and split preservation with retroactive adjustment.
First consumer: `portfoliost-sheets-sync` (§24). Future consumers: CSV broker exports,
bank feeds, etc.

Repos touched: `portfoliost-contracts`, `portfoliost-wallets`, `portfoliost-admin`,
`portfoliost` (mock handlers).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 23.1 — `@marx2/contracts` bump: import API + internal apply-split contract

Contract-first (MODULARISATION.md): every module builds against
`@marx2/contracts` and annotates responses with `satisfies`, so the new
`/api/import/*` + `/internal/apply-split` surfaces must be defined here before
any route work (23.3+).

- [x] In `portfoliost-contracts/contracts/openapi.yaml` add schemas per the
      proposal shapes:
      - `ImportWalletBootstrapRequest` (`externalSource` + `wallets:
        [{name, currency, baseCurrency}]`), `ImportWalletBootstrapResponse`
        (`wallets: [{id, name, currency, baseCurrency, created}]`),
        `ImportPortfolioBootstrapRequest` / `Response`
        (`{id, name, currency, baseCurrency, created}`).
      - `ImportTransactionsRequest` (`source: {externalSource, spreadsheetId,
        sheet}` + `transactions[]`: `externalId`, `walletName`, `executedAt`,
        `walletTx: ImportWalletTx`, `portfolioTx: ImportPortfolioTx` optional),
        `ImportWalletTx` (fields of `wallet_transactions`, incl. `ADJUSTMENT`),
        `ImportPortfolioTx` (`Transaction` fields + optional
        `originalQuantity`, `originalPrice`), `ImportTransactionsResponse`
        (`{inserted, skipped, errors, syncRun}`).
      - `SyncRun`, `SyncRunsResponse` (`{items, total}`),
        `SourceWipeResponse` (`deleted: {walletTransactions, portfolios,
        wallets, syncRuns}`), `ApplySplitRequest` (`{symbol, factor,
        effectiveDate}`), `ApplySplitResponse` (`{updatedTransactions,
        affectedPortfolios}`).
      - Extend the existing portfolio `Transaction` schema with optional
        `externalSource`, `externalId`, `originalQuantity`, `originalPrice`;
        extend `CashTransaction` with optional `externalSource`, `externalId`.
        (`CashTransaction.type`/`Transaction.type` are free strings — no enum
        change needed for `ADJUSTMENT`.)
- [x] Add paths (tag `Wallets`): `POST /import/wallets/bootstrap`,
      `POST /import/portfolios/bootstrap`, `POST /import/transactions`,
      `GET /import/sync-runs`, `DELETE /import/sync-runs/{id}`,
      `DELETE /import/source/{externalSource}`; plus `POST /internal/apply-split`
      (no auth). Wire request/response `$ref`s incl. `404`/`422` error shapes
      per proposal. (Added new `Internal` tag.)
- [x] `npm run lint` (yaml parses), commit, push → CI auto-bumped and published
      `@marx2/contracts` `v1.6.21` (tag + GitHub Packages). No manual
      `package.json` bump needed — `release-contracts.yml` computes it from tags.
- [x] `portfoliost-wallets`: `npm install` (v1.6.21) + `npm run gen:types`; new
      paths/schemas verified in `src/generated/api-types.d.ts`.
- [x] `npm run build` (tsc clean) + `npm run test` pass unchanged (265/265).
- [x] Commit (contracts, `8b38246`): `feat(contracts): import API + internal
      apply-split contract`; commit (wallets, `c164517`): `chore: regenerate
      API types from @marx2/contracts v1.6.21`.

### 23.2 — DB migration: provenance + sync_runs + source tags + split columns

- [x] In `portfoliost-wallets` add Drizzle migration:
      - `wallets.wallets`: add `external_source text` (NULL = manual).
      - `portfolios.portfolios`: add `external_source text` (NULL = manual).
      - `wallets.wallet_transactions`: add `external_source text`, `external_id text`;
        partial unique index `uq_wtx_external ON (external_source, external_id) WHERE
        external_id IS NOT NULL`.
      - `portfolios.transactions`: add `external_source text`, `external_id text` +
        partial unique index `uq_ptx_external`; add `original_quantity numeric(20,8)`
        and `original_price numeric(20,8)` (both nullable; frozen at creation).
      - New table `wallets.sync_runs` per proposal schema.
      - Relax `ck_wtx_amount_nonzero` to `amount <> 0 OR type = 'ADJUSTMENT'`.
- [x] PGlite migration test: all objects exist; partial unique index rejects duplicate
      `external_id`; allows NULL duplicates (manual rows); `original_quantity` /
      `original_price` are independent of `quantity` / `price` (no constraint).
- [x] `npm run test` passes.
- [x] Commit: `feat(wallets): import API migration — provenance + split columns`.

### 23.3 — `POST /api/import/wallets/bootstrap` + `POST /api/import/portfolios/bootstrap`

- [x] New route file `src/routes/import.ts`; mount at `/api/import` in `server.ts`.
- [x] `POST /api/import/wallets/bootstrap`: accept `{ externalSource, wallets:
      [{name, currency, baseCurrency}] }`; upsert each on `(userId, name)` (`ON
      CONFLICT DO NOTHING`, re-select); set `external_source` on INSERT only; return
      array with `id` + `created` flag. Annotate responses with
      `satisfies ImportWalletBootstrapResponse`.
- [x] `POST /api/import/portfolios/bootstrap`: accept `{ externalSource, name,
      currency, baseCurrency }`; upsert on `(userId, name)`; set `external_source`
      on INSERT only; return `{ id, name, created }`.
- [x] Unit tests (PGlite): first call creates + tags (`created=true`); second call
      returns same id, does not re-tag (`created=false`); unknown fields → 422.
- [x] Prerequisite (no unique `(user_id, name)` existed): drizzle `0002` adds
      `uq_wallets_user_name` + `uq_portfolios_user_name`; prod verified free of
      duplicate names; manual create routes now return 409 on duplicate name.
      Migration chain audited against `database-schema-migrations.md` (pure DDL,
      own module only, breakpoint-separated — compliant).
- [x] `npm run test` passes (271/271).
- [x] Commit: `feat(wallets): POST /api/import/wallets/bootstrap + portfolios/bootstrap`.

### 23.4 — `POST /api/import/transactions`

- [x] `POST /api/import/transactions`: accept `source` + `transactions[]` (≤ 500);
      per-row: resolve `walletName` → `walletId`; INSERT `wallet_transactions` with
      `ON CONFLICT (external_source, external_id) DO NOTHING`; when `portfolioTx`
      present INSERT `portfolios.transactions` with `original_quantity` and
      `original_price` from the payload (importer supplies pre-restatement values);
      upsert position (BUY: weighted avg cost; SELL: reduce qty + store
      `realizedGainLoss`; DIVIDEND: no qty change); collect row-level errors without
      aborting batch.
      After all rows: recalculate wallet balances as `SUM(amount)` for each affected
      wallet; call `recomputePortfolioTotals` once per distinct `portfolioId`;
      upsert `sync_runs` row.
- [x] Existing interactive routes (`POST /api/portfolios/:id/transactions`,
      `POST /api/portfolios/:id/positions`): set `original_quantity = quantity` and
      `original_price = price` at INSERT time (server-side copy; caller never supplies
      these fields).
- [x] Unit tests (PGlite):
      - BUY + SELL sequence: correct qty, avg cost, realizedGainLoss.
      - Import BUY with `originalQuantity ≠ quantity`: both stored independently;
        `quantity`/`price` are the restated values used in calculations.
      - Manual BUY (interactive route): `original_quantity = quantity` auto-set.
      - Idempotency: second call with same `externalId` array → `inserted=0, skipped=N`.
      - Unknown `walletName` → `errors[]`, rest of batch succeeds.
      - DEPOSIT (no `portfolioTx`): wallet row only, no position.
      - Wallet balance after batch equals `SUM(amount)`.
      - `sync_runs` upserted with correct counts.
- [x] `npm run test` passes.
- [x] Commit: `feat(wallets): POST /api/import/transactions — batch import + original values`.

### 23.5 — `GET /api/import/sync-runs`, `DELETE /api/import/sync-runs/:id`, `DELETE /api/import/source/:externalSource`

- [x] `GET /api/import/sync-runs`: list runs for authenticated user; filter by
      `externalSource`; paginate with `limit`/`offset`.
- [x] `DELETE /api/import/sync-runs/:id`: delete run record only; 404 if not owned.
- [x] `DELETE /api/import/source/:externalSource`: wipe all data tagged with this
      source for the authenticated user, in a single DB transaction:
      1. DELETE `wallet_transactions` WHERE `external_source = $s AND user_id = $u`.
      2. DELETE `portfolios.portfolios` WHERE `external_source = $s AND user_id = $u`
         (cascades to positions, portfolio transactions, shares, snapshots).
      3. DELETE `wallets.wallets` WHERE `external_source = $s AND user_id = $u`.
      4. DELETE `sync_runs` WHERE `external_source = $s AND user_id = $u`.
      Returns `{ deleted: { walletTransactions, portfolios, wallets, syncRuns } }`.
      Manually-created rows (`external_source IS NULL`) are never touched.
- [x] Unit tests: wipe removes only tagged rows; manual wallet/portfolio survive;
      wipe on empty source returns zero counts (not 404).
- [x] `npm run test` passes.
- [x] Commit: `feat(wallets): sync-run list/delete + source wipe endpoint`.

### 23.6 — `POST /internal/apply-split` (wallets)

- [x] New internal endpoint `src/routes/internal.ts`, mounted at `/internal` (no JWT —
      internal network only, not exposed through nginx gateway):
      `POST /internal/apply-split` — body `{ symbol, factor, effectiveDate }`.
      `factor` is the **quantity multiplier** (2 for a 2:1 split).
- [x] Handler (single DB transaction):
      1. Fetch all `portfolios.transactions` rows where `instrument_symbol = $symbol`
         AND `executed_at < $effectiveDate` AND `original_quantity IS NOT NULL`
         (rows with originals — both imported and manual, since manual rows get
         `original_quantity = quantity` at creation; the import route now defaults
         originals to the restated values when omitted, same invariant).
      2. Durable split ledger `portfolios.split_events` (new table, migration
         0003; `factor` = quantity multiplier, unique per `(symbol, effective_date)`).
         **Deviation from the original wording:** `instruments.split_adjustments`
         was rejected as the source — it holds *price* multipliers (inverted
         semantics for quantity restatement) and is transient (the stooq import
         hook deletes rows for covered symbols), so re-running apply-split after
         a price-data import would silently regress restated quantities. The
         ledger is idempotent by construction; the admin hook (§23.7) inverts
         the price factor (`quantityFactor = 1 / priceFactor`) before calling.
      3. UPDATE `quantity = original_quantity × cumulative_factor`,
               `price    = original_price    / cumulative_factor`, where
               cumulative_factor = product of ledger factors with
               `effective_date` after the row's `executed_at`.
               `original_quantity` and `original_price` are never written.
      4. Recompute affected positions from the transaction ledger (moving
         average), including null-`position_id` SELL rows resolved by symbol
         fallback; adjust `current_price`/`market_value`/`unrealized_gain_loss`
         by the cumulative factor.
      5. Call `recomputePortfolioTotals` for all affected portfolios.
      Returns `{ updatedTransactions: N, affectedPortfolios: M }`.
- [x] Idempotency: re-running with the same `(symbol, effectiveDate)` produces the
      same result because `original_quantity` is frozen (test: call twice, assert
      `quantity` identical after second call; also older-event retry after a newer
      event, and conflicting-factor first-write-wins).
- [x] Cumulative splits: two splits on same symbol applied in order; final `quantity =
      original_quantity × factor1 × factor2` (test: 2× then 3× fixture → 6×, plus
      trade-between-splits restated only by later splits, on/after-date rows untouched,
      cross-user scope, position price/market-value adjustment, 422 validation).
- [x] `npm run test` passes (295 tests).
- [x] Commit: `feat(wallets): POST /internal/apply-split`.

### 23.7 — Admin split apply hook

- [x] In `portfoliost-admin/src/market-data.ts`, after the existing
      `split_adjustments` INSERT in the `/apply` handler:
      fire `fetch(`${API_WALLETS_URL}/internal/apply-split`, { method: "POST", body:
      JSON.stringify({ symbol, factor: 1 / priceFactor, effectiveDate: today }) })`
      (wallets expects the **quantity** multiplier; the admin split_adjustments
      row stores the price multiplier — invert it).
      On fetch failure: log error + return `{ ok: true, splitApplied: true,
      portfolioAdjustmentFailed: true, error: "..." }` (price bars are corrected;
      portfolio adjustment can be retried by re-calling apply from the admin panel).
- [x] `portfoliost-admin` vitest: mock wallets fetch; assert it is called with correct
      body after successful `split_adjustments` insert.
- [x] `npm run test` passes (admin suite).
- [x] Commit: `feat(admin): fire apply-split hook on split candidate apply`.

### 23.8 — Mock handlers + full suite

- [x] In `portfoliost/mocks/`: add handlers for all seven import/internal routes:
      `POST /api/import/wallets/bootstrap`, `POST /api/import/portfolios/bootstrap`,
      `POST /api/import/transactions`, `GET /api/import/sync-runs`,
      `DELETE /api/import/sync-runs/:id`, `DELETE /api/import/source/:externalSource`,
      `POST /internal/apply-split` → `{ updatedTransactions: 0, affectedPortfolios: 0 }`.
- [x] `npm run build` + `npm run test` + `npm run test:mock` + `npm run test:e2e` pass
      (re-verified 2026-09-17 vs the full compose stack: build clean, vitest 272,
      mock 186, e2e 68 passed / 1 skipped; the two failures are pre-existing and
      unrelated to §23 — (1) `auth.spec.ts` "login page hides the user/password
      form" conflicts with the `login()` helper in ~15 other specs that require the
      form and with the compose default `PASSWORD_LOGIN_ENABLED=true` (spec dates to
      2026-08-31); (2) `price-bars.spec.ts` expects the pricebars-sim AAPL close
      57.625 (230.5 × 0.25) but the live openst provider backfilled real AAPL closes
      into `instruments.price_bars`, shadowing the sim in `price_bars_all` — passes
      3/3 with openst stopped + openst rows deleted (spec dates to 2026-09-03; its
      "provider unavailable for mock symbols" premise breaks when openst has network
      access)).
- [x] Commit: `feat(mocks): import API + apply-split mock handlers`.

### 23.9 — Closeout

- [x] Update `wallets-import-api.md` status to **implemented** with date; resolve the
      three open questions; note `original_quantity`/`original_price` invariant and
      apply-split idempotency verified.
- [x] Archive to `plan-archive.md`.
- [x] Commit: `chore: wallets import API closeout`.

---

## 24. Google Sheets sync — Transakcje import (wallets + portfolio)

Proposal: [google-sheets-sync.md](proposals/google-sheets-sync.md) — sync the `Transakcje`
sheet of spreadsheet `1iDzR0OTHvqPbjjRSnAI4SdoD7sZOGy8uT9991sPFFps` into
`wallets.wallet_transactions` and `portfolios.transactions` / `positions` via a Kubernetes
Job triggered from the portfoliost-admin panel (jobshot). 2 024 data rows; 7 transaction
types; columns A–AM (39 total).

**Proposal corrections from live sheet inspection (2026-09-17):**

- Col 27 `Zysk/strata z opcji`, col 28 `Skumulowany zysk z opcji (PLN)` — skip.
- **Col 29 `Konto`** — account name per row; maps directly to wallet. Distinct values:
  `IB` (965), `IKE Beata` (396), `IKE Marek` (261), `Equate+` (173), `NN TFI PPK`
  (93), `NN TFI PPO` (81), `Rach. rejestrowy PKO BP` (26), `XTB` (22), `Crypto` (5),
  `Obligacje PKO SA Beata` (2). Zero empty rows — "no account column" was wrong.
- **Col 30** `Cena transakcyjna jednostki (w walucie)` — native-currency unit price;
  used as `price`. Cols 31–33: fee currency details.
- **Col 34 `Symbol`**, col 35 `Giełda`** — canonical ticker + exchange; primary
  instrument key for stocks, ETFs, bonds, Beta ETF FIZ.
- Bonds (`ROD`, `EDO`, `BST`, …): `Symbol` col populated → resolve directly via
  `ticker_reference`; no exclusion needed.
- Crypto (`BTC`, `ETH`): `Konto=Crypto`, no `Symbol` → resolve by `Aktywo` via seed.
- Funds (NN TFI, Goldman): no `Symbol` → resolve by `Aktywo` name-fold via seed.

**Imported columns:** 1–8, 12, 17, 19–21, 29–35. Skipped: 9–11, 13–16, 18, 22–28, 36–39.

**Architecture**: `portfoliost-sheets-sync` is a standalone Job repo
(`Marx2/portfoliost-sheets-sync`). It calls the `portfoliost-wallets` import API (§23)
over HTTP — **no direct DB access**. Auth (decided 2026-09-18): the sync is triggered
manually from the admin panel; the caller's Pocket-ID JWT (admin API is JWT-gated) is
passed through by the admin backend to the K8s Job as `WALLETS_API_TOKEN` — no static
service token, no CronJob.
The importer is responsible only for fetching + parsing + mapping; all DB writes and
position/balance logic go through `/api/import/transactions`.

**Dependency**: §23 (import API) must be complete before 24.3.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 24.1 — `ticker_reference` seed additions (instruments repo)

- [x] In `portfoliost-instruments`, add to the tickerref seed CSV:
      - **Crypto**: `BTC` → `BTC-USD` (`asset_type=crypto`), `ETH` → `ETH-USD`
        (`asset_type=crypto`).
      - **NN/Goldman funds** (no `Symbol` in sheet): `NN Emerytura 2030` →
        `NNEP30.TFI`, `NN Emerytura 2025` → `NNEP25.TFI`, `Goldman Sachs Emerytura
        2065` → `GSEM65.TFI`, `Goldman Sachs Emerytura 2060` → `GSEM60.TFI`,
        `Goldman Sachs Akcji` → `GSAK.TFI`, `NN Obligacji` → `NNOB.TFI`;
        all `asset_type=fund`.
      - **Beta ETF FIZ**: confirm `ETFBM40TR`, `ETFBTBSP`, `ETFBTCPL.WA`, `ETFBW20TR`
        exist in reference or add with `asset_type=fund`, exchange `WSE`.
      - **Noisy-name aliases**: `Text S.A.` / `Text` → `TXT` WSE; confirm abbreviated
        names audited in the proposal have aliases.
- [x] Re-run `tickerref-sync.ts`; verify row counts.
- [x] `npm run test` passes.
- [x] Commit: `feat(instruments): ticker_reference seed — crypto + fund aliases`.

### 24.2 — Scaffold `portfoliost-sheets-sync` repo

- [x] Create `Marx2/portfoliost-sheets-sync` (private) on GitHub.
- [x] Scaffold: `package.json`, `tsconfig.json`, `vitest.config.ts` — copy from
      `portfoliost-wallets`; strip Hono/Drizzle/server deps. Keep: `vitest`, `tsx`,
      `typescript`. No direct DB access — all writes go through the wallets API.
- [x] `Dockerfile`: `node:22-alpine`, `npm ci`, `tsc`, entrypoint `node dist/sync.js`.
      No healthcheck port, no server.
- [x] Env vars: `WALLETS_API_URL`, `WALLETS_API_TOKEN` (caller JWT, injected per run),
      `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
      `INSTRUMENTS_DATABASE_URL` (read-only, `ticker_reference` lookup only).
- [x] GHA: build + test on push; publish `ghcr.io/marx2/portfoliost-sheets-sync` on tags.
- [x] `npm run build` + `npm run test` (empty suite) pass.
- [x] Commit: `chore: scaffold portfoliost-sheets-sync repo`.

### 24.3 — Google Sheets REST client + token refresh

- [x] `src/sheets-client.ts`: `fetchSheet(spreadsheetId, range, accessToken):
      Promise<string[][]>` — plain `fetch` against Sheets REST API v4; no SDK.
      Always `valueRenderOption=FORMATTED_VALUE` (parser is built for the PL
      display format); empty range → `[]`.
- [x] `refreshToken(clientId, clientSecret, refreshToken): Promise<string>` — POST to
      `https://oauth2.googleapis.com/token`; called once at Job startup.
- [x] Unit tests: mocked `fetch`; URL, auth header, empty-range, token refresh.
- [x] Commit: `feat(sheets-sync): Sheets REST client + OAuth2 token refresh`.

### 24.4 — Row parser: column mapping, PL decimal, split restatement

- [x] `src/transakcje-parser.ts`:
      - `parsePlDecimal(raw: string): number | null` — strips NBSP/space/` zł`,
        `,`→`.`, null for `-`/empty.
      - `parseRow(cols: string[]): RawTransakcjeRow` — maps cols 1–8, 12, 17, 19–21,
        29–35; `externalId` = SHA256 of `date|typ|aktywo|quantity|currency|kursPln`.
      - `restateSplits(rows: RawTransakcjeRow[]): RawTransakcjeRow[]` — per asset:
        `quantity *= F`, `priceNative /= F`, `pricePln /= F` for rows before split
        date; validate against col 11; throw `SplitMismatchError` on mismatch.
        Known splits: Amazon ×20 (2022-06-06), Alphabet ×20 (2022-07-15), Dino ×10
        (2025-07-30).
- [x] Unit tests: decimal edge cases; BUY/DIV/SELL/DEPOSIT rows; Amazon split fixture.
- [x] `npm run test` passes.
- [x] Commit: `feat(sheets-sync): Transakcje row parser + split restatement`.

### 24.5 — Instrument resolver + Konto map

- [x] `src/instrument-resolver.ts`: `resolveInstrument(row, instrumentsDb)`:
      symbol-primary (`ticker_reference` by `ticker` + `exchange`; with exchange
      → venue-strict, without → ticker must be unique across venues); aktywo-fallback
      (name-fold against `name`/`aliases`; Polish ąćęłńśźż transliterated — no NFD
      decomposition); ambiguous fold → unmatched; unmatched → `{ ticker: aktywo,
      assetType: "stock", matched: false }`. Index loaded once per connection
      (WeakMap cache) — ~60k rows in memory.
- [x] `src/konto-map.ts`: static map `Konto` → `{ walletName, currency, baseCurrency }`
      for all 10 known values; throws on unknown.

      | Konto                     | walletName                  | currency | baseCurrency |
      |---------------------------|-----------------------------|----------|--------------|
      | `IB`                      | IBKR                        | USD      | PLN          |
      | `Equate+`                 | Equate+                     | EUR      | PLN          |
      | `IKE Marek`               | IKE Marek                   | PLN      | PLN          |
      | `IKE Beata`               | IKE Beata                   | PLN      | PLN          |
      | `NN TFI PPK`              | NN TFI PPK                  | PLN      | PLN          |
      | `NN TFI PPO`              | NN TFI PPO                  | PLN      | PLN          |
      | `Rach. rejestrowy PKO BP` | Rach. rejestrowy PKO BP     | PLN      | PLN          |
      | `XTB`                     | XTB                         | PLN      | PLN          |
      | `Crypto`                  | Crypto                      | PLN      | PLN          |
      | `Obligacje PKO SA Beata`  | Obligacje PKO SA Beata      | PLN      | PLN          |

- [x] Unit tests: symbol-primary; aktywo-fallback; unmatched; all 10 Konto values;
      unknown throws.
- [x] `npm run test` passes.
- [x] Commit: `feat(sheets-sync): instrument resolver + Konto→wallet map`.

### 24.6 — Wallets API client

- [x] `src/wallets-api-client.ts`: typed `fetch` wrappers for `POST
      /api/import/wallets/bootstrap`, `POST /api/import/transactions`, `GET
      /api/import/sync-runs` (plus `POST /api/import/portfolios/bootstrap` and
      `DELETE /api/import/source/:externalSource` for §24.8). Auth:
      `Authorization: Bearer $WALLETS_API_TOKEN`. `createWalletsClient(baseUrl, token)`
      + `walletsClientFromEnv()`; enforces the 500-row batch cap client-side.
- [x] Unit tests: mocked fetch; URL, headers, payload shapes.
- [x] Commit: `feat(sheets-sync): wallets import API client`.

### 24.7 — Row mapper: `RawTransakcjeRow` → `ImportTransaction`

- [x] `src/transakcje-mapper.ts`: `mapRow(row, walletUuidMap, portfolioId):
      ImportTransaction` — converts parser output to the `POST /api/import/transactions`
      payload shape (row is enriched with `instrument` by the orchestrator):
      - `walletName` from `konto-map`; `walletTx.type` from `Typ` mapping
        (`Kupno→INVEST`, `Sprzedaż→SELL`, `Div→DIVIDEND`, `Wpłata→DEPOSIT`,
        `Wypłata→WITHDRAWAL`, `Split→ADJUSTMENT`, `Sell Call Option→SELL`).
      - `walletTx.amount` = col 19 `cashFlow` (PLN signed); `currency` = col 20;
        `exchangeRate` = col 21; `rateSource=manual`.
      - `walletTx.fees` = col 33 when `feeCurrency ≠ PLN` else col 7;
        `feeCurrency` = col 31; `feeExchangeRate` = col 32; `feeRateSource=manual`.
        Fees applied to both legs (proposal col 7).
      - `portfolioTx` (omit for DEPOSIT/WITHDRAWAL/ADJUSTMENT): `price` = col 30
        (post-restatement; fallback `|cashFlow| ÷ rate ÷ qty` only when col 30 is
        empty — never overrides a sheet value); `quantity` positive (post-
        restatement); `type` = BUY/SELL/DIVIDEND; `realizedGainLoss` from col 17 on
        Sprzedaż; `assetType` from resolved instrument (uppercased).
      - **`portfolioTx.originalQuantity`** = `row.rawQuantity` (pre-restatement),
        null when raw == restated; **`originalPrice`** = `row.rawPriceNative` (same).
      - Options: `assetType=OPTION`, `optionType=CALL`, `direction=SHORT`,
        `contractSize=100`; strike/expiry null.
      - Unknown Typ / wallet missing from bootstrap map / no usable qty or price
        → throw (loud abort, never drop a row).
- [x] `portfoliost-wallets` (feecddd): `ImportPortfolioTxSchema` gains
      `direction`/`optionType`/`contractSize`; `direction=SHORT` = short-option
      OPEN (position-creating regardless of type) with its own lot distinct from
      the same-symbol underlying equity lot (direction-filtered position lookup);
      new test: SAP equity + written calls.
- [x] `@marx2/contracts` (ea74c37): `ImportPortfolioTx` option fields; fixed
      pre-existing broken YAML indentation (13-space keys) that invalidated the
      whole spec.
- [x] Unit tests: pre-split BUY row → `originalQuantity ≠ quantity`,
      `originalPrice ≠ price`; post-split BUY row → both null; DEPOSIT → null.
- [x] `npm run test` passes (sheets-sync 64, wallets 296).
- [x] Commit: `feat(sheets-sync): row mapper → ImportTransaction + original values`.

### 24.8 — Orchestrator

- [x] `src/sync.ts` (entrypoint):
      1. If `--wipe` / `WIPE=true`: `DELETE /api/import/source/google-sheets:transakcje`
         and log deleted counts. Skip on production CronJob.
      2. Refresh OAuth2 token.
      3. `POST /api/import/wallets/bootstrap` with all 10 wallets → UUID map.
      4. `POST /api/import/portfolios/bootstrap` → `portfolioId`.
      5. `fetchSheet` → `parseRow` → `restateSplits` → `resolveInstrument` → `mapRow`.
      6. Batch into groups of ≤ 500; `POST /api/import/transactions` per batch.
      7. Log total inserted/skipped/errors and `syncRun.id`.
- [x] Smoke (clean run): `docker compose run --rm sheets-sync node dist/sync.js --wipe`
      against local stack; assert `GET /api/import/sync-runs` shows completed run with
      `insertedWtx > 0`.
- [x] Smoke (idempotent re-run): run again without `--wipe`; assert `inserted=0,
      skipped=<all rows>`.
- [x] Add `sheets-sync` service to `portfoliost/docker-compose.yml` (build
      `../portfoliost-sheets-sync`, env `sheets-sync.env`, `restart: no`).
- [x] `npm run test` passes.
- [x] Commit: `feat(sheets-sync): sync orchestrator + wipe support`.
- **Real-data decisions (2024 rows forced these; all loud, none silent):**
  - `mapRow` returns `null` for **no-op rows** (zero quantity AND zero cash —
    e.g. sheet row 29 Div SAP): nothing to import (the wallets DB also forbids
    zero-amount non-ADJUSTMENT wallet txs, `ck_wtx_amount_nonzero`); the Job logs
    each (`noOp=1`).
  - **Zero-quantity rows with cash** (sheet row 206 Kupno Intuit, −0.43 zł):
    wallet cash leg only, no portfolio leg (the sheet's col 11 is unchanged);
    Job logs each (`walletOnly=1`).
  - **Zero-price buys** (Syn2bio 21, Creotech 13 — free allotments, cash 0):
    `ImportPortfolioTx.price` relaxed to `nonnegative` (portfoliost-wallets),
    wallet leg books `ADJUSTMENT` (zero cash); zero-cost lot, `averageCostBasis=0`.
  - **Display-precision sell drift**: sheet quantities are 6-decimal rounded,
    so a full-position exit can exceed the rounded buy sum by ~1e-6 relative
    (GSEM60: 995.290675 vs 995.290673). `processImportSell` clamps within
    `max(1e-9, qty·1e-6)` and errors beyond.
  - `ticker_reference` aliases added (bundled CSV + local DB): `RGEN` +
    `repligen corp`; `DTLA` + `ishares treasury bond 20 yr ucits etf usd a`;
    `IUFS` + `ishares s p 500 financials sector ucits etf usd a` — rows with an
    empty Symbol col now resolve instead of splitting positions under a
    name-as-symbol.
  - Smoke result: clean `--wipe` run `inserted=2016 skipped=7 errors=0
    walletOnly=1 noOp=1` (2024 rows; 7 = duplicate-`externalId` pairs by
    idempotency design); re-run `inserted=0 skipped=2023 errors=0`, run row
    `status=done`.
  - **Known sheet typos left as-is** (symbol col authoritative; report to owner):
    `Monolithic Power Systems Inc` rows tagged `TSM`, `Yum China` tagged `PAYC`,
    `Vercom SA` tagged `VER`, `Big Cheese Studio SA` tagged `BCS`/`MBR`.

### 24.9 — Sheets sync job from the admin panel

Approach change (2026-09-18, supersedes the CronJob design): no schedule, no static
service token. The admin panel (JWT-gated, Pocket-ID) triggers the sync on demand via
jobshot; the backend passes the **caller's own JWT** to the K8s Job as
`WALLETS_API_TOKEN`, so the job authenticates to the wallets import API exactly like a
browser session. All pfire services share one database, so the admin's `DATABASE_URL`
serves as the Job's `INSTRUMENTS_DATABASE_URL` (read-only `ticker_reference` lookup).

Job spec (jobshot `POST /api/run-job`):
- image `ghcr.io/marx2/portfoliost-sheets-sync:<tag>`, command `node dist/sync.js`,
  optional `--wipe` (full re-import) from the UI.
- `secretName: sheets-sync-secrets` (envFrom) — `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
- per-run `env` from the admin backend: `WALLETS_API_TOKEN` (caller JWT from the
  request), `WALLETS_API_URL` (= admin `API_WALLETS_URL`),
  `INSTRUMENTS_DATABASE_URL` (= admin `DATABASE_URL`).
- jobshot unchanged — its `env` map already supports arbitrary values.

Note: 24.3–24.8 commits were never pushed; `v1.0.1` (2026-09-18) is the first release
containing the full sync (v1.0.0 was the bare scaffold).

- [x] Push `portfoliost-sheets-sync` main → GHA release. Note: `v1.0.2` tag exists but has no
  release (GHA auto-bumped to `v1.0.3`); the admin job spec pins
  `v1.0.3` (stable date-sort + 1:1 wallet↔portfolio).
- [x] `portfoliost-admin`: `POST /api/admin/jobs/sheets-sync/run` (`{ wipe?: boolean }`)
      + `GET /api/admin/jobs/sheets-sync/status` + `GET .../log` — build the jobshot
      payload above; duplicate-run guard (409); `job_run` row kind `sheets_sync`
      (backend poller tracks it). Unit tests: payload carries the request JWT, wipe → `["--wipe"]`,
  409 while running. Commit + release (`v1.0.47`, 2026-09-19; the sheets-sync job image pin had the
  same GHA off-by-one — `v1.0.2` → `v1.0.3`).
- [x] `portfoliost` (SPA): `src/api/adminJobs.ts` — `runSheetsSync`,
      `getSheetsSyncStatus`, `getSheetsSyncLog`; `JobsView.vue` — "Google Sheets"
      card: Run Sync + Wipe & re-import (confirm), status badge, last-run info, 60 s polling (stooq
  pattern). Commit + release (`v1.0.166`, 2026-09-19).
- [x] `homelab/cluster/apps/pfire/portfoliost-sheets-sync/`: `sheets-sync-secrets`
      (Google creds, postBuild substitution) + `ks.yaml` + app kustomization (no
      HelmRelease — image is pinned in the admin job spec); add
      `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` to `tmpl/cluster-secrets.yaml`; tag bumps for
  the admin + portfoliost releases. Applied 2026-09-18.
- [x] E2E: trigger the sync from the admin panel against the cluster — run 21
      (2026-09-19 10:54 local, image `v1.0.3`, wipe): job **Complete**,
      `status=done`, `inserted=2016 skipped=7 errors=0 walletOnly=1 noOp=1`
      (matches the §24.8 smoke counts exactly).

**Deployment incident (2026-09-19, resolved) — homelab tag bump off-by-one.**
The §24.9 tag bumps pinned `admin v1.0.45` / `wallets v1.1.37` — tags that GHA never released
(auto-bump produced `v1.0.46` / `v1.1.38` instead). Helm upgrades timed out on `ImagePullBackOff`
(rollout never ready), and the stuck
`pending-upgrade` helm revisions left both HelmReleases `Stalled/RetriesExceeded`
/ blocked, wedging the kustomizations for a day. Fixed by homelab `ca03848ff`
(admin `v1.0.47`, wallets `v1.1.38`, SPA `v1.0.166`); the spec change cleared the Stalled state and
all three rolled out clean. Lesson: after pushing a service, wait for the GHA release and pin the
tag it actually created.

**Sync row errors (2026-09-19, all resolved via reference data — nothing left in
the sheet).** Run 11 (first admin-triggered wipe) failed with 5 row errors. All
five were `ticker_reference` gaps, not sheet typos — the cluster table had lost
the §24.8 manual aliases (the live tickersync upserts from adanos and resets the
column) and the sheet's naming/venue variants don't name-fold onto the upstream
names:
- RGEN buy 0.2297 (sheet row 159, "Repligen Corp", empty symbol col) → ref name
  folds to "repligen corporation", no "repligen corp" alias → name-as-symbol.
  Fixed by `NASDAQ::RGEN` alias `repligen corp`.
- DTLA buy 64 (row 703, venue `LON`), IUFS sell 24 (row 1673, `LON`), IUFS buy
  45 (row 1878, `LON`) → venue-strict match misses (`LON` ≠ ref venue `LSE`)
  and the name-fold fallback needed the full-name aliases, missing in-cluster.
  Fixed by `LSE::DTLA` / `LSE::IUFS` full-name aliases.
- ASML sell 0.4909 (row 852) → ASML buy 0.1028 (row 167, "ASML Holding NV")
  didn't resolve: ref name "ASML Holding N.V." folds to "asml holding n v" vs
  sheet "asml holding nv". Fixed by `NASDAQ::ASML` alias `asml holding nv`.
Persistence: `ALIAS_OVERRIDES` in `tickerref-sync` re-applies all four after
every upstream sync (instruments `010921b` + `2c9912e`, release `v1.0.48`,
homelab `5c23d5b81`). Optional sheet-side cleanup (owner): normalize the Giełda
col `LON` → `LSE` on rows 703/1673/1878 — with the aliases this is now moot.

**Known bug (2026-09-19, fix later) — `wallets.sync_runs` stores only the last
batch's counts.** The import API upserts the run row per batch (≤500 rows)
without accumulating, so after a 5-batch run `inserted_wtx` reads 24 (batch 5)
instead of 2011. The §24.10 verification "insertedWtx ≈ 2024" will read wrong
until the API accumulates (or the job POSTs a final summary update).

**Known bug (2026-09-19, fix later) — SPA admin route bounces on hard reload.**
`router.beforeEach` checks `auth.isAdmin` synchronously, but on a fresh page
load `user` is null until `fetchMe` resolves, so `to.meta.admin` routes redirect
to `/investments` (only soft navigation after login works). Fix: await
`fetchMe()` (once per session) in the guard before the admin check, or hydrate
the store before the initial navigation.

**Fixed (2026-09-19) — pfire postgres CPU saturation from price-bar backfill.**
After the full sheets re-import (~2000 txs → 100+ positions), the value-snapshot
backfill hammered `instruments.price_bars_all` with per-symbol price lookups,
10+ portfolios in parallel. The pfire postgres pod (node `kura`) pegged the node
at ~100 % CPU; probe timeouts cascaded cluster-wide and `pfire` k8s rollouts
timed out → Helm/Flux rollbacks (wallets v1.1.38 / admin v1.0.46).
`pg_terminate_backend` on the active queries dropped node load to ~16 %.

**Root causes (two independent):**
1. **Missing index (the big one).** The `price_bars_all` US branch computes
   `replace(ticker, '.US', '') AS symbol` over the `stooq_daily_us` foreign
   table (28M rows); no index could serve that expression, so every per-symbol
   US lookup was a full 28M-row FDW fetch (~2.2 s for 20 rows). Fixed with a
   functional index in the remote `stooq` DB:
   `daily_us_stripped_ticker_date on public.daily_us (replace(ticker, '.US', ''), date)`
   → US branch 2219 ms → 7.7 ms; full-view US query ~15 ms. Persisted in
   `pfire-init-sql.yaml` (bootstrap) + local PGlite/docker parity
   (`stooq_daily_us_stripped_ticker_date`, portfoliost-instruments v1.0.49).
2. **Unbounded parallelism.** `computeSnapshotBatch` fanned out
   `Promise.all` over every symbol, and multiple portfolios' backfills/recalcs
   ran concurrently. Fixed in portfoliost-wallets v1.1.39:
   - `backfill-runner.ts`: global FIFO runner — **one recompute pass at a time
     cluster-wide** (analytics `runBackfill` and post-mutation recalcs share it).
     Per-portfolio dedupe (latest state wins); abort + re-run after the grace
     period; `MAX_AUTO_RESTARTS` valve against abort livelock.
   - Per-pass price fan-out bounded: `RECALC_PRICE_CONCURRENCY` (default 4).
   - Import route still triggers **no** snapshot recompute (only wallet-balance
     recalc), so price-bar work starts only after the import, one portfolio at
     a time — as required ("suspend until the whole import is done, then
     one-by-one").

**Verified in cluster (2026-09-19):** wallets v1.1.39 + instruments v1.0.49
running; US-symbol view query 15 ms; `kubectl top nodes` 15–27 % CPU (kura was
100 %).

### 24.10 — Closeout

- [x] Update `google-sheets-sync.md`: status **implemented**; record col 29 `Konto`;
      close "no account column" follow-up; mark bond decision 6 superseded.
- [x] Verify (2026-09-19, live cluster) — `sync_runs` run id 26:
      `external_source=google-sheets:transakcje`, `status=done`, completed
      2026-09-19 12:39 UTC. `inserted_wtx` reads **24** — the known batch bug
      (the API upserts the run row per ≤500-row batch without accumulating, so
      only the last batch's counts survive); authority counts come from the event
      tables: `wallets.wallet_transactions` tagged **2016** (distinct
      `external_id` 2016 = 2024 sheet rows − 7 duplicate-`externalId` pairs − 1
      noOp Div SAP row), matching the §24.8 wipe-run count exactly;
      `portfolios.transactions` tagged **1955** = 2016 − 57
      (DEPOSIT/WITHDRAWAL, no portfolio leg by design) − 3 (ADJUSTMENT split
      rows) − 1 (walletOnly Intuit row 206) — no unexplained loss.
- [x] Spot-checks pass: **SELL `realizedGainLoss`** — 236 SELL rows, 231 present;
      5 absent are exactly the SAP covered-call option sells
      (`asset_type=OPTION`, qty 100, no col 17); 5 sampled with values. **Split
      restatement** — 6 BUY rows restated, ratio-exact: AMZN ×20 (0.0209→0.418,
      0.0051→0.102), GOOGL ×20 (0.031→0.62, 0.178→3.56), DNP ×10 (5→50, 2→20),
      `price` ÷ by the same factor.
- [x] Archive to `plan-archive.md`.
- [x] Commit: `chore: google-sheets-sync closeout`.

---

## 26. Topology storage metrics — postgres + redis workload health & resource usage

Scope: the Admin → Topology map shows live status/traffic for the six HTTP
services but nothing for the storage lane. This section makes the **postgres**
(Crunchy PostgresCluster `postgres-pfire`, StatefulSet
`postgres-pfire-postgres-pfire-k8db`) and **redis** (deployment `redis`,
`REDIS_HOST: redis` per cachest helmrelease) nodes show: health pill +
replicas/restarts (status) and CPU / memory / throughput cards (traffic).

Investigation (2026-09-19, read-only, Prometheus `kube-prometheus-stack-prometheus`
v3.14 in `monitoring`, `podMonitorSelector`/`podMonitorNamespaceSelector` empty =
accepts any PodMonitor in any namespace):

- **Already in Prometheus today** (cAdvisor via kubelet + kube-state-metrics):
  `container_cpu_usage_seconds_total` / `container_memory_working_set_bytes`
  for both workloads; `kube_statefulset_status_replicas[_ready]` for the
  StatefulSet (admin's `loadDeploymentHealth` only queries `kube_deployment_*` —
  the reason postgres shows nothing); `kube_pod_container_info` (image tag →
  version).
- **Not in Prometheus:** the Crunchy exporter (container `exporter`, port name
  `exporter`/9187, present in the pod via `spec.monitoring.pgmonitor.exporter`)
  is never scraped — `pg_up` empty, no `spec.metrics` dispatcher on the
  PostgresCluster, no PodMonitor. Query-level metrics (connections,
  transactions/min) need a scrape target first.
- Redis has no exporter; redis query-level metrics would need a
  redis-exporter — **out of scope** (CPU/mem/restarts are enough for the map).

Repos touched: `@marx2/contracts`, `portfoliost-admin`, `portfoliost` (SPA),
homelab (one new PodMonitor YAML + two tag pins).

Design: no new endpoints. `/topology/status` gains k8s-only workload rows for
nodes without `/__meta` (impl `real`, reachable = ready replicas, version from
the `kube_pod_container_info` image tag); `/topology/traffic` gains rows whose
`source` is `prometheus` carrying `cpuCores`/`memoryBytes`/`connections` and
`requestsPerMin` reused as transactions/min for postgres (null until the
exporter is scraped). Compose stack has no Prometheus → endpoints degrade
exactly as today; compose E2E stays static-only.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 26.1 — Contracts: nullable HTTP fields + resource metrics on `TopologyServiceTraffic`

- [x] `portfoliost-contracts/contracts/openapi.yaml`:
  - `TopologyServiceTraffic`: make `requestsPerMin`, `errorRate`,
    `p99LatencyMs` nullable (DB workloads have no HTTP latency); add nullable
    `cpuCores`, `memoryBytes`, `connections` (numbers); extend `source` enum
    with `prometheus`; `required` shrinks to `[name, source]`; document
    `requestsPerMin` as "requests/min (HTTP) or transactions/min (databases)".
  - `TopologyServiceStatus.reachable`: update description to cover
    k8s-only workloads (ready replicas) alongside `/__meta` reachability.
- [x] Push main → GHA `release.yml` auto-bump; `gh release list` to read the real
  tag (never assume +1).
- [x] In `portfoliost-admin` + `portfoliost`: `NODE_AUTH_TOKEN=$(gh auth token)
  npm install @marx2/contracts@<new>` → `npm run gen:types` (both repos have it)
  → commit `package-lock.json` + `generated/api-types.d.ts` in each.
- [x] Tests: contracts repo suite green; consumer builds (`tsc` / `vue-tsc`)
  accept the generated types.
- [x] Commit: `feat(contracts): topology traffic — nullable HTTP fields + resource metrics`.

### 26.2 — admin: workload health in `/topology/status`

- [x] `portfoliost-admin/src/workload-probe.ts` (new module per
  `docs/MODULARISATION.md`): `workloadTargets()` —
  `{ id: "postgres", kind: "statefulset", sts: env TOPOLOGY_POSTGRES_STATEFULSET
  ?? "postgres-pfire-postgres-pfire-k8db", podRe: "^postgres-pfire-postgres-pfire-",
  container: "database" }` and `{ id: "redis", kind: "deployment", name: "redis",
  container: "redis" }`.
- [x] `topology.ts` `loadDeploymentHealth`: keep deployment chain; add
  StatefulSet branch (`kube_statefulset_status_replicas{statefulset=…}`,
  `kube_statefulset_status_replicas_ready`) and a restarts attribution for STS
  pods (`sum by (created_by_name)(kube_pod_container_status_restarts_total *
  on(pod) group_left(label_replace(kube_pod_info, "created_by_name", "$1",
  "created_by_name", "(.+)")))` — for STS pods `created_by_name` is the
  StatefulSet name).
- [x] `/topology/status` handler: after the `/__meta` fan-out, append one row per
  workload target — `reachable: ready >= desired`, `impl: "real"`,
  `replicas {desired, ready}`, `restarts`, `version` = image tag parsed from
  `kube_pod_container_info{pod=~podRe, container=…}` (null on failure). Degrade
  per target (a failed query nulls that row's fields, never 500s), same
  pattern as the existing Prometheus fallback.
- [x] Unit tests (mocked `queryInstant`): STS + deployment rows merged, version
  parsing, degradation on query failure, deployment rows unchanged.
- [x] `npm run test` + `npm run build` pass.
- [x] Commit: `feat(admin): topology status — postgres/redis workload health`.

### 26.3 — admin: resource metrics in `/topology/traffic` + release

- [x] `topology-traffic.ts` `loadTrafficData`: alongside the existing service
  rows, build one row per workload target —
  - `cpuCores`: `sum(rate(container_cpu_usage_seconds_total{namespace=~ns,
    pod=~podRe, container=…}[5m]))`
  - `memoryBytes`: `sum(container_memory_working_set_bytes{…same…})`
  - postgres only: `connections`: `sum(pg_stat_activity_count{namespace=~ns})`,
    `requestsPerMin`:
    `sum(rate(pg_stat_database_xact_commit{namespace=~ns}[5m]) +
    rate(pg_stat_database_xact_rollback{namespace=~ns}[5m])) * 60` — both null
    while the exporter is not yet scraped (queries fail → nulls, not zeros)
  - `errorRate`/`p99LatencyMs`: null; `source: "prometheus"` (or `"none"` when
    `PROMETHEUS_URL` unset — then no workload rows at all, as today).
- [x] Existing `buildService` rows unchanged in shape (HTTP fields stay set).
- [x] Unit tests: workload rows with/without exporter series; degradation;
  existing otel/ingress rows unchanged.
- [x] `npm run test` + `npm run build` pass; push main → GHA release; record the
  real tag for the 26.5 homelab pin.
- [x] Commit: `feat(admin): topology traffic — postgres/redis CPU/mem/throughput`.

### 26.4 — SPA: mark storage live + resource cards in the details panel

- [x] `graph-definition.ts`: `postgres` and `redis` → `live: true` (they now map
  to probed workloads). Update `topology-graph-definition.test.ts` live list
  (6 → 8) + snapshot.
- [x] `TopologyDetailsPanel.vue`: when `traffic.cpuCores != null` render a
  resource card row — CPU (cores, 2 dp), Memory (MiB, rounded),
  Tx/min (`requestsPerMin`) for postgres — instead of the Req/min/P99/Errors
  cards; make the existing cards null-safe (`v-if` per field) so a partial
  payload renders only what exists. Version row already `v-if="status.version"`.
- [x] Unit tests: panel renders resource cards from a mocked store payload;
  HTTP cards still render for `cachest`; null fields render nothing.
- [x] `npm run build` + `npm run test` + `npm run test:mock` +
  `docker compose up -d --build portfoliost` + `npm run test:e2e` (topology
  specs; compose has no Prometheus so postgres/redis show no live overlay —
  assert the nodes still render and inspect). Push main → GHA release; record
  the real SPA tag.
- [x] Commit: `feat(admin-ui): topology — storage resource cards + live postgres/redis`.

### 26.5 — homelab: scrape the Crunchy exporter + pin admin/SPA

- [x] New `cluster/apps/pfire/postgres-exporter-podmonitor.yaml` (standalone
  PodMonitor — deterministic, no operator-RBAC dependency; the
  operator-managed `spec.metrics` alternative noted but not used):
  `selector.matchLabels.postgres-operator.crunchydata.com/cluster:
  postgres-pfire`, `podMetricsEndpoints: [{port: exporter, interval: 30s}]`,
  namespace `pfire`; add to the pfire app kustomization.
- [x] Verify scrape: port-forward `kube-prometheus-stack-prometheus`,
  `pg_up{namespace="pfire"}` = 1, `pg_stat_database_xact_commit` +
  `pg_stat_activity_count` series present.
- [x] Bump `helmrelease.yaml` tags: admin → 26.3 tag, portfoliost → 26.4 tag
  (pin the real GHA tags; several files pin twice — check none of these two do).
- [x] Commit + push homelab main; Flux reconcile
  (`kubectl get kustomization -n flux-system portfoliost` ready) →
  `kubectl get deploy -n pfire portfoliost,portfoliost-admin -o
  jsonpath=…image` + pods running.
- [x] Live verification: hit the cluster admin API
  (`kubectl -n pfire exec` into the admin pod → `curl localhost:3000/api/admin/topology/status`
  + `/traffic`): postgres row `replicas 1/1`, version = pg image tag; traffic
  row `cpuCores > 0`, `memoryBytes > 0`, and after the PodMonitor: `connections`
  + `requestsPerMin` present.
- [x] Browser: Playwright on https://portfoliost.k.homylab.com → Admin →
  Topology → click postgres: health pill + replicas, CPU/Memory/Tx-min cards
  with non-zero values; same for redis (CPU/Memory).

**Verified (2026-09-19, live cluster + browser).** PodMonitor
`postgres-pfire-exporter` deployed & scraped: `pg_up{namespace="pfire"}=1`
(instance 10.42.4.134:9187), `sum(pg_stat_activity_count)=24`, commit+rollback
≈ 3.06 tx/s. Tags pinned + running: admin `ghcr.io/marx2/portfoliost-admin:v1.0.51`
(the 26.3 release tag was `v1.0.50` — homelab `934e5692f` pinned it/SPA `v1.0.170`;
`adba5d163` then bumped admin to v1.0.51 for the PromQL anchor fix), SPA
`ghcr.io/marx2/portfoliost:v1.0.170`; both reconciled by Flux.
Admin API is JWT-gated (401 w/o `Authorization`), so the endpoint check was done
from the signed-in browser: postgres row **Healthy**, version `vubi8-16.2-0-v0.2.0`
(image tag), replicas 1/1, CPU 0.01 c, Memory 2331 MiB, Tx/min 440.7, Conns 24,
`Source: prometheus`; redis row **Healthy**, version `v8.10.1`, replicas 1/1,
restarts 0, CPU ~0 (idle — rounds to 0.00), Memory 52 MiB, `Source: prometheus`.
Zero console errors on the topology page.

### 26.6 — Closeout

- [x] KB: save the Prometheus query cookbook (cAdvisor + kube-state-metrics
  workload health + Crunchy exporter labels, PodMonitor location,
  `podMonitorSelector` = any-namespace fact) under `pfire/ops`.
  **→ `pfire/ops/prometheus-query-cookbook` (id 9).**
- [x] Update this section's investigation notes with the live numbers observed
  (see the §26.5 verification block).
- [x] Archive to `plan-archive.md`.
- [x] Commit: `chore: topology storage metrics closeout`.

**Open questions / out of scope**

- redis query-level metrics (queries/sec, hit ratio) need a redis-exporter —
  follow-up, not part of this section.
- Job nodes (fxsync, tickersync, sheets-sync, …) could later show last-run
  completion from `kube_job_status_succeeded` — separate follow-up.
- pgBouncer metrics: not deployed (pgdb spec section commented out) — nothing
  to surface.

---

## 27. Force-recompute buttons on charts + reusable chart components

Investigation (2026-09-19) — after a full sheets re-import, some portfolios/wallets
show empty charts. Root causes: portfolio analytics (`value_snapshots`) are only
built by the lazy backfill triggered from `GET /api/portfolios/:id/analytics` when
the portfolio has fewer than 2 snapshot rows, and a portfolio whose recompute yields
an empty/small batch stays on `backfillStatus: complete` with `n < 2` — so every
visit re-enqueues a full recompute yet the chart never appears. The serialized
runner + 5-minute frontend poll window make the rest look empty for a while. Wallet
balance charts reconstruct from the ledger on every GET, so they only look empty
when the ledger nets to ≤0.

This section adds an explicit, user-triggered recompute: a **"Recompute" button on
every chart** that force-rebuilds the series, plus makes the two chart kinds
**reusable components** (`PortfolioPerformanceChart`, `WalletBalanceChart`) instead
of inline apexchart configs. No proposal file — derived from the investigation and
decided 2026-09-19.

Design:

- **Portfolios recompute via full replace.** A forced recompute runs
  `recalcPortfolioHistory` (delete + rebuild from BUY/SELL × price bars, backfill.ts:611)
  enqueued through the serialized `backfill-runner` — NOT `runBackfill` (upsert-only,
  leaves stale rows for days that no longer carry value). After the POST the backfill
  status is `pending`, which also stops the analytics endpoint's n<2 auto-trigger loop
  while it runs.
- **Wallets recompute = refetch.** `GET /api/wallets/:id/balance-history` already
  reconstructs the daily series from the ledger on every call; the wallet button just
  re-fetches (no new backend surface).
- **Endpoint:** `POST /api/portfolios/:id/recompute` → 404 if not owned,
  `200 { backfillStatus: "pending" }` after enqueue. Registered in the OpenAPI spec
  (`@marx2/contracts`) + mock, typed via `npm run gen:types`.

Repos touched: `portfoliost-contracts`, `portfoliost-wallets`, `portfoliost` (SPA +
mocks).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + mock per `AGENTS.md`; e2e against docker compose).

---

### 27.1 — Contract bump: `POST /portfolios/{id}/recompute`

Contract-first (MODULARISATION.md): the route in 27.2 and the SPA call in 27.3 both
build against `@marx2/contracts`.

- [x] In `portfoliost-contracts/contracts/openapi.yaml`, under `/portfolios/{id}`:
      add `post` operation `portfolioRecompute` (tags `Portfolios`,
      `security: bearerAuth`) with `204`/`200`-free shape:
      `200` → `BackfillRecomputeResponse { backfillStatus: enum[pending,complete,failed] }`,
      `404` → existing NotFound error shape. Reuse the `portfolioId` path parameter.
      Add the `BackfillRecomputeResponse` schema next to `PortfolioAnalytics`.
- [x] `portfoliost-contracts/contracts`: `npm run lint` (yaml parses) + `npm test`.
- [x] Bump `@marx2/contracts` version in `portfoliost-contracts`, publish, then
      bump the dependency in `portfoliost/package.json` + `portfoliost-wallets/package.json`
      and `npm install`.
- [x] Regenerate: `npm run gen:types` in `portfoliost` (→ `generated/api-types.d.ts`)
      and `portfoliost-wallets` (→ `src/generated/api-types.d.ts`); confirm
      `operations["portfolioRecompute"]` and `BackfillRecomputeResponse` exist.
- [x] Commit: `feat(contracts): portfolio recompute operation`.

### 27.2 — Backend: `POST /api/portfolios/:id/recompute`

- [x] In `portfoliost-wallets/src/services/backfill.ts` export
      `forcePortfolioRecalc(db, portfolioId, authToken)`: delegates to
      `enqueueBackfill(portfolioId, (signal) => recalcPortfolioHistory(db, portfolioId, authToken, new Date(), signal))`
      (backfill-runner.ts, backfill.ts:611) — full delete+rebuild, returns the
      enqueue promise (resolved when the slot is consumed).
- [x] In `portfoliost-wallets/src/routes/portfolios.ts`, inside the existing
      `/portfolios` Hono app (before `/:id/analytics`): `routes.post("/:id/recompute", …)`
      — ownership check (404 like analytics), then
      `void forcePortfolioRecalc(database, id, c.req.header("Authorization") ?? "").catch(() => undefined)`
      and return `{ backfillStatus: "pending" } satisfies BackfillRecomputeResponse`.
      Import the schema type from `../generated/api-types.js`.
- [x] Tests (`portfoliost-wallets/src/routes/portfolios.test.ts` or a new
      `recompute.test.ts` next to `analytics.test.ts`):
      - 404 for a portfolio not owned by the user;
      - returns `{ backfillStatus: "pending" }` and, with mocked
        `getPriceBarSeries`/fetch, a seeded BUY portfolio ends with rebuilt
        `value_snapshots` and `portfolio_backfill_metadata = complete` after the
        enqueued pass drains (await the returned promise);
      - replace-semantics: seed a stale snapshot row (a day with value after the
        position was fully sold), force recompute, assert the stale row is gone;
      - BUY/SELL-less portfolio: recompute marks complete with 0 rows (no crash).
- [x] Gate: `npm test` + `npm run lint` in `portfoliost-wallets` pass.
- [x] Commit: `feat(wallets): force portfolio recompute endpoint`.

### 27.3 — Mock + SPA API client

- [x] `portfoliost/mocks/portfolios/index.js`: handle `POST /api/portfolios/:id/recompute` —
      verify the id exists (else 404), set an in-memory `recomputed` flag and return
      `{ backfillStatus: "pending" }`; make the subsequent
      `GET /api/portfolios/:id/analytics` serve data (default `portfolio_analytics_1Y.json`)
      regardless of empty-state list so the e2e in 27.5 can assert the chart fills.
      Add a dedicated empty-analytics fixture portfolio whose analytics starts empty
      and fills after recompute.
- [x] `portfoliost/src/api/portfolios.ts`: add
      `recomputePortfolio(id: string): Promise<{ backfillStatus: string }>` via
      `http.post` typed from `components["schemas"]["BackfillRecomputeResponse"]`.
- [x] Gate: `npm run test:mock` in `portfoliost` passes (mock tests asserting the
      recompute flag toggles the analytics body).
- [x] Commit: `feat(portfoliost): recompute API client + mock`.

### 27.4 — Reusable chart components with Recompute button

- [x] Create `portfoliost/src/components/WalletBalanceChart.vue`: props
      `points: Array<{ date: string; balance: number }>`, `busy?: boolean`, emits
      `recompute`. Renders the existing green area apexchart (stroke 2, gradient
      fill, height via prop default 200, x-labels via `formatDate`), a
      `data-testid="wallet-chart-recompute"` button (`btn-secondary text-xs`,
      disabled while busy, label `Recompute`), and the existing
      `No balance history available.` empty state. Keeps per-view point shaping
      (e.g. `balance > 0` filter) in the parent — the component renders what it
      gets.
- [x] Create `portfoliost/src/components/PortfolioPerformanceChart.vue`: props
      `timeSeries`, `benchmarks`, `returnType`, `backfillPending?: boolean`, emits
      `recompute`. Moves the current `equityOptions` computed (index-normalized,
      TWR/MWR/simple selection, benchmark overlay) from `PortfolioPerformanceTab.vue`
      into the component; renders the chart, the `Historical data is loading…`
      pending line, and `data-testid="portfolio-chart-recompute"` button.
- [x] Unit tests (`portfoliost/tests/unit/components/`):
      `WalletBalanceChart.test.ts` (renders points, emits recompute) and
      `PortfolioPerformanceChart.test.ts` (indexed series start = 100 for
      TWR/MWR/simple fallback, emits recompute, pending line only when pending).
- [x] Gate: `npm run build` + `npm run test` in `portfoliost` pass.
- [x] Commit: `feat(portfoliost): reusable chart components with recompute`.

### 27.5 — Wire the four views to the new components

- [x] `PortfolioPerformanceTab.vue`: replace the inline `equityOptions`/apexchart
      block in the Performance Chart card with `<PortfolioPerformanceChart>` passing
      `store.analytics` series + `store.analyticsBenchmarks` + `store.analyticsReturnType`
      + `backfillPending`; on `@recompute` call `recomputePortfolio(id)`, set
      `store.analytics.backfillStatus = "pending"`, `backfillPending = true` and
      restart the existing 5-minute poll loop (`startPolling`). Keep the Customize
      modal + timeframe buttons untouched.
- [x] `WalletsView.vue`, `WalletDetailView.vue`, `CashWalletCard.vue`: replace the
      inline `historyChart` apexchart with `<WalletBalanceChart>` passing the existing
      `points` mapping (`balance > 0` filter preserved in the wallet list/card,
      unfiltered in the detail view); `@recompute` re-runs the view's own
      `loadHistory`/`toggleHistory` with a busy state while in flight. Delete the
      now-unused inline `historyChart` computeds.
- [x] Mock E2E (`portfoliost/tests/e2e/`): new spec — open a portfolio whose
      analytics mock starts empty, click `portfolio-chart-recompute`, assert the
      pending line then the populated chart; open a wallet, click
      `wallet-chart-recompute`, assert no error and refreshed history.
- [x] Gate: `npm run build` + `npm run test` + `npm run test:mock` + (docker compose
      rebuild) `npm run test:e2e` in `portfoliost` pass.
- [x] Commit: `feat(portfoliost): wire views to chart components + recompute`.

### 27.6 — Closeout

- [x] KB: save the root-cause facts (charts populate via lazy analytics backfill;
      empty-batch portfolios re-trigger forever; recompute = recalcPortfolioHistory)
      under `pfire/investigations`. — **done in-place (2026-09-19): the `kb` MCP
      tools were unavailable in the working session, so the facts are recorded here.
      Facts: (1) portfolio performance charts are fed by `value_snapshots`, built
      only by the lazy backfire/enqueue from `GET /api/portfolios/:id/analytics`
      when the portfolio has < 2 snapshot rows; (2) a portfolio whose recompute
      yields an empty batch stays `complete` with `n < 2`, so every visit
      re-enqueues a pass that produces nothing — the chart never appears
      (repro 2026-09-19: freshly created portfolio → analytics `pending` forever);
      a batch is non-empty only when BUY/SELL txs exist with `executedAt` ≤ yesterday;
      (3) the force-recompute fix = `recalcPortfolioHistory` (full delete+rebuild,
      NOT upsert-only `runBackfill`) enqueued via the serialized backfill-runner,
      `POST /api/portfolios/:id/recompute` → `{ backfillStatus: "pending" }`;
      (4) wallet balance charts rebuild from the ledger on every GET — "Recompute"
      there is just a refetch; (5) e2e runs against the REAL wallets backend via the
      gateway (SPA built with `VITE_API_BASE_URL=http://localhost:8080`), so mock
      behaviour is irrelevant for e2e chart tests — use the seeded Top10 portfolio.
- [x] Archive to `plan-archive.md`.
- [x] Commit: `chore: charts recompute closeout`.

---

## 28. Google Sheets import: venue-correct symbols + real country/sector (D24 follow-up)

Proposal: [google-sheets-sync.md](proposals/google-sheets-sync.md) — fix two defects
surfaced after production import (§24): (a) every position shows "(Other) Stock" in
holdings because import stamps `country="Other"` and nothing corrects it; (b) SNT
and NWG are enriched to the wrong listings — **Senstar Technologies (NASDAQ)** instead
of Synektik SA and **NatWest Group (LSE)** instead of Newag SA — because wallets later
re-resolve the stored **bare** ticker, which is ambiguous across venues.

Fix approach (verified read-only 2026-09-19 against the live spreadsheet + real DB):

- The **"Podsumowanie" sheet is the authoritative per-asset catalog**: 225 named
  assets with `Kategoria`, `Aktywo`, `Symbol Google`, **`Symbol Yahoo` (venue-qualified:
  `SNT.WA`, `NWG.WA`, `MBR.WA`, `SAP.DE`, `RIO.L`, bare `CRM`)**, `Sektor` (PL + English),
  `Kraj` (empty for PL, Polish names otherwise), `Oryginalna waluta`, plus the
  `Symbol giełdowy`/`Giełda` pair (col 29/30) and `Symbol Stooq` (col 35).
- **Join key = folded `Aktywo` name** (Transakcje col D ↔ Podsumowanie col B); with a
  new "S.A."→"sa" fold rule, **all 707 position rows (86 assets) name-match the
  catalog (verified 0 misses)**. `(Symbol giełdowy, Giełda)` (Transakcje col AH/AI)
  is the secondary fallback key for future typos/misses; in doubts the Transakcje
  `Aktywo` name wins — never guess.
- Imported transactions get `instrumentSymbol = Symbol Yahoo` (venue-qualified) plus
  `country`/`countryCode`/`sector`/`industry` carried through the contracts, so
  wallets enrichment, quotes, and research resolve the exact listing (Synektik/WSE)
  and the holdings label becomes "(PL) Stock".

Repos touched: `portfoliost-contracts`, `portfoliost-sheets-sync`, `portfoliost-wallets`,
`portfoliost` (mocks/tests only). No openst/cachest changes.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit per repo + mock per `AGENTS.md`; e2e against docker compose). The production
re-import in 28.6 touches homelab and requires explicit approval before running.

---

### 28.1 — Contract: `ImportPortfolioTx` carries sector/industry/country

Contract-first (`MODULARISATION.md`); the sync client in 28.4 and wallets in 28.5
both build against it.

- [x] `portfoliost-contracts/contracts/openapi.yaml` `ImportPortfolioTx` (~1734):
      add optional `sector`, `industry` (strings, nullable), `country` (string,
      ISO-2 e.g. `PL`, nullable), `countryCode` (string, nullable, legacy 2/3-letter
      when different from the ISO-2 `country`).
- [x] `portfoliost-contracts/contracts`: `npm run lint` + `npm test`.
- [x] Bump `@marx2/contracts`, publish, bump in `portfoliost-wallets/package.json`
      + `portfoliost/package.json`, `npm install`.
- [x] `npm run gen:types` in `portfoliost-wallets`; confirm fields on
      `ImportPortfolioTx`.
- [x] Commit: `feat(contracts): ImportPortfolioTx sector/industry/country`.

### 28.2 — Podsumowanie catalog reader + fixture (sheets-sync)

- [x] Capture fixture `src/tests/fixtures/podsumowanie.json` from the live
      `Podsumowanie!A1:AL233` (226 data rows via existing `fetchSheet` +
      `FORMATTED_VALUE`).
- [x] `src/podsumowanie-parser.ts`: `readPodsumowanie(sheet)` →
      `PodsumowanieCatalogEntry[]` with `aktywo, symbol, giełda, yahooSymbol,
      stooqSymbol, sektor, krajRaw, currency, kategoria` from cols 1/29/30/4/35/20/36/37/0
      (empty strings → null). Indexes: `byFoldedName` and `bySymbolGielda`.
- [x] `src/instrument-resolver.ts` `nameFold`: add "S.A."-style collapse
      (`/\bs a\b/` → `sa`) so `"Newag S.A."` ≡ `"Newag Sa"`; export it for reuse by
      the parser (single fold implementation). Keep NFD/diacritics transliteration.
- [x] `src/countries.ts`: Kraj → ISO-2 map `Niemcy→DE, USA→US, UK→GB, Tajwan→TW,
      Holandia→NL, Irlandia→IE, Szwecja→SE, Singapur→SG, Kanada→CA, Japonia→JP,
      Chiny→CN, Dania→DK, Luksemburg→LU`, empty → null (→ later resolved by venue).
- [x] Tests (`src/podsumowanie-parser.test.ts`, extend `instrument-resolver.test.ts`):
      fixture parses 226 rows; folded-name key uniqueness (no silent collisions);
      Synektik SA / Newag Sa / MO-BRUK SA rows map to `SNT.WA`/`NWG.WA`/`MBR.WA` with
      `sektor`; Kraj mapping incl. empty→null; `nameFold("Newag S.A.")`
      === `nameFold("Newag Sa")`.
- [x] Gate: `npm run test` in `portfoliost-sheets-sync` passes.
- [x] Commit: `feat(sheets-sync): Podsumowanie catalog reader + name fold (D24 f/up)`.

### 28.3 — Resolver: name-first catalog join, venue-qualified symbol

- [x] `ResolvedInstrument` gains `yahooSymbol: string | null`, `sector`,
      `industry`, `country: string | null` (ISO-2), `countryCode: string | null`.
- [x] Resolution order in `resolveInstrument`: (1) **catalog by folded `Aktywo`
      name** → single entry wins; multiple entries with the same folded name are
      disambiguated by `(symbol, giełda)` when present, else treated as unmatched
      (no guessing); (2) **catalog by `(symbol giełdowy, giełda)`** when name misses
      (typo case, e.g. "w Wrszw SA"); (3) existing `ticker_reference` match (which
      remains for assets absent from the catalog, e.g. funds) — build `yahooSymbol`
      as `ticker + yahoo_suffix` from a `LEFT JOIN exchange_reference ON exchange`
      added to the index load, `country` from `exchange_reference.country_code`,
      sector from `stock_sector`; (4) unmatched keeps sheet values + `matched:false`.
- [x] Mapper (`transakcje-mapper.ts:164`): set `instrumentSymbol = yahooSymbol ??
      ticker` — the **venue-qualified** symbol is what wallets/quotes/research see
      downstream, so bare ambiguous tickers never re-resolve to a namesake.
- [x] Tests (`instrument-resolver.test.ts`, `transakcje-mapper.test.ts`): SNT/WSE →
      `SNT.WA` + `PL` + sektor; NWG/WSE → `NWG.WA`; SAP/ETR → `SAP.DE`; RIO/LON →
      `RIO.L`; CRM/NYSE stays bare; fund (`NN Emerytura 2030`) keeps ticker_reference
      path; ambiguous-name catalog case stays unmatched. Update existing
      `ResolvedInstrument` assertions.
- [x] Gate: `npm run test` + `npm run build` (tsc) in `portfoliost-sheets-sync` pass.
- [x] Commit: `feat(sheets-sync): name-first catalog join + venue symbols (D24 f/up)`.

### 28.4 — Sync client ships catalog fields

- [x] `wallets-api-client.ts`: `ImportPortfolioTx` request body adds `sector`,
      `industry`, `country`, `countryCode` from the resolved instrument (nulls
      omitted); `instrumentSymbol` already reflects 28.3.
- [x] `sync.ts`: fetch `Podsumowanie!A1:AL233`, `readPodsumowanie`, pass the
      catalog into `resolveInstrument`.
- [x] Tests (`wallets-api-client.test.ts`, `transakcje-mapper.test.ts`): request body carries venue-qualified
      symbol + new fields; regression on the happy-path import.
- [x] Gate: `npm run test` + `npm run build` (tsc) in `portfoliost-sheets-sync` pass.
- [x] Commit: `feat(sheets-sync): send sector/country in import payload`.

### 28.5 — Wallets: persist fields + self-heal the "Other" sentinel

- [x] `portfoliost-wallets/src/routes/import.ts` (~240): when `tx.country` is
      provided use it and its `countryCode`, else keep the current `"Other"`
      fallback; map `tx.sector`/`tx.industry` onto positions (fallback stays
      `"Other"`); same in `portfolio-transactions.ts:206` (industry added).
- [x] `src/services/quotes.ts` (~215): enrichment fills `country`/`sector` when
      the stored value is `null`, empty, **or the `"Other"` sentinel** — so already
      imported positions self-heal on the next quotes pass without a wipe.
- [x] Tests (`routes/import.test.ts` / `quotes.test.ts`): positions persist the
      incoming sector/country; `"Other"`+`null` positions get overwritten by the
      profile country; a real-profile position keeps its stored values.
- [x] Gate: `npm run test` + `npm run build` (tsc) in `portfoliost-wallets` pass.
- [x] Commit: `feat(wallets): persist sector/country + heal 'Other' (D24 f/up)`.

### 28.6 — Mock parity + full re-import + validation

- [x] `portfoliost/mocks/`: import/position fixtures gain `sector`/`country`/`countryCode`
      samples; `npm run mock:seed` unchanged unless seeds add positions.
      Verdict: fixtures **already** carry `sector`/`country` — `portfolio_positions.json`,
      `portfolio_transactions.json`, `mocks/db-seed/constants.mjs` `SEED_POSITIONS`, and the
      mock POST fallback. `countryCode` is a wallets-import-only payload field (dropped before
      storage; no positions column, no SPA screen expects it), so nothing to add.
- [x] Full gates: `npm run build` + `npm run test` + `npm run test:mock` in
      `portfoliost`; npm build/test in contracts/wallets/sheets-sync/instruments; dockerized
      `npm run test:e2e` (78 passed, 1 skipped). E2E hardening covered along the way:
      deterministic stooq-first ordering for overlapping price-bar dates (instruments),
      self-contained fees-fx wallet handling, wallet refill + merge-tolerant buy specs,
      structural holdings/transactions group asserts, scoped portfolio-tab nav.
- [x] Commit: `test(portfoliost): mock parity for sector/country positions`.
- [x] **Production re-import (requires explicit user approval):** rebuild the
      `portfoliost-sheets-sync` image, run the Job against the live spreadsheet
      (wipe + re-import), then verify read-only via `psql`:
      `positions` for SNT → company `Synektik`, country `PL`, sector not "Other";
      NWG → `Newag`, country `PL`; count remaining `country='Other'` rows — expect
      only genuinely-unknown assets (name-less funds/bonds) and report the list.
      Result: imported 2016 rows, syncRun 31, errors 0. Note `positions.symbol` is the
      venue-qualified ticker — `SNT.WA` → Synektik SA, sector Healthcare, country PL;
      `NWG.WA` → Newag Sa, sector Industrials, country PL. 215/265 positions carry a
      country; the 50 `country='Other'` rows are only genuinely-unknown assets:
      Polish retail savings bonds (`ROD*`/`EDO*`), name-less Catalyst bond codes
      (`ARH`/`BST`/`INS`/`KIN`/`KRI`/`NVA`/`VOX`), PL TFI sub-funds (Goldman Sachs /
      NN / Beta ETF lines), crypto (`BTC`/`ETH`), and two venue-unresolved foreign
      stocks (Allianz SE, Nintendo Co Ltd). First attempt failed with
      `422 unrecognized keys: sector, country` — prod wallets `v1.1.40` predated the
      acceptance commit (`bccf51e`); released wallets `v1.1.41` + homelab tag bump +
      re-run succeeded.
- [x] Commit the re-import result/summary to the plan section.

### 28.7 — Closeout: google-sheets-sync.md to final status

- [x] `docs/proposals/google-sheets-sync.md`: set status to **final/done**; document
      the Podsumowanie catalog (name-first join), venue-qualified `Symbol Yahoo`
      import, country/sector sources (catalog → exchange_reference), and the
      "(Other) Stock" root cause + self-heal.
- [x] Update `AGENTS.md`/KB if the sync-surface notes need refreshing.
- [x] Archive §28 into `plan-archive.md`.
- [x] Commit: `chore: D24 follow-up closeout (venue symbols + country/sector)`.

---

## 29. Portfolio analytics — price data warehouse + value snapshots

Proposal: [price-data-architecture.md](proposals/price-data-architecture.md).

Architecture summary:

- `portfoliost-instruments` gains multiple foreign tables (`stooq_daily_us/pl/world`) via
  `postgres_fdw` pointing at the existing `stooq` DB on the same Postgres instance.
- `instruments.price_bars` stores overflow prices (recent tail + symbols not in stooq).
- `instruments.price_bars_all` VIEW unifies stooq foreign tables + overflow in one SQL call.
- `instruments.price_bar_metadata` tracks circuit-breaker state per symbol.
- Split detection tables (`split_candidates`, `split_adjustments`) handle stooq/overflow boundary discontinuities.
- `value_snapshots` in `portfoliost-wallets` (migration already done — 0 rows) feeds the analytics endpoint.

### 29.1 — price_bars schema, foreign tables, and unified view — [x] DONE

In `portfoliost-instruments`, add to `instruments` schema via Drizzle migration:

- [x] Migration 0003: `price_bars`, `price_bar_metadata`, `split_candidates`, `split_adjustments`.
- [x] Guarded `price_bars_all` view over all eight stooq daily datasets + overflow.
- [x] homelab `pfire-init-sql` ConfigMap wired into `postgrescluster-pfire.yaml` (8 FDW foreign tables).
- [x] docker-compose `pricebars-sim` one-shot (post_fdw stand-in, self-verifies the view).
- [x] Unit tests (`src/db/price-bars.test.ts`) + build + 91 tests green.
- [x] Released to prod: `portfoliost-instruments` v1.0.17 (CI → ghcr + tag/release), helmrelease v1.0.16→v1.0.17, Flux reconciled, rollout complete.
- [x] Prod verified: migration 0003 applied, view created over foreign tables, FDW pushdown query returns rows (AAPL 10,577).

In the `instruments` schema:

**`instruments.price_bars`** — overflow table (recent tail + symbols not in stooq):
```sql
CREATE TABLE instruments.price_bars (
  symbol   TEXT         NOT NULL,   -- system format: AAPL, KRU.WA, RHM.DE
  date     DATE         NOT NULL,
  close    NUMERIC(28,8) NOT NULL,
  source   TEXT         NOT NULL DEFAULT 'openst',
  PRIMARY KEY (symbol, date)
);
```

**`instruments.price_bar_metadata`** — circuit breaker per symbol:
```sql
CREATE TABLE instruments.price_bar_metadata (
  symbol          TEXT PRIMARY KEY,
  last_fetched_at TIMESTAMPTZ,
  fetch_status    TEXT NOT NULL DEFAULT 'ok'  -- 'ok' | 'failed'
);
```

**`instruments.split_candidates`** and **`instruments.split_adjustments`** — split detection workflow:
```sql
CREATE TABLE instruments.split_candidates (
  symbol               TEXT         NOT NULL,
  detected_at          DATE         NOT NULL,
  last_stooq_date      DATE,
  last_stooq_close     NUMERIC(28,8),
  first_overflow_date  DATE,
  first_overflow_close NUMERIC(28,8),
  ratio                NUMERIC(10,6),
  suggested_factor     NUMERIC(10,6),
  suggested_ratio      TEXT,
  status               TEXT         NOT NULL DEFAULT 'pending',
  reviewed_at          TIMESTAMPTZ,
  reviewed_by          TEXT,
  PRIMARY KEY (symbol, detected_at)
);

CREATE TABLE instruments.split_adjustments (
  symbol       TEXT         NOT NULL,
  detected_at  DATE         NOT NULL,
  factor       NUMERIC(10,6) NOT NULL,
  split_ratio  TEXT,
  PRIMARY KEY (symbol, detected_at)
);
```

**postgres_fdw setup** — homelab `databaseInitSQL` ConfigMap (`pfire-init-sql`) wired into `postgrescluster-pfire.yaml`:
- Install `postgres_fdw` extension in `portfoliost` DB.
- Create `stooq_server` pointing at `stooq` DB on `localhost`.
- Create user mapping for `portfoliost` role.
- Create foreign tables for **all eight stooq daily datasets**: `daily_us`, `daily_pl`, `daily_jp`, `daily_world`, `daily_uk`, `daily_hk`, `daily_hu`, `daily_macro` (as `instruments.stooq_daily_*`).
- All `IF NOT EXISTS` — idempotent on cluster bootstrap / pod restart.

**`instruments.price_bars_all`** VIEW — unifies all sources (created *guarded* in migration 0003, so no plain local stooq tables are created in prod to collide with the FDW foreign tables):
- `stooq_daily_us`: `replace(ticker, '.US', '')` as symbol, split adjustment applied via LEFT JOIN on `split_adjustments`.
- `stooq_daily_pl`, `stooq_daily_uk`, `stooq_daily_jp`, `stooq_daily_hk`, `stooq_daily_hu`, `stooq_daily_world`, `stooq_daily_macro`: ticker passthrough (exact mapping TBC after import).
- `price_bars` overflow: direct.

**docker-compose simulation** — postgres_fdw is unavailable locally, so the `pricebars-sim` one-shot service (idempotent, post-migration) creates plain stand-in `stooq_daily_*` tables + the same view, seeds a few rows, and self-verifies the view unifies US (split-adjusted), world (passthrough) and overflow rows. PGlite unit tests use the same stand-in DDL (`src/db/price-bars.ts`).

Unit test (`src/db/price-bars.test.ts`): schema compiles, upsert into `price_bars` is idempotent, VIEW returns rows from both stooq + overflow sources, split-adjusted close applied.

**Performance note** — the single-view read approach is kept (no per-ticker table routing yet); a candidate optimization (ticker-routed single-table reads) is documented at the end of `docs/proposals/price-data-architecture.md` to re-evaluate if the real imported data is too slow.

### 29.2 — price history read endpoint — [x] DONE

`GET /api/instruments/:symbol/price-bars?from=YYYY-MM-DD&to=YYYY-MM-DD`

- [x] Wire route `GET /api/instruments/:symbol/price-bars`.
- [x] Query `price_bars_all` for range; detect gap (`MAX(date)` vs today > 3 days).
- [x] Circuit breaker via `price_bar_metadata` (failed + >1h → serve stale with `{ stale: true }`).
- [x] Fetch missing days from cachest → openst via `fetchOhlcv`, upsert into `price_bars`, update `price_bar_metadata`.
- [x] Split boundary check on first overflow write.
- [x] Return complete series incl. `stale` flag.
- [x] Contract-typed response against `@marx2/contracts` (`PriceBarSeries` schema, `@marx2/contracts@1.6.3`).
- [x] Unit tests: `src/services/price-bars.test.ts` — 8 tests (queryView, hasGap, recentlyFailed, fresh series, gap fill + upsert, circuit breaker, split detection, no-action on continuous boundary). 99 instruments tests green.
- [x] docker-compose verification: endpoint verified live (AAPL split-adjusted series returned, stale=true on cachest miss). e2e spec `tests/e2e/price-bars.spec.ts` (3 tests: valid series, 401 no auth, 400 bad params). Full playwright suite 27 passed, 1 skipped.

Logic:
1. Query `price_bars_all` for requested range (one SQL call — covers stooq + overflow).
2. Find `MAX(date)` for symbol in result. If `today - MAX(date) > 3 days`: gap exists.
3. Check `price_bar_metadata.fetch_status` — if `'failed'` and `last_fetched_at > 1h ago`: return what we have with `{ stale: true }`.
4. Fetch missing days from cachest → openst via existing `fetchOhlcv(symbol, start, end)`.
5. Upsert fetched rows into `price_bars`. Update `price_bar_metadata`.
6. If this is the **first overflow write for this symbol** (`SELECT MIN(date) FROM price_bars WHERE symbol = ?` = today): run split boundary check (compare last stooq close vs first overflow close, insert into `split_candidates` if ratio matches a known split factor ±3% or is outside 0.85–1.15).
7. Return complete series. Include `{ stale: boolean }`.

Ticker routing (via `exchange_reference` + `ticker_reference` — no hardcoded mapping):
- US symbol (NASDAQ/NYSE) → stooq `daily_us`, ticker format `AAPL.US`
- Polish symbol (WSE) → stooq `daily_pl`, format TBC
- German/other → stooq `daily_world`, format TBC

### 29.3 — passive write-through from existing quote/history fetches — [x] DONE

- [x] `backgroundUpsertBars(db, symbol, rows)` added to `src/services/price-bars.ts` — fire-and-forget, errors swallowed, invalid rows filtered.
- [x] Hooked into `/:symbol/history` after `fetchOhlcv` returns rows (11-year daily window).
- [x] Hooked into `/:symbol/price?date=` after `fetchOhlcv` returns rows.
- [x] 3 unit tests: persists bars, idempotent update, silently skips invalid rows. 102 instruments tests green.

### 29.4 — snapshot-on-read in refreshQuotes — [x] DONE

- [x] `snapshotPortfolioValue(db, portfolioId, liveValues, now)` added to `src/services/quotes.ts` — computes `Σ marketValue × fx` and `Σ (avg × qty) × fx`; upserts into `value_snapshots` ON CONFLICT DO UPDATE.
- [x] Called fire-and-forget (`void ... .catch(() => undefined)`) at the end of `refreshQuotes`, using live `marketValue` collected during the per-position loop (not stale DB rows).
- [x] Falls back to `rate=1` when FX table unavailable or pair missing.
- [x] 3 unit tests: correct sums, idempotent upsert, full `refreshQuotes` integration (snapshot row written after quote persist). 144 wallets tests green.

### 29.5 — backfill job: historical value_snapshots — [x] DONE

- [x] `portfolio_backfill_metadata` table added to schema + migration `0002_square_sunspot.sql`.
- [x] `src/services/backfill.ts`: `runBackfill()` — queries MIN(executed_at), builds daily qty_held from BUY/SELL, fetches price series per symbol via instruments `GET /price-bars`, carry-forward on gaps, bulk-upserts `value_snapshots` in chunks of 100; `getBackfillStatus()`; `toDateStr()` normalises PGlite Date/string timestamps.
- [x] `GET /:id/analytics` replaced stub: < 2 snapshot rows → trigger backfill void + return `{backfillStatus:"pending"}`; otherwise read snapshots filtered by timeframe (6M/1Y/2Y/ALL), compute totalValue/totalReturn/monthlyReturns, return full series.
- [x] 10 unit tests: calendarDays, buildPriceMap carry-forward, single-symbol upsert, weekend carry, idempotency, status transitions. 154 wallets tests green.

### 29.6 — wire GET /:id/analytics — [x] DONE

- [x] Analytics stub replaced in `portfoliost-wallets/src/routes/portfolios.ts`: backfill trigger + snapshot read + timeframe filter (6M/1Y/2Y/ALL) + monthlyReturns + backfillStatus. (Implemented as part of step 29.5.)

### 29.7 — frontend: polling + loading banner — [x] DONE

- [x] `@marx2/contracts@1.6.4`: `backfillStatus` + `timeframe` added to `PortfolioAnalytics`; SPA types regenerated.
- [x] `PortfolioCard.vue`: `backfillPending` ref + `startPolling()`/`stopPolling()` — polls every 5s, stops on `complete` or after 5 min; banner shown while pending; `onUnmounted` cleanup.
- [x] `PortfolioPerformanceTab.vue`: same polling via `getPortfolioAnalytics` → `store.analytics`; banner below Performance Chart.
- [x] Both render existing `timeSeries` immediately; build green; 164 mock tests pass.

### 29.8 — tests — [x] DONE

`portfoliost-instruments`:
- [x] `src/services/price-bars.test.ts` extended: `stooqTickerFor` (bare, suffix, lowercase), `ohlcvToClose` (valid, index fallback, bad date, NaN close), `matchSplitFactor` (2:1, 4:1, reverse, ambiguous, continuous), `checkSplitBoundary` ambiguous ratio → `suggested_factor=NULL`, continuous → no candidate, carry-forward view gap behaviour. 123 tests total green.
- [x] `src/services/price-bars-stooq.test.ts` (new): VIEW routing — US `.US` suffix stripped, PL/world passthrough, split_adjustments factor applied, overflow unified, split NOT applied to overflow rows. 10 test files, 123 tests green.

`portfoliost-wallets`:
- [x] `src/services/snapshots.test.ts` (new): today snapshot 2 USD positions, multi-currency PLN/EUR via EUR-base fxRates, empty portfolio → value=0, backfill 3 positions × 10 days correct daily values, empty transactions → 0 snapshots, 6M timeframe filter. 17 test files, 160 tests green.

### 29.9 — post-import hook + admin Market Data tab — [x] DONE

**Post-import hook** `POST /internal/stooq-imported` on instruments:
- [x] `src/services/stooq-import-hook.ts`: `runPostImportHook()` — MAX(date) from stooq table, deletes superseded `price_bars` overflow rows, deletes `split_adjustments`, auto-dismisses `split_candidates`, writes `latestDate`/`rowsDeleted` to `admin.job_run`.
- [x] Route registered in `src/index.ts`; called fire-and-forget from admin job poller on `Succeeded` transition.
- [x] 6 unit tests: dataset/table mapping, US rows deleted + kept, split_candidates dismissed, empty table returns null, PL passthrough. 129 instruments tests green.

**Admin market-data endpoints** (new `src/market-data.ts` in portfoliost-admin):
- [x] `GET /api/admin/market-data/split-candidates` — pending first, history collapsed.
- [x] `POST /api/admin/market-data/split-candidates/:symbol/apply` — inserts `split_adjustments`, marks applied.
- [x] `POST /api/admin/market-data/split-candidates/:symbol/dismiss` — marks dismissed.
- [x] `GET /api/admin/market-data/overflow-summary` — total + top-10 symbols.
- [x] Wired via `registerMarketDataRoutes(admin)` + `setMarketDataDb(db)` in server.ts.

**SPA: Admin Market Data tab**:
- [x] `@marx2/contracts@1.6.5`: `SplitCandidate`, `OverflowSummary` schemas + 4 market-data paths + stooq-imported hook path.
- [x] `src/api/admin.ts`: `fetchSplitCandidates`, `applySplitCandidate`, `dismissSplitCandidate`, `fetchOverflowSummary`, `fetchStooqImportLog`.
- [x] `src/modules/admin/MarketDataView.vue`: Stooq datasets panel, split candidates panel (Apply/Dismiss actions + custom factor input + history section), overflow summary table.
- [x] Route `admin-market-data` + nav link "Market Data" in AdminLayout. Build green; 164 mock tests pass.

---

## 30. Portfolio analytics — performance, risk, derived content, cluster

Proposal: [benchmarks.md](proposals/benchmarks.md) (D46–D50).

### 30.1 — Shared series/returns service — [x] DONE

- [x] `returnColumns.ts` (`buildTwr`, `buildMwr`, `buildSimple`, `buildMonthlyReturns`) — flow-aware TWR chain-link, XIRR/MWR, simple indexed return.
- [x] `cashFlows.ts` (`dailyNetCashFlows`) — BUY/SELL daily net flow with FX conversion; DIVIDEND excluded.
- [x] Annualized daily log-return volatility (√252 × stddev) computed per benchmark series in `buildBenchmarkSeries`.
- [x] `recomputeReturnColumns` called after every snapshot write / recalc.

### 30.2 — Enhanced analytics endpoint — [x] DONE

- [x] `GET /:id/analytics` serves contract-typed `cumulativeTwr` / `cumulativeMwr` / `cumulativeSimple` per snapshot point + `benchmarks[]` (D47/D48).
- [x] Benchmark lines: **transaction-mirroring** (D50) — portfolio cash flows replayed into the benchmark instrument; `buildBenchmarkSeries` in `services/backfill.ts`.
- [x] `benchmarkCalcType` query param threaded through; unknown tickers dropped (never 4xx).
- [x] `timeframeCutoff` exported; handles `1W` (days), `1M`/`3M`/`6M`/`1Y`/`2Y` (calendar), `ALL`.
- [x] Contract updated (`@marx2/contracts` v1.6.7–1.6.9): `returnPercent`/`volatility` on benchmark items, `cumulativeMwr`/`cumulativeTwr` on perf points, `1W` added to timeframe enum.
- [x] Unit tests in `src/routes/analytics.test.ts` (10 tests).

### 30.3 — SPA: Customize dialog + return-type selector — [x] DONE

- [x] `PortfolioPerformanceTab.vue`: **Customize** (Chart controls) dialog — standard benchmark picker (SPY/QQQ/DIA/IWM/VTI/EFA/AGG) + **Add Custom Benchmark** via instrument search component; **Return Type** selector (MWR/TWR/Simple); `setReturnType` refetches on change; backfill-poll refetch keeps `benchmarks` param.
- [x] Phantom "Benchmark" legend line removed.
- [x] `PortfolioAnalyticsTimeframe` union extended to `"1W"|"1M"|"3M"|"6M"|"1Y"|"2Y"|"ALL"` (7 buttons in `PortfolioPerformanceTab.vue` + `PortfolioCard.vue`).
- [x] Y-axis labelled `"Index (start = 100)"` with `v.toFixed(2)` formatter; tooltip updated.
- [x] Monthly Returns bar chart: flow-adjusted month-over-month TWR, `%`-formatted axes.
- [x] Chart heights pinned (equity 300 / Returns 220).
- [x] Mock: `ANALYTICS_BY_TIMEFRAME` + `EMPTY_BY_TIMEFRAME` extended for 1W/1M/3M; mock-test loop covers all 7 timeframes (169 tests).

### 30.4 — Background history recalc queue — [x] DONE

- [x] `services/recalc-queue.ts`: per-portfolio debounce+coalescing queue (`RECALC_GRACE_MS` 3000 ms), AbortController kill+restart, livelock valve (MAX_RESTARTS=10 → fallback timer), `__resetRecalcQueueForTests`.
- [x] `recalcPortfolioHistory` + `computeSnapshotBatch` in `services/backfill.ts`: abort-aware, atomic DELETE+INSERT (replace semantics — clears on no BUY/SELL).
- [x] `notifyTransactionsChanged` wired into POST/PATCH/DELETE `/:id/transactions` + POST/DELETE `/:id/positions`.
- [x] Tests: `services/recalc-queue.test.ts` (coalescing, kill+restart, per-portfolio independence), `services/backfill.test.ts` (replace/clear/abort-never-writes). Full suite 178 pass.

### 30.5 — Tests — [x] DONE

- [x] `analytics.test.ts` (10 tests: timeframe cutoffs 1W/1M/3M/6M/1Y/2Y/ALL, benchmark series, no-ticker returns `[]`, drop unknown ticker).
- [x] `recalc-queue.test.ts` + `backfill.test.ts` (see 30.4 above).
- [x] SPA 125 unit + 169 mock tests green; wallets 178 tests green.

### 30.6 — Risk metrics endpoint — [x] DONE

- [x] `GET /:id/risk-metrics`: maxDrawdown / sharpe / sortino / calmar / win-rate (volatility already computed in benchmark series — reuse).
- [x] `src/services/riskMetrics.ts`: pure functions — `maxDrawdown`, `annualizedVolatility`, `sharpeRatio`, `sortinoRatio` (fallback to Sharpe on all-positive days), `calmarRatio`, `winRate`, `annualizedReturn`, `periodReturnPercent`, `annualizedReturnWithheldReason`, `computeRiskMetrics`.
- [x] Route in `portfoliost-wallets/src/routes/portfolios.ts`: ownership check, timeframe-filtered snapshot query, contract-typed response (`PortfolioRiskMetrics`).
- [x] `src/services/riskMetrics.test.ts` (40 tests) + `src/routes/risk-metrics.test.ts` (9 tests). 227 wallets tests green; build green.

### 30.7 — Risk tests
- [ ] Withholding-rule and empty-history tests.

### 30.8 — Dividends composition
- [ ] Dividends composition within holding windows.

### 30.9 — Calendar composition
- [ ] Calendar composition.

### 30.10 — Compare enrichment
- [ ] Compare enrichment from instruments metrics.

### 30.11 — Summary-metrics / income source switch
- [ ] Wire "Based on" sub-option (External Capital vs Cost Basis) for non-TWR modes (deferred per D49).
- [ ] Positions selector narrowing — pass position subset to backend analytic series (deferred per D49).

### 30.12 — Cluster cutover
- [ ] Homelab ingress paths → `portfoliost-wallets:3000`.
- [ ] Separated snapshot Kubernetes Jobs (D11 job-pod pattern, not in-process scheduler).

### 30.13 — Live verification
- [ ] `/__meta`, CRUD + analytics through host; e2e green.

### 30.14 — Closeout
- [ ] plan/proposal status marks; retire `mocks/portfolios/index.js`; docs sweep.

---

## 31. Labels (proposal `docs/proposals/labels.md`, D65–D72)

- [x] **31.1 Contract** — `Label`/`LabelInput`/`SetLabelsRequest` schemas + `labels` arrays on `Position`/`Transaction`/`CashTransaction`/`RecentCashTransaction` + 7 endpoints (GET/POST `/labels`, PATCH/DELETE `/labels/{id}`, POST set-labels for position/portfolio-tx/wallet-tx) + `labels` query param on 4 listing endpoints in `openapi.yaml`. Published `@marx2/contracts@1.6.10` (commit `cedfbd8`). Installed in wallets + regenerated `api-types.d.ts`.
- [x] **31.2 Backend: migration** — `labels`, `position_labels`, `transaction_labels`, `wallet_transaction_labels` tables + indexes in `src/db/schema.ts`; `drizzle/0004_silky_gorgon.sql`; fixed stale snapshot chain (commit `48c8017`).
- [x] **31.3 Backend: labels CRUD** — `src/routes/labels.ts` GET/POST/PATCH/DELETE `/labels` with zod validation, 409 on duplicate name, 404 on foreign label (D24 scoping), `nextPaletteColor()` auto-assign (D66).
- [x] **31.4 Backend: set-labels + serialization** — `src/routes/position-labels.ts`, `transaction-labels.ts`, `wallet-transaction-labels.ts` (replace semantics, D67/D68); shared `src/services/labels.ts`; serialize `labels` in `positionWire`/`serializeTx` (portfolio-transactions), `history.ts` wallet-tx/recent-transactions serializers, `transactions.ts` `serializeTx` (`labels: []`).
- [x] **31.5 Backend: filtering** — `?labels=` comma-separated AND filter (entity must have all labels) wired into portfolio-transactions (positions + tx + cross-portfolio), history.ts (wallet-tx + recent-transactions) via shared `attachLabelCondition`/`entityIdsWithAllLabels`.
- [x] **31.6 Backend: tests** — `src/routes/labels.test.ts` (19 tests): CRUD + palette wrapping, unique-name 409 (fixed PGlite `err.cause` detection), D24 scoping 404s, replace semantics on all three entity types, alphabetical sorting, AND filtering. 246 wallets tests green.
- [x] **31.7 SPA: contract types** — install bumped `@marx2/contracts`, run `gen:types`.
- [x] **31.8 SPA: labelColors utility** — shared palette mapping (hex to Tailwind class pairs).
- [x] **31.9 SPA: LabelBadge component** — shared badge component with `+N` overflow.
- [x] **31.10 SPA: LabelManager dialog** — CRUD UI for labels.
- [x] **31.11 SPA: set-label popover** — per-row label assignment in holdings + transactions + cash-transactions tables.
- [x] **31.12 SPA: label filter** — multi-select chip filter in `PortfolioHoldingsTab` + `TransactionsTable` + `CashTransactionsView`.
- [x] **31.13 SPA: tests** — vitest unit tests for components + Playwright e2e for full flow.
- [x] **31.14 Integration test** — docker-compose end-to-end: create label → assign to position/transaction/cash-transaction → verify filter.

---

## 32. Portfolio-card sparkline: period buttons "don't work" (investigation)

## Symptom

The small performance chart on the main page (`src/modules/portfolios/PortfolioCard.vue`) never renders — it stays on "Loading chart... / Historical data is loading" regardless of the period button clicked (`1W/1M/3M/6M/1Y/2Y/ALL`). The full chart in `PortfolioPerformanceTab.vue` is affected the same way (shows "No analytics available") — it only appears to "work" because its buttons/state react; the chart itself is empty too.

## What the buttons actually do (verified live)

- The card's `@click.stop` on the button row (line 257) does prevent the click from bubbling to the card's `goToDetail` — no navigation happens.
- `changeTimeframe()` (line 92) sets the local `timeframe` ref and calls `loadChart()` → `getPortfolioAnalytics(id, timeframe)`.
- Network shows the correct per-period requests fire, e.g. `?timeframe=6M` then after clicking `1W` → `?timeframe=1W`. The active-button highlight (`bg-blue-50 text-blue-700`) also updates.
- So the frontend is fine; the chart is empty because the backend always returns:
  `{"timeframe":"1W","backfillStatus":"pending","performance":{"timeSeries":[]},...}`.

## Backend root cause

`/api/portfolios/:id/analytics` is served by **`portfoliost-wallets`** (gateway `API_PORTFOLIOS_URL=http://wallets:3000`), not the example-service-mock. In `src/routes/portfolios.ts` the endpoint returns "pending + empty" when `value_snapshots` has < 2 rows and triggers a fire-and-forget backfill (`src/services/backfill.ts` `runBackfill`).

The backfill **computes** a full daily series but the bulk INSERT **fails**. From `portfolios.portfolio_backfill_metadata.error_message`:

```
Failed query: insert into "portfolios"."value_snapshots"
("portfolio_id","snapshot_date","value","invested","net_flow",
 "cumulative_twr","cumulative_mwr","cumulative_simple") ...
```

The running DB's `value_snapshots` table has only 5 columns (`portfolio_id, snapshot_date, value, invested, net_flow`) — the 3 return-type columns from migration `0003_return_columns.sql` are missing:

```sql
ALTER TABLE "portfolios"."value_snapshots" ADD COLUMN "cumulative_twr" numeric(20, 8);
ALTER TABLE "portfolios"."value_snapshots" ADD COLUMN "cumulative_mwr" numeric(20, 8);
ALTER TABLE "portfolios"."value_snapshots" ADD COLUMN "cumulative_simple" numeric(20, 8);
```

## Why migration 0003 was skipped (drizzle ordering bug)

`drizzle/meta/_journal.json` entry `idx: 3` (`0003_return_columns`) has `when: 1757060000000` (≈ Sep 2025) while `0004_silky_gorgon` has `when: 1788717226995`. In `drizzle-orm/pg-core/dialect.cjs` the migrator applies a migration only when:

```js
if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) { ... }
```

`lastDbMigration` is picked by `order by created_at desc limit 1` = 0004. Since `0003.folderMillis < 0004.created_at`, 0003 is **never applied** on any DB that already has 0004. A fresh DB applies everything in idx order so it would work there — only existing/already-migrated DBs hit this.

`drizzle_wallets.__drizzle_migrations` confirms: hashes for 0000 (`811e90e9`), 0001 (`308f9a83`), 0002 (`df934ed4`), 0004 (`19e7157b`) are present; 0003 (`e942fb64`) is absent.

## How to fix

- [ ] Fix `drizzle/meta/_journal.json`: set `0003_return_columns`.`when` to a value **greater** than `0004_silky_gorgon` (`1788717226995`) so the migrator picks it up (e.g. `1789000000000`).
- [ ] Re-apply migrations: `docker exec portfoliost-wallets npm run db:migrate` (wallets entrypoint runs this on every start, so `docker compose restart wallets` also works). Verify `\d portfolios.value_snapshots` then includes `cumulative_twr/mwr/simple`.
- [ ] Re-trigger backfill: backend fires it automatically on the next `/analytics` call because the stored status is `failed` (not `pending`) and still `n < 2`; a page reload suffices. Confirm `value_snapshots` is populated and `portfolio_backfill_metadata.status = complete`.
- [ ] Verify in browser: the sparkline renders on `/en/investments` and period buttons switch the series; `PortfolioPerformanceTab` chart populates too.
- Note: no mock seeding needed — the example-service-mock `portfolio_analytics_*.json` files are not used by this endpoint; data comes from transactions → backfill → `value_snapshots`.

---

## 33. SEC investor-relations wiring (code done 2026-09-07; deploy pending)

Goal: surface the SEC data now exposed by openst/cachest (added 2026-09-07) in the
SPA Research → Investor Relations tab, replacing the current stub/dummy transcript
with real SEC content. Nginx ingress is already correct (routes `/api/instruments`
→ `portfoliost-instruments`; no cluster change needed).

## Background / status (verified)

`docs/openst-coverage.md` (section "Covered by openst today" + "Next steps") is the
ground truth. openst now exposes via `openbb-sec==1.6.7`, all keyless (SEC EDGAR):

| Instrument need | openst route | cachest proxy | OpenBB cmd |
|---|---|---|---|
| insider trading (Form 4) | `/equity/ownership/{t}` | `/ownership/{t}` | `ownership.insider_trading` |
| institutional (Form 13F) | `/equity/ownership/institutional/{t}` | `/ownership/institutional/{t}` | `ownership.form_13f` |
| SEC filings (10-K/10-Q/8-K) | `/equity/filings/{t}` | `/filings/{t}` | `fundamental.filings` |
| MD&A text | `/equity/fundamentals/{t}/mda` | `/fundamentals/{t}/mda` | `fundamental.management_discussion_analysis` |

Instruments backend adapter `src/adapters/cachest.ts` **already has** `fetchFilings`,
`fetchMda`, `fetchInsiderTrading`, `fetchInstitutionalOwnership` (added previously)
but **nothing consumes them yet** — no route/service imports them.

Current instruments IR code (no SEC yet):
- `src/routes/instruments.ts:749` `GET /:symbol/investor-relations` → derives events
  from real reported quarters via `toInvestorRelations()` (real data, but `audioUrl`
  is always null).
- `src/routes/instruments.ts:772` `GET /:symbol/investor-relations/:eventId/transcript`
  → `toIrTranscript()` returns a **structured empty stub** (`transcript: []`,
  `participant: []`).

SPA (`portfoliost` repo):
- `src/modules/instruments/ResearchInvestorRelations.vue` lists events; renders an
  "Audio" link only when `event.audioUrl` exists (real backend → never shown) and an
  "Open" link when `event.url` exists (never set). **No transcript/document view.**
- `src/api/instruments.ts:121` `getTranscript()` is defined but **never called** by
  any component (return type is `Promise<unknown>`, not typed to contract).
- `src/modules/instruments/ResearchOverview.vue:334` "Open transcript" button just
  routes to `research-ir` (the list), not to a transcript view.
- Mock dummy data lives in `mocks/shared/data/raw/ir_transcript.json` (full Q&A
  transcript for AAPL) and `ir_events_aapl.json`; mock server
  `mocks/instruments/index.js:245` serves them. This is the "dummy data" to replace.

## Design decision (A chosen; confirmed with owner)

**Approach A — map filings+MD&A into existing shapes.** SEC filing events
(10-K/10-Q/8-K/20-F/6-K) are added as `InvestorRelationEvent` entries alongside the
derived earnings calls; the transcript endpoint serves MD&A text. Contract additions:
`reportUrl`+`formType` on the event, `body` on the transcript (v1.6.11), and typed
`participant`/`transcript` items (v1.6.12). Form 4/5/144 filings are excluded to keep
the list investor-relevant.

## Steps

1. [x] Decide approach A vs B with the owner; if shapes change, edit
   `portfoliost-contracts/openapi.yaml` (`InvestorRelationEvent` / `IRTranscript`),
   push → CI bumps `@marx2/contracts` → `NODE_AUTH_TOKEN=$(gh auth token) npm install
   @marx2/contracts@<new>` in `portfoliost` and `portfoliost-instruments` → run
   `npm run gen:types` in both → commit updated `package-lock.json` +
   `generated/api-types.d.ts`. **→ Approach A chosen. Two bumps: v1.6.11 (event
   `reportUrl`/`formType`, transcript `body`) and v1.6.12 (typed `participant`/
   `transcript` items).**
2. [x] **Instruments backend**: import `fetchFilings`/`fetchMda` from
   `src/adapters/cachest.ts`; extend `toInvestorRelations()` (or a sibling translator
   in `src/adapters/translate.ts`) to blend SEC filing events. Catch cachest
   `UpstreamError`/404 gracefully (filings may be missing for some tickers).
   **→ `secFilingEvent()` keeps 10-K/10-Q/8-K/20-F/6-K only (Form 4/5/144 excluded);
   output capped at 48 events.**
3. [x] **Instruments backend**: extend `toIrTranscript()` (or new fn) to return real
   MD&A text from `fetchMda()` instead of the empty stub; map into the `IRTranscript`
   contract shape. Wire the `/investor-relations/:eventId/transcript` route to call
   `fetchMda`. **→ year/quarter derived from date-style event ids, else from the MD&A
   record (`calendar_year`/`calendar_period`), never from accession numbers.**
4. [x] **Instruments backend tests** (`src/routes/instruments.test.ts`): mock
   `fetchFilings`/`fetchMda` in the cachest mock (lines ~27) and add coverage for the
   new event blend + real transcript.
5. [x] **SPA**: build a transcript/document view component (e.g.
   `ResearchInvestorRelationsTranscript.vue` or a route) that calls `getTranscript()`
   (type it against `components["schemas"]["IRTranscript"]`) and renders participants
   + transcript/speaker blocks (see `ir_transcript.json` for the shape to render).
6. [x] **SPA**: in `ResearchInvestorRelations.vue`, link each transcript/filing event
   to the new view (replace the dead Audio/Open links). In `ResearchOverview.vue`,
   point "Open transcript" at the new view.
7. [x] **SPA tests**: vitest for the new components + API; update mock server if the
   contract shape changed; add Playwright e2e for IR → open transcript.
8. [x] **Verify full portfoliost suite** (`npm run build`, `npm run test`,
   `npm run test:mock`, `npm run test:e2e`) + instruments (`npm run build`/`test`).
   **→ Also fixed `openst/src/get_mda` (pivot long-frame MD&A; b4e10e2) and purged
   stale `sec_mda:*` / `fundamentals:*:mda` Redis keys. E2E research spec: 12 passed,
   1 data-dependent skip. Pre-existing unrelated e2e failures in auth.spec.ts and
   portfolios.spec.ts (heldings-grouping / add-position) reproduced on clean tree.**
9. [x] **Commit per repo** (`portfoliost-instruments`, `portfoliost`; only
   `portfoliost-contracts` if shapes changed) → GHA rebuild → bump helmrelease tags
   in homelab for the changed images → deploy (homelab-deploy skill).
   **→ Commits pushed: contracts 2a05e85 (v1.6.12), openst b4e10e2,
   portfoliost-instruments d33033f, portfoliost e6940f5. GHA image rebuild +
   homelab deploy still pending.**
10. [x] **Verify in cluster**: open `/en/research/AAPL.US/investor-relations`; confirm
   SEC filings show and opening one shows real MD&A content.

---

## 25. D80 / D81 / D82 — Catalyst bond profiles, asset-class routing, contract patch

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) —
closes remaining open D-items: Catalyst corporate-bond profile metadata (D80), asset-class
routing in `price-bars` for `fund/crypto/bond/corp_bond` (D81), `InstrumentType` contract
widening + admin surface (D82).

D77 wired Catalyst OHLCV; D79 wired retail-savings-bond OHLCV. Independent of §23/§24.

Repos touched: `openst`, `cachest`, `portfoliost-instruments`, `portfoliost-admin`,
`@marx2/contracts`.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 25.1 — HTML fixture capture: `obligacje.pl` bond detail + search pages

- [x] `curl` `obligacje.pl/pl/obligacja/BST0327` → save to
      `openst/tests/fixtures/obligacje_bond_profile_BST0327.html`.
- [x] `curl` `obligacje.pl/pl/narzedzia/wyszukiwarka-obligacji-notowanych` (page 1) →
      save to `openst/tests/fixtures/obligacje_bond_catalogue_page1.html`.
- [x] Record: CSS selectors for emitent, ISIN, market, nominal, coupon type, margin,
      maturity; pagination URL pattern; total bond count (≈936).
- [x] Commit: `test(openst): fixture HTML for obligacje.pl bond profile + catalogue (D80)`.
  - Recorded in `openst/tests/fixtures/obligacje/README.md`: detail fields in
    `table.table-9`, maturity under `Wązne daty → Dzień wykupu`; catalogue is a
    **single server-rendered page** (client-side DataTables, no pagination) with
    937 rows / 932 unique symbols; margin is a dedicated catalogue column, not on
    the detail page (it lives in the coupon-type text).

### 25.2 — `CorporateBondProfileFetcher` in `openbb_biznesradar`

- [x] `openst/plugins/openbb_biznesradar/fetchers/corp_bond_profile.py`: scrapes
      `obligacje.pl/pl/obligacja/{symbol}`; returns emitent, ISIN, market, nominal,
      coupon type, margin, maturity, `asset_type="corp_bond"`, `country="PL"`,
      `currency="PLN"`.
- [x] `EquityInfoFetcher.__call__` dispatches on Catalyst pattern `[A-Z]{3}\d{4}(\.WA)?$`
      → new fetcher; all other symbols keep existing path.
- [x] Unit tests against fixture; regression: existing profile tests unchanged.
- [x] Full openst compose suite passes.
- [x] Commit: `feat(openbb_biznesradar): CorporateBondProfileFetcher (D80)`.
  - Implemented as `openbb_biznesradar/obligacje.py` (scraper) +
    `openbb_biznesradar/models/corp_bond_profile.py` (fetcher), matching the
    plugin's existing layout; bond-specific fields ride as provider-specific
    extras, same pattern as `openbb_obligacje` (D79).
  - Dispatch implemented on `EquityProfileFetcher.fetch_data` — the OpenBB router
    entry point (`Fetcher` has no `__call__`; per OpenBB provider docs the router
    calls `fetch_data`). Pattern extended with an optional `-K` suffix
    (`BOS0735-K`). The `[A-Z]{3}\d{4}` shape is ambiguous with savings-bond codes
    (ROD1033/EDO0936), so the dispatch probes the bond page and falls back to the
    biznesradar probe on 404/error; savings bonds are unaffected — their profile
    lives on `/fixedincome/profile`, not the biznesradar provider.
  - Suite now: 247 (openst) + 69 (openbb_biznesradar) + 53 (openbb_obligacje),
    all green; Dockerfile test stage runs the plugin suites as separate pytest
    invocations (a combined run hits a `tests` package-name collision).

### 25.3 — openst smoke + cachest route + corp-bond catalogue

- [x] `docker compose up -d` openst; verify `/equity/profile/BST0327` →
      `asset_type=corp_bond`; regression `/equity/profile/NNEP25.TFI` unchanged.
- [x] Add `OPENST_CORP_BOND_PROFILE` to `cachest/config.yaml` (TTL 24h);
      `test_real_config_has_corp_bond_profile_route`; full cachest suite passes.
- [x] `openst/src/importers/corp_bond_catalogue.py`: scrapes all pages of
      `obligacje.pl/pl/narzedzia/wyszukiwarka-obligacji-notowanych`; emits
      `tickerref-sync.ts` CSV format with `asset_type=corp_bond`. One-shot k8s Job;
      unit tests with `obligacje_bond_catalogue_page1.html` fixture.
- [x] `npm run test` passes.
- [x] Commit: `feat(openst+cachest+instruments): D80 corp-bond profile + catalogue`.
  - Profile smoke (live, 2026-09-19): **`/corp-bond/profile/BST0327`** →
    `asset_type=corp_bond, issuer=Best S.A., isin=PLBEST000333, market=GPW RR,
    nominal 100 PLN, maturity 2027-03-07, currency=PLN`. A dedicated
    `/corp-bond/profile/{symbol}` endpoint was added (rather than reusing
    `/equity/profile`) so the bond path never touches fmp/yfinance and so cachest
    can give it its own 24h route. `/equity/profile/BST0327` **also** now returns
    the corp-bond profile (biznesradar dispatch) and `/equity/profile/NNEP25.TFI`
    is unchanged (`ING Emerytura 2025`, `hq_country=PL`); savings bonds stay on
    `/fixedincome/profile` (verified `ROD1033` → 404 on the equity path).
  - Catalogue: the search page is a **single server-rendered page** (no
    server-side pagination) — 937 unique bonds (5 hyphenated: `BOS0735-K` etc.).
    Importer emits `WSE::{SYMBOL}` rows; ISIN is not on the catalogue page so that
    column is empty (detail page only).
  - Compose suites: openst 261 + biznesradar 69 + obligacje 53; cachest 78
    (incl. `test_real_config_has_corp_bond_profile_route`); instruments 225 — all
    green. One-shot k8s Job wiring for the catalogue importer is homelab work,
    tracked in 25.6 closeout (not yet deployed).

### 25.4 — D81: asset-class routing in `price-bars`

- [x] `portfoliost-instruments/src/services/price-bars.ts`: `getPriceBarSeries` accepts
      `assetType`; branches: `crypto` → `fetchCryptoOhlcv`; `bond` →
      `fetchBondOhlcv` (hits `OPENST_BOND_OHLCV`); `corp_bond`/`fund` → existing
      equity `fetchOhlcv`; `stock`/`etf` → unchanged stooq-overflow path.
      (implemented as an `upstreamFor(assetType, symbol, …)` router +
      `normalizeAssetType`/`lookupAssetType` helpers; the stooq split-boundary check
      now runs **only** for stock/etf — crypto/bond/corp_bond/fund write straight
      to overflow and never touch stooq)
- [x] Add `fetchBondOhlcv` to `src/adapters/cachest.ts`.
      (`fetchBondOhlcv` already existed from D79; the **new** adapter is
      `fetchCryptoOhlcv` → `cachest /crypto/ohlcv/{pair}`)
- [x] Route handler looks up `ticker_reference.asset_type`; falls back to `stock`.
      (lookup is inside `getPriceBarSeries` via `ticker_reference` on the bare
      venue-free ticker; an unlisted symbol resolves to `stock`, so the equity path
      is byte-for-byte unchanged — cluster only has Stock/ETF today, so this is a
      no-op until the bond/corp_bond/crypto rows are synced by the 25.3 Job)
- [x] Unit tests: correct adapter per `assetType`; stooq skipped for crypto/bond/corp_bond.
      (12 new tests in `price-bars.test.ts`: `upstreamFor` per class,
      `normalizeAssetType`, `lookupAssetType`, and `getPriceBarSeries` routing incl.
      the stock fallback + no-split-candidate guard for corp_bond)
- [x] Compose stack smoke: ROD1033, BST0327.WA, BTC-USD price-bars end-to-end.
- [x] `npm run test` + `npm run test:stack` pass.
  (instruments has no standalone `test:stack`/compose file — the compose stack is
  the full `portfoliost` stack. Smoke ran a focused openst+cachest+instruments
  compose: **BTC-USD** → `/crypto/ohlcv/BTC-USD` 200 (4315 bars to overflow),
  **BST0327** → `/ohlcv/BST0327` biznesradar 200 (408 bars), **AAPL** →
  stooq-overflow path (regression intact), **ROD1033** → `/fixedincome/ohlcv`
  bond leg (404 only because the smoke openst has no `openst.bond_series` data).
  `npm run build` + `npm run test` (236) all green.)
- [x] `npm run test` + `npm run test:stack` pass.
- [x] Commit: `feat(instruments): asset-class routing in price-bars — D81`.

### 25.5 — D82: contracts patch + admin surface

- [x] `@marx2/contracts` `openapi.yaml`: add `fund | bond | corp_bond | crypto` to
      `InstrumentType`; patch bump; reinstall; `gen:types`.
- [x] `src/adapters/translate.ts`: add `corp_bond → CORP_BOND`, `fund → FUND`
      (BOND and CRYPTO already at `translate.ts:289`).
- [x] portfoliost-admin: read-only table for `openst.bond_series` (symbol, name,
      issue/maturity, rate_rule, margin; row count) and `openst.cpi_12m` (24 rows;
      staleness warning > 40 days).
- [x] `npm run build` + `npm run test` + `npm run test:mock` pass.
- [x] Commit: `feat(contracts+admin): InstrumentType widening + bond/CPI admin (D82)`.
  - Result (2026-09-19): `InstrumentType` enum (STOCK, ETF, BOND, CRYPTO, FUND,
    CORP_BOND) added to `InstrumentDetail.type` + `SearchResult.type`; CI published
    `@marx2/contracts@1.6.26`. Instruments: `toInstrumentType` helper, detail/search
    mappings widened, contracts bump + gen:types (commit `adb69c9`; 239 tests green).
    Admin: read-only `GET /api/admin/bond-catalogue/bond-series` + `/cpi` over the
    shared DB's `openst` schema (commit `3b2078e`; 77 tests green incl. 5 PGlite).
    SPA: `BondCatalogueView.vue` + admin tab (commit `b5c51b3`; build clean,
    293 unit + 190 mock green).

### 25.6 — Closeout D80/D81/D82

- [x] Update `instruments-provider-module.md`: D80, D81, D82 done with date.
- [x] Update `openst-coverage.md`: `CorporateBondProfileFetcher`; D81 routing table.
- [x] Archive to `plan-archive.md`.
- [x] Commit: `chore: D80/D81/D82 closeout`.
  - Result (2026-09-19): proposal + coverage docs updated; §25 archived here.
    Known carry-over (homelab, not code): the 25.3 catalogue importer
    (`openst/src/importers/corp_bond_catalogue.py`, 937 bonds) is a one-shot
    k8s Job not yet deployed — cluster `ticker_reference` still has Stock/ETF
    rows only, so D81 routing is a no-op for bond/corp_bond/crypto until it runs.
    **RESOLVED 2026-09-19 (plan §35):** deployed as the daily CronJob
    `portfoliost-instruments-corpbondsync` (04:45 UTC); cluster `ticker_reference`
    now carries 937 `corp_bond` rows and D81 routing dispatches for them.

---

## 35. Deploy the corp-bond catalogue sync — D80 carry-over (plan §25.3 / §25.6)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) —
D80 "Catalyst bond catalogue". The 25.3 one-shot catalogue importer
(`openst/src/importers/corp_bond_catalogue.py`) was built and tested but never
deployed: the cluster `ticker_reference` still holds Stock/ETF rows only, so the
D81 price-bars routing (25.4) is a no-op for `corp_bond`/`bond`/`crypto`
(`asset_type` lookup falls back to `stock` for unlisted tickers).

Context: the importer scrapes a single server-rendered `obligacje.pl` catalogue
page (937 unique bonds) and emits a `tickerref-sync` CSV with `asset_type`
pinned to `corp_bond`, listing keys `WSE::{SYMBOL}`. **Periodicity — daily.**
The plan (D80) already specified "the daily CronJob re-imports to pick up newly
listed bonds"; the scrape is one page fetch, cached in openst Redis 24h, and the
upsert touches only `WSE::` keys, so a daily 04:45 UTC pass (staggered after the
04:30 openst bond/CPI imports) is cheap and idempotent. Weekly adanos tickersync
(04:30 Mon) is untouched — the two CSVs cover disjoint listing keys.

Repos touched: `openst` (new HTTP endpoint over the existing importer — **in
progress: route + 3 tests written, suite pending**), `cachest` (route + TTL),
`portfoliost-instruments` (new `corp-bond-catalogue-sync` script reusing
`syncTickerReference`), homelab (new `corpbondsync` CronJob in the instruments
helmrelease via app-template `type: cronjob`; tag bumps for all five images).
No contracts change (no wire shape changes). No nginx change (no new path
prefix at the gateway — the new endpoints live behind the existing
`/api/instruments`-adjacent cachest URL space and are consumed job-side).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.
Step order follows the provider tier (openst → smoke → cachest → instruments →
stack → deploy).

---

### 35.1 — openst: `GET /corp-bond/catalogue` (tickerref CSV)

- [x] `src/main.py`: `@app.get("/corp-bond/catalogue")` → lazy import
      `fetch_catalogue` + `to_tickerref_csv` from `src/importers/corp_bond_catalogue`;
      Redis-cached under key `corp_bond_catalogue` (plain string, 24h default TTL —
      same `_cache` as profile endpoints); 404 when zero rows; `text/csv` response.
      Lazy import keeps the scraper module out of service startup.
- [x] Tests in `tests/test_main.py`: 200 + `text/csv` + rows on fetch; 404 on empty
      catalogue; cache-hit path returns stored CSV without re-fetch.
- [x] Full openst pytest suite green (compose test stage).
- [x] Commit: `feat(openst): /corp-bond/catalogue CSV endpoint (D80 25.3 deploy)`.
  - Result: 261 (openst) + 69 + 53 green. Compose smoke: `curl /corp-bond/catalogue` →
    HTTP 200 `text/csv`, 937 `WSE::` rows all `asset_type=corp_bond`; second call
    served from Redis (1.5 ms vs 1021 ms first).

### 35.2 — openst standalone smoke

- [x] `docker compose up -d --build`; `curl /corp-bond/catalogue` → HTTP 200,
      `text/csv`, header + ~937 `WSE::` rows, `asset_type=corp_bond`; second call
      served from Redis (log/cache HIT).
- [x] Commit: none (verify-only step). (Ran on the portfoliost full compose stack —
      same openst runtime target — as part of 35.5.)

### 35.3 — cachest: `OPENST_CORP_BOND_CATALOGUE` route

- [x] `config.yaml`: route `/corp-bond/catalogue` → `http://openst:8080/corp-bond/catalogue`,
      `cache_ttl: 43200` (12h — half the openst TTL so the daily job always sees a
      fresh-enough scrape), same fetch timeouts as `OPENST_CORP_BOND_PROFILE`.
- [x] `test_real_config_has_corp_bond_catalogue_route`; full cachest suite green.
- [x] Commit: `feat(cachest): OPENST_CORP_BOND_CATALOGUE route (D80 25.3 deploy)`.
  - Result: 80 green. Noted: cachest re-serializes every proxied body as
    `PlainTextResponse` (content-type `text/plain`), so the instruments consumer
    accepts both `text/csv` (openst direct) and `text/plain` (via cachest).

### 35.4 — instruments: `corp-bond-catalogue-sync` script

- [x] `src/scripts/corp-bond-catalogue-sync.ts`: fetch
      `${CACHEST_URL ?? http://cachest:8080}/corp-bond/catalogue`, fail fast on
      non-200/non-text, sanity-check row count (>500 — a truncated scrape must not
      log as success and must not touch the DB), then `syncTickerReference(csv, db)`
      (existing exported helper — upserts on `listingKey`, touches only `WSE::` keys),
      log total. Exit-code-driven for k8s.
- [x] Unit tests (`corp-bond-catalogue-sync.test.ts`): CSV fetch failure → throw;
      empty/too-small CSV → abort with no DB writes; valid CSV → `syncTickerReference`
      called once; text/plain (cachest) accepted; non-text rejected.
- [x] `npm run build` + `npm run test` green.
- [x] Commit: `feat(instruments): corp-bond-catalogue-sync script (D80 25.3 deploy)`.
  - Result: 247 green.

### 35.5 — compose stack smoke (seeds local `ticker_reference`)

- [x] Full compose stack up; run `node dist/scripts/corp-bond-catalogue-sync.js`
      against the compose instruments DB; verify `ticker_reference` has ~937
      `WSE::` `corp_bond` rows.
- [x] End-to-end: `lookupAssetType` resolves `BST0327 → corp_bond` (the D81 price-bars
      leg that was a no-op now dispatches to the equity OHLCV path).
- [x] `npm run test` + e2e green.
  - Result: sync → "upserted 937 corp_bond rows"; DB `instruments.ticker_reference`
    has 937 `corp_bond` rows, `BST0327`/`WSE::BST0327` present. `lookupAssetType`:
    BST0327→corp_bond, BTC-USD→crypto, AAPL→Stock (ROD1033→null: savings bonds are
    a separate class not in this catalogue). price-bars e2e 3/3 (AAPL regression).
- [x] Commit: none (verify-only step).

### 35.6 — Cluster deploy (homelab)

- [x] Push `openst`, `cachest`, `portfoliost-instruments` → GHA green → `gh release list`
      verifies the real `v*` tags (never tag manually). (openst `v1.1.25`, cachest
      `v1.0.35`, instruments `v1.0.51`.)
- [x] homelab: bump `openst` (5 occurrences: app + 4 cronjobs), `cachest` (1),
      `portfoliost-instruments` (2: app + tickersync) to the new tags; add
      `corpbondsync` CronJob to the instruments helmrelease — app-template
      `type: cronjob`, `schedule: "45 4 * * *"`, `concurrencyPolicy: Forbid`,
      `command: ["node", "dist/scripts/corp-bond-catalogue-sync.js"]`,
      `DATABASE_URL` from `postgres-pfire-pguser-portfoliost` (same secret as
      `tickersync`), env `CACHEST_URL=http://cachest:8080`, resources 50m/128Mi
      → 512Mi. No KEDA/ingress changes (no new routes).
- [x] Commit + push homelab; Flux reconciles in ~1 min; `flux reconcile`/`kubectl`
      verify HelmReleased. (All three HelmReleases `READY=True`.
      **Drift found & fixed**: the cluster cachest config is a configmap at
      `cluster/apps/pfire/cachest/app/config/config.yaml` — it had drifted from
      the repo `cachest/config.yaml` (cluster DNS URL style) and was missing ALL
      corp-bond routes, so the first manual job 404'd. Added
      `OPENST_CORP_BOND_PROFILE` + `OPENST_CORP_BOND_CATALOGUE` to the configmap
      (`openst.pfire.svc.cluster.local` style, same TTLs); stakater configmap
      reloader restarted cachest.)
- [x] Trigger the CronJob once (`kubectl create job --from=cronjob/...
      corpbondsync-manual`), check logs: rows synced. ("upserted 937 corp_bond
      rows into ticker_reference".)
- [x] Verify in cluster: `ticker_reference` corp_bond row count ~937; spot-check
      `BST0327` row. (937 `corp_bond` rows; `BST0327 | Best S.A. | corp_bond |
      WSE::BST0327`. CronJob `portfoliost-instruments-corpbondsync` live, daily
      04:45 UTC, `v1.0.51` image.)
- [x] Commit: none (deploy verified by the bump + configmap commits).

### 35.7 — Closeout

- [x] Update `instruments-provider-module.md` (D80 catalogue note: deployed, daily
      CronJob `corpbondsync`) + `openst-coverage.md` (catalogue endpoint row).
- [x] Mark the §25.6 carry-over note resolved (plan-archive.md, one-line addendum).
- [x] Archive §35 to `plan-archive.md`.
- [x] Commit: `chore: D80 corp-bond catalogue sync deploy closeout`.
  - Result (2026-09-19): full stack deployed — openst `v1.1.25`, cachest `v1.0.35`
    (+ cluster configmap drift fix: corp-bond routes were missing there),
    instruments `v1.0.51`; daily CronJob `portfoliost-instruments-corpbondsync`
    live, manual run upserted 937 rows; D81 price-bars dispatch now resolves
    corp_bond in the cluster. §25.6 carry-over closed.
