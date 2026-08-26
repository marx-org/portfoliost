# Proposal: Admin module (`portfoliost-admin`)

**Status**: Implemented
**Date**: 2026-08-25
**Builds on**: [backend-topology.md](backend-topology.md) (D1–D11), [wallets-module.md](wallets-module.md) (D16–D24), [fees-and-custom-fx.md](fees-and-custom-fx.md) (D25–D41), [MODULARISATION.md](../MODULARISATION.md)
**Scope**: admin panel as a backend module + in-app SPA routes. Surfaces system versions, FX rate data, and registered OIDC users for operators. Gated by OIDC group membership (`portfoliost_admin`). No database — reads data through module APIs and OIDC UserInfo.

## Context

Today there is no admin surface. System health (service versions, FX rate freshness, registered users) is invisible without `kubectl` + database access. Example service has no admin panel either, so this is a net-new capability. The admin module follows the established modularisation pattern: separate repo, nginx gateway route, Hono + jose stack. It owns no database — all data comes through other modules' APIs and the OIDC provider.

The user profile already carries `groups: string[]` from the OIDC token (auth proposal, scope `openid profile email groups`). The `portfoliost_admin` group is the gate. No admin UI is visible to non-admin users.

### D42 — module identity (per MODULARISATION.md)

| Dimension | Value |
| --- | --- |
| Module name | `admin` |
| Repo | `Marx2/portfoliost-admin` |
| Image | `ghcr.io/marx2/portfoliost-admin` |
| Compose service / container | `admin` |
| K8s HelmRelease/controller | `portfoliost-admin` |
| Env key | `API_ADMIN_URL` |
| Postgres schema | none (module owns no tables) |
| Stack | Hono + jose (copy users-auth skeleton, no Drizzle needed initially) |
| Standard routes | `/health`, `/__meta`, `/internal/verify` |

Gateway routes `/api/admin/*` → `API_ADMIN_URL`. Auth identical to other modules (JWT JWKS validation).

### D43 — SPA architecture (separate app, same shell)

The admin UI lives in the **same `portfoliost` repo** (not a separate SPA) to reuse the existing layout, Tailwind config, Pinia stores, and `@/api/client.ts`. It is a set of Vue routes under `/en/admin/*` gated by group membership. Rationale: keeping one SPA avoids duplicating auth, theme, layout, and API client plumbing. The admin routes are lazy-loaded and tree-shaken from the production build via a Vite `import()` split — non-admin users never download the admin chunks.

An alternative (fully separate `portfoliost-admin` SPA in its own repo) was rejected because it would duplicate the auth flow, layout, theme, API client, and Tailwind config with no functional benefit — the admin panel is small and shares 95% of the shell.

### D44 — admin route structure

```
/en/admin                  → redirect to /en/admin/system
/en/admin/system           → SystemInfoView (versions dashboard)
/en/admin/currencies       → CurrencyRatesView (FX rate list)
/en/admin/users            → UsersView (OIDC user list)
```

All admin routes carry `meta: { requiresAuth: true, admin: true }`. The router guard checks `auth.user?.groups` for `portfoliost_admin` before allowing navigation. Non-admin users hitting `/en/admin/*` directly are redirected to `/en/investments`.

### D45 — sidebar admin entry

A new `Admin` item appears in `SidebarNav.vue` between the main nav and the bottom section, **only when** `auth.user?.groups` includes `portfoliost_admin`. Rendered as a `<router-link to="/en/admin">` with an appropriate icon (cog/shield). Active state follows the same pattern as existing nav items.

```vue
<router-link
  v-if="isAdmin"
  to="/en/admin"
  class="block rounded-lg px-3 py-2 text-sm font-medium ..."
>
  Admin
</router-link>
```

The `isAdmin` computed reads from the auth store — no extra API call.

### D46 — System Versions (first screen)

**Endpoint**: `GET /api/admin/system/versions`

Returns the version of every deployed service by calling each module's `GET /__meta` (D4 convention) and aggregating results. The admin backend acts as a collector:

```
admin backend
  ├─ calls users-auth  GET /__meta  (internal, via API_USERS_AUTH_URL)
  ├─ calls wallets     GET /__meta  (via API_WALLETS_URL)
  ├─ calls instruments GET /__meta  (via API_INSTRUMENTS_URL)
  ├─ calls gateway     GET /__meta  (if applicable)
  └─ returns aggregated list
```

**Response shape**:

```jsonc
{
  "services": [
    { "service": "portfoliost-frontend", "version": "1.4.2", "impl": "real" },
    { "service": "portfoliost-users-auth", "version": "0.3.1", "impl": "real" },
    { "service": "portfoliost-wallets", "version": "0.2.0", "impl": "real" },
    { "service": "portfoliost-instruments", "version": "0.1.4", "impl": "real" },
    { "service": "portfoliost-admin", "version": "0.1.0", "impl": "real" },
    { "service": "cachest", "version": "0.1.2", "impl": "real" },
    { "service": "openst", "version": "0.0.8", "impl": "real" },
    { "service": "example-service-mock", "version": "1.0.0", "impl": "mock" }
  ],
  "fetchedAt": "2026-08-25T14:30:00Z"
}
```

If a service is unreachable, `version` is `"unreachable"` and `impl` is `"unknown"`. The frontend renders a status badge (green = real, yellow = mock, red = unreachable).

**Frontend**: `SystemInfoView.vue` — simple card layout, one row per service, no table sorting needed (small fixed list). Auto-refreshes every 30 seconds.

### D47 — wallets module: admin-facing FX rates endpoint

The admin module must not read the `wallets` schema directly. The wallets module exposes a new admin endpoint on its own API surface:

**Endpoint**: `GET /api/wallets/admin/fx-rates`

Requires valid JWT + `portfoliost_admin` group (enforced by wallets module middleware). This is a new route tag on the wallets module, scoped to admin use.

**Query parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | `1` | Page number (1-indexed) |
| `per_page` | int | `50` | Rows per page (max 200) |
| `sort_by` | string | `date` | Column: `date`, `base_currency`, `quote_currency`, `rate` |
| `sort_dir` | string | `desc` | `asc` or `desc` |
| `base_currency` | string | — | Filter by base currency (exact match) |
| `quote_currency` | string | — | Filter by quote currency (exact match) |
| `date_from` | string | — | ISO date, inclusive lower bound |
| `date_to` | string | — | ISO date, inclusive upper bound |

**Response shape** (from wallets module):

```jsonc
{
  "items": [
    { "date": "2026-08-25", "baseCurrency": "EUR", "quoteCurrency": "USD", "rate": 1.0832 },
    { "date": "2026-08-25", "baseCurrency": "EUR", "quoteCurrency": "PLN", "rate": 4.2810 }
  ],
  "pagination": { "total": 12450, "page": 1, "per_page": 50, "total_pages": 250 }
}
```

Wire fields use camelCase per D29. The admin backend proxies this response to the frontend — it adds no value other than routing through the admin API surface (`GET /api/admin/currencies/rates` → calls wallets internally → returns to SPA).

**Frontend**: `CurrencyRatesView.vue` — Tailwind table with:

- **Sortable column headers** (click toggles asc/desc/none, reuse the pattern from `PortfolioHoldingsTab.vue` lines 87–147)
- **Filter row** below headers: two `<select>` dropdowns for base/quote currency (fed by `/api/currencies`), two `<input type="date">` for date range
- **Pagination controls** at bottom: prev/next + page indicator (reuse example-service pattern)
- All sorting/pagination/filtering is server-side (10k+ rows expected)

### D48 — users-auth module: admin-facing users list endpoint

The admin module must not read the `users_auth` schema directly. The users-auth module exposes a new admin endpoint:

**Endpoint**: `GET /api/users/admin/list`

Requires valid JWT + `portfoliost_admin` group (enforced by users-auth module middleware).

Returns all registered user IDs with metadata from `user_preferences`. This is the **only** cross-boundary data the admin module needs from users-auth — the OIDC UserInfo call (D49) enriches it with identity fields.

**Query parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | `1` | Page number (1-indexed) |
| `per_page` | int | `50` | Rows per page (max 200) |
| `search` | string | — | Filter by user_id prefix (case-insensitive) |

**Response shape** (from users-auth module):

```jsonc
{
  "items": [
    {
      "userId": "00000000-...",
      "lastLogin": "2026-08-25T10:12:33Z",
      "createdAt": "2026-08-01T10:13:13Z"
    }
  ],
  "pagination": { "total": 3, "page": 1, "per_page": 50, "total_pages": 1 }
}
```

### D48b — admin backend: users aggregation endpoint

> **Amendment (2026-08-26, implemented)**: identity is **never stored in portfoliost**.
> Two earlier designs were rejected: (a) per-user OIDC UserInfo calls with a
> client-credentials token — `/userinfo` returns the *token subject's* identity and a
> client-credentials token has no user subject; (b) persisting identity into
> `users_auth.user_preferences` at token exchange — reverted by design decision
> (user data stays in PocketID). The implemented design: the admin backend merges
> users-auth rows (uuid + preference-row `createdAt`) with identity fetched **live**
> from the **PocketID Admin API** (`GET /api/users` with `X-API-KEY` of an admin API
> key; response includes email, names, `userGroups`, `isAdmin`). D49 is satisfied by
> the Admin-API-key option (static key in a Kubernetes Secret), not client
> credentials. Unconfigured/unreachable PocketID degrades identity fields to nulls.
> `lastLogin` is not available (PocketID exposes no such field on the user DTO) and
> was dropped from the surface.

**Endpoint**: `GET /api/admin/users`

The admin backend:

1. Calls `GET /api/users/admin/list` on the users-auth module (D48) to get user IDs + timestamps.
2. For each user ID, calls the OIDC provider's **UserInfo endpoint** (`GET /oauth2/userinfo`) with a server-side token (D49) to fetch profile details.
3. Caches results for 5 minutes to avoid repeated OIDC calls. Rate limiting at the nginx edge is available if needed.

Because user count is confirmed < 1000, on-demand fetch with caching is sufficient — no background sync job required.

**Response shape** (from admin backend, merged):

```jsonc
{
  "items": [
    {
      "id": "00000000-...",
      "email": "alice@example.com",
      "firstName": "Alice",
      "lastName": "Smith",
      "groups": ["portfoliost_user", "portfoliost_admin"],
      "lastLogin": "2026-08-25T10:12:33Z",
      "createdAt": "2026-08-01T10:13:13Z"
    }
  ],
  "pagination": { "total": 3, "page": 1, "per_page": 50, "total_pages": 1 }
}
```

`lastLogin` and `createdAt` come from users-auth (D48). Identity fields (`email`, `firstName`, `lastName`, `groups`) come from OIDC UserInfo. Fields not available from OIDC are `null`.

**Frontend**: `UsersView.vue` — Tailwind table with:

- **Client-side sort** (total users < 1000, confirmed) — reuses the sortable-column pattern
- **Client-side filter** — a single text input that filters across email, firstName, lastName
- **Group badges** — each group rendered as a `<span>` pill, `portfoliost_admin` highlighted
- **No editable actions** — read-only view (user management is PocketID's job)

### D49 — admin backend: internal token for OIDC calls

The admin backend needs to call the OIDC UserInfo endpoint server-side. This requires a token with appropriate scopes. Two options:

| Approach | Pros | Cons |
|----------|------|------|
| **Client credentials grant** (PocketID supports it) | Standard OIDC, no static secrets | Requires registering a second OIDC client for admin |
| **Admin API key** (static bearer token to PocketID admin API) | Simpler setup | Static secret, needs secret management |

Recommendation: **client credentials grant** (D49a). The admin backend registers as a confidential OIDC client (`portfoliost-admin`) and uses `client_id` + `client_secret` to obtain a token with `userinfo` scope. Credentials stored in a Kubernetes Secret, mounted as env vars.

### D50 — admin API authorization

All `/api/admin/*` endpoints require:

1. Valid JWT (same as every module)
2. `groups` claim containing `portfoliost_admin`

The admin backend validates both in a Hono middleware before any route handler. Non-admin JWTs receive `403 Forbidden` with `{ "error": "Admin access required" }`.

The gateway does **not** enforce admin auth — that is the admin module's responsibility. The gateway just routes `/api/admin/*` → `API_ADMIN_URL` like any other module.

### D51 — docker compose wiring

Add to `docker-compose.yml`:

```yaml
admin:
  build:
    context: ../portfoliost-admin
    dockerfile: Dockerfile
  environment:
    PORT: "3000"
    API_USERS_AUTH_URL: "http://users-auth:3000"
    API_WALLETS_URL: "http://wallets:3000"
    API_INSTRUMENTS_URL: "http://instruments:3000"
    OIDC_ISSUER_URL: "${VITE_OIDC_ISSUER_URL:-}"
    OIDC_CLIENT_ID: "${ADMIN_OIDC_CLIENT_ID:-}"
    OIDC_CLIENT_SECRET: "${ADMIN_OIDC_CLIENT_SECRET:-}"
  depends_on:
    - postgres
```

No `DATABASE_URL` — the admin module reads no database directly. All data comes through module APIs.

Add to `deploy/services.env`:

```
API_ADMIN_URL=http://admin:3000
```

Add to `gateway/default.conf.template`:

```nginx
location /api/admin/ {
    proxy_pass ${API_ADMIN_URL};
    # standard proxy headers
}
```

### D52 — no database schema for admin

The admin module owns no database tables. All data comes through module API calls (wallets for FX rates, users-auth for user IDs) and the OIDC provider (user identity). The admin schema is **not created** — the module follows the schema-per-module convention (D6) by simply not needing one. If the admin module later acquires its own data (audit logs, feature flags), a schema can be added at that point.

## Implementation order

| Step | Scope | Depends on |
|------|-------|------------|
| 1 | Scaffold `portfoliost-admin` repo (copy users-auth skeleton without Drizzle), docker compose wiring (D51), `__meta` endpoint | D42, D51 |
| 2 | Router + sidebar admin entry, group gate (D44, D45), empty shell views | D43, D44, D45 |
| 3 | System versions screen (D46) — backend collector + frontend card | D46 |
| 4 | Wallets module: admin FX rates endpoint (D47) + admin backend proxy + frontend table | D47 |
| 5 | Users-auth module: admin users list endpoint (D48) + admin backend OIDC enrichment (D48b) + frontend table | D48, D48b, D49 |
| 6 | Admin API authorization middleware on admin, wallets, users-auth (D50) | D50 |

## Risks / Considerations

- **OIDC UserInfo rate limiting**: PocketID self-hosted likely has no rate limiting, but the 5-minute cache (D48b) protects against abuse regardless. If rate limiting becomes a concern, it can be applied at the nginx edge without code changes.
- **User count scalability**: Confirmed < 1000 users. On-demand fetch with 5-min cache is sufficient. No background sync job needed.
- **Separate SPA was rejected** but could be revisited if the admin panel grows substantially (e.g., full CRUD for user management, audit logs, feature flags). For now the in-app admin routes are sufficient.
- **No admin write operations** in this proposal. The admin panel is read-only. User management stays in PocketID. Wallet/portfolio management stays in the main app. This keeps the scope small and avoids duplicating functionality.
- **Mock mode**: In docker compose without OIDC, the admin routes should still be accessible. The mock backend's auth endpoint can return `groups: ["portfoliost_admin"]` for the default user, and the admin backend can skip OIDC UserInfo calls (return mock user data instead).
- **Cross-module admin endpoints**: D47 and D48 introduce admin-scoped endpoints on the wallets and users-auth modules respectively. These are lightweight additions (query + paginate) that keep the schema-per-module boundary intact. Each module enforces its own admin auth middleware.
