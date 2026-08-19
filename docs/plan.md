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

## portfoliost-backend — Database Layer (Drizzle + SQLite)

Backend lives at `../portfoliost-backend/`. See `docs/proposals/database-drizzle-sqlite-postgres.md`.

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
