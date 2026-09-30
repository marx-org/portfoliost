# Proposal: Auth Implementation — OIDC + PKCE with PocketID

**Status**: Implemented (session refresh pending — see §77 of `../plan.md`)
**Date**: 2026-08-18 · **Revised**: 2026-09-30

## Problem

Auth was originally fully mocked: the mock backend issued in-memory UUID tokens,
validated against static credentials (`demo@example.com` / `example-service-mock`), and
served static seed data for user profiles. This replaced that with real
authentication backed by PocketID (an OIDC provider with passkey login) running
in the cluster, while keeping local development self-contained.

## Architecture Overview

The auth backend lives in `../portfoliost-users-auth/` (sibling repo). It is the
only component that talks to PocketID; every other service just validates a
JWT.

### Routing: nginx ingress

Traffic is split by the **nginx ingress** in the `pfire` namespace. Each path
prefix is routed to the owning service:

| Path | Service |
|---|---|
| `/` | `portfoliost` (Vue SPA) |
| `/api/auth`, `/api/users` | `portfoliost-users-auth` |
| `/api/instruments`, `/api/logos`, `/api/currencies`, `/api/fx`, `/api/news` | `portfoliost-instruments` |
| `/api/wallets`, `/api/portfolios`, `/api/labels`, `/api/positions` | `portfoliost-wallets` |
| `/api/admin` | `portfoliost-admin` |

> **Historical note.** This routing originally went through KrakenD, with
> `/api/auth/*` and `/api/users/*` pointed at the real backend while everything
> else stayed on the mock. KrakenD has since been removed from the cluster
> entirely; nginx is the only router. Any KrakenD config, env var, or CORS
> reasoning below that predates this is obsolete.

### Two Deployment Modes

```
Docker Compose (local dev)              Cluster (production)
┌──────────────┐                        ┌──────────────┐
│ nginx (dev)  │                        │ nginx (pfire)│
└──────┬───────┘                        └───┬───┬───┬───┘
       │                                    │   │   │
       ▼                                    ▼   │   └──▶ mock backend
┌──────────────┐              users-auth  │       │        (seed data)
│ mock backend │                  wallets │       └──▶ instruments
│   (all)      │              instruments│
└──────────────┘                  admin  └──▶ wallets
```

**Docker Compose**: everything routes to the mock backend, including
`/api/auth/*`. Zero changes to existing setup; the mock still issues simple
in-memory tokens.

**Cluster**: real backends per the routing table above. The frontend does not
know which backend serves what.

## OIDC Flow (Cluster / Production)

### 1. Register PocketID Client

A `PocketIDOIDCClient` CR in the `networking` namespace:

```yaml
apiVersion: pocketid.internal/v1alpha1
kind: PocketIDOIDCClient
metadata:
  name: portfoliost
  namespace: networking
spec:
  instanceSelector:
    matchLabels:
      pocketid.internal/instance: pocket-id
  name: PortfolioST
  clientID: badb965e4e0be8e26f765f192418cc0c6b2f373f272f9d4886230d3203436e61
  callbackUrls:
    - https://portfoliost.${SECRET_DOMAIN}/auth/callback
  logoutCallbackUrls:
    - https://portfoliost.${SECRET_DOMAIN}/logout
  isPublic: true
  pkceEnabled: true
```

**The client is public and PKCE-only.** There is no client secret — the
operator is not asked for one, and `portfoliost-users-auth` is configured with
`POCKETID_CLIENT_ID` only. An earlier draft of this proposal had the backend
holding a `clientSecret` so it would not be exposed to the browser; that is no
longer true, and no secret needs protecting.

`accessTokenDurationMinutes` (default 60) and `refreshTokenDurationMinutes`
(default 43200, i.e. 30 days) on this CR are what set the session length — see
**Session Lifetime** below.

### 2. Frontend Login Flow (OIDC Authorization Code + PKCE)

```
1. User clicks "Login" → frontend redirects to:
   https://pocket-id.${SECRET_DOMAIN}/authorize
     ?response_type=code
     &client_id=<clientId>
     &redirect_uri=https://portfoliost.${SECRET_DOMAIN}/auth/callback
     &scope=openid profile email groups
     &prompt=login
     &code_challenge=<SHA256(code_verifier)>
     &code_challenge_method=S256
     &state=<random>

2. PocketID authenticates via passkey

3. PocketID redirects back to /auth/callback?code=<auth_code>&state=<state>

4. Frontend exchanges code for tokens (via users-auth):
   POST /api/auth/token
   { code, code_verifier, redirect_uri }

5. users-auth:
   a. Calls PocketID's /api/oidc/token with code + code_verifier + client_id
   b. Receives access_token, id_token AND refresh_token
   c. Decodes id_token claims (sub, email, groups, jti)
   d. Upserts user_preferences row in DB (auto-provisions on first login)
   e. Returns { access_token: <id_token>, token_type, expires_in, user }
      to the frontend

6. Frontend stores access_token in localStorage under "portfoliost_token"
```

**The returned `access_token` is PocketID's `id_token`.** This is deliberate —
the id_token carries the claims (`email`, `groups`) the app needs, so every
backend can validate it locally against PocketID's JWKS without calling back to
PocketID on each request.

> A consequence worth knowing: PocketID's `userinfo` endpoint rejects the
> `id_token` (it wants an access token), so `/api/oidc/userinfo` cannot be used
> as an nginx `auth-url` target. See §77 of `../plan.md`.

`prompt=login` is hardcoded in `src/auth/pkce.ts`. Without it, an active
PocketID session cookie makes `/authorize` redirect silently and the passkey UI
never appears.

### 3. users-auth Token Exchange

```
Frontend → POST /api/auth/token { code, code_verifier, redirect_uri }
         → users-auth calls PocketID /api/oidc/token
         → users-auth decodes the returned id_token claims
         → users-auth upserts user_preferences row (auto-provision)
         → Returns { access_token: <id_token>, token_type, expires_in, user }
```

Reached at `POCKETID_TOKEN_URL=http://pocket-id.networking.svc.cluster.local:1411/api/oidc/token`
— cluster-internal, never from the browser.

### 4. Authenticated Requests

Unchanged from the original design: `Authorization: Bearer <token>` on every API
call. Each service validates the JWT via the shared `validateJwt` middleware
(`jose.jwtVerify` against PocketID's JWKS, issuer + audience checked):

- `POCKETID_ISSUER_URL` → `https://pocket-id.${SECRET_DOMAIN}`
- `POCKETID_AUDIENCE` → the OIDC client id (must match the token's `aud`)

The mock backend's `requireAuth` continues to work with its in-memory tokens.

A dormant `GET /internal/verify` endpoint (204 on valid, 401 otherwise) exists
on users-auth as a preflight hook for edge auth. It is **not** currently wired
to the ingress.

### 5. Session Validation (Page Load)

`App.vue` calls `GET /api/auth/me` on mount. users-auth validates the JWT from
the Bearer header, extracts claims, reads language from DB, and returns the
merged user object. If the token is expired or invalid → 401 → frontend clears
the token → redirect to login.

## Session Lifetime

This is the part that bites, and it was not in the original proposal.

**The session is the `id_token`, and its lifetime is exactly
`accessTokenDurationMinutes` (60 min).** Verified in production by decoding the
token out of `localStorage`:

```
iss https://pocket-id.k.homylab.com
aud badb965e4e0be8e26f765f192418cc0c6b2f373f272f9d4886230d3203436e61
iat 2026-09-30T21:03:15Z   exp 2026-09-30T22:03:15Z   → 60 min
```

PocketID issues the `id_token` with the client's access-token duration, so
there is no separate knob for it. Two consequences:

1. **No refresh.** PocketID also issues a 30-day `refresh_token`; users-auth
   currently discards it, and the frontend never asks. Verified against
   PocketID's own database: 223 unused `refresh_token` rows exist for this
   client, every one minted by a login and every one expired unused. Note that
   PocketID issues them **without** `offline_access` being requested, so no
   scope change is needed.
2. **Expiry is invisible until it isn't.** `isAuthenticated` is just
   `Boolean(token)`, so an expired token still satisfies the router guard. The
   user is ejected mid-task by a `401` rather than at a login screen, and
   `prompt=login` then forces a full passkey ceremony to recover.

The fix (refresh-token rotation, `users_auth.refresh_sessions` keyed by the
id_token's `jti`, refresh-on-401 with a single in-flight mutex) is specified in
§77 of `../plan.md`. It deliberately keeps `accessTokenDurationMinutes` at 60 —
the goal is a long session from a short, revocable access token, not a
long-lived credential.

## Logout

**Current state — logout does not fully log out.** Three separate gaps:

1. `POST /api/auth/logout` is a no-op: it returns `{success:true}` without
   calling PocketID's end-session and without revoking anything.
2. PocketID's session cookie is never cleared, so the OIDC session survives.
   Only the hardcoded `prompt=login` hides this.
3. The OIDC client advertises `logoutCallbackUrls:
   https://portfoliost.${SECRET_DOMAIN}/logout`, but **no `/logout` route
   exists** in the SPA router. Visiting that URL today redirects into the
   dashboard and leaves you authenticated.

Gap 3 is currently harmless because end-session is never called, but it must be
fixed *before* end-session is wired, or signing out will bounce the browser to
a URL that lands back in the app.

Planned behaviour (spec in §77 of `../plan.md`):

```
Logout button → POST /api/auth/logout { id_token }
              → users-auth deletes the refresh_sessions row (revokes refresh)
              → frontend redirects to PocketID /api/oidc/end-session
                   ?id_token_hint=<id_token>
                   &post_logout_redirect_uri=.../logout
              → PocketID clears its session, redirects to /logout
              → new /logout route clears localStorage and shows login
```

This is only safe once the refresh row is actually deleted — with a 30-day
refresh token, a logout that only forgets the local token is not a logout.

## Data Ownership: JWT vs DB

| Field | Source | Mutability | Where Used |
|-------|--------|-----------|-----------|
| `id` | JWT claim `sub` | Read-only | `auth.me`, `users/profile` |
| `email` | JWT claim | Read-only | `auth.me`, `users/profile` |
| `firstName` | JWT claim (from lldap) | Read-only | `users/profile` |
| `lastName` | JWT claim (from lldap) | Read-only | `users/profile` |
| `language` | DB (`user_preferences`) | Read/write | `users/profile` |
| `uiPreferences` | DB (JSON) | Read/write | `users/preferences` |
| `customBenchmarks` | DB (JSON) | Read/write | `users/preferences/custom-benchmarks` |
| `customTimeframes` | DB (JSON) | Read/write | `users/preferences/custom-timeframes` |
| `onboardingStatus` | DB (JSON) | Read/write | `users/onboarding/status` |
| `onboardingDraft` | DB (JSON) | Read/write | `users/onboarding/draft` |
| `recentSearches` | DB (JSON) | Read/write | `users/preferences` |
| `isDemoUser` | Hardcoded `false` | Read-only | `auth.me` |
| `role` | Hardcoded `"user"` | Read-only | `auth.me` |
| `groups` | JWT claim `groups` | Read-only | `auth.me`, admin gate (D45/D50) |

### Profile Endpoint (`GET /api/users/profile`)

Merges JWT claims + DB row. Identity fields (`firstName`, `lastName`, `email`)
in `PATCH` request bodies are silently ignored; the backend writes DB fields
only.

### Change Password (`POST /api/users/change-password`)

Returns 403 or 501 in the cluster — password management is handled by
PocketID. The frontend hides the option when PocketID is the auth provider.

### Auto-Provisioning

On first login users-auth upserts a `user_preferences` row with defaults. No
registration step — PocketID/lldap owns user creation; the backend only ensures
the app-specific row exists.

## Local Development (Docker Compose)

No PocketID involved. The mock backend continues to issue UUID tokens (not real
JWTs) validated via an in-memory session map, and serves static seed data for
all user endpoints. The frontend doesn't need to know the difference — it
stores the token and sends it as Bearer.

## Frontend

| Component | Change |
|-----------|--------|
| `LoginView.vue` | Passkey button when OIDC is configured; email/password form rendered only when `passwordLoginEnabled` |
| `AuthCallback.vue` | Receives `/auth/callback`, exchanges the code |
| `src/auth/pkce.ts` | PKCE helpers (~20 lines, Web Crypto), `prompt=login` |
| `src/api/auth.ts` | `loginWithCode`, `fetchMe`, `logout` |
| `src/stores/auth.ts` | Token in `ref`, persisted via `src/api/client.ts` |
| `src/api/client.ts` | `Authorization: Bearer` injection |
| `src/router/index.ts` | `/login` and `/auth/callback` public routes |
| `src/runtime-config.ts` | Reads `window.__OIDC_CONFIG__` for runtime config |
| Profile page | Hide "Change Password" |

### Runtime vs build-time configuration

`scripts/docker-entrypoint.sh` writes `runtime-config.js` exposing
`issuerUrl`, `clientId`, and `passwordLoginEnabled`.
`passwordLoginEnabled` defaults to `false`, so compose sets it to `true` (local
dev + e2e log in with the mock credentials) while the cluster omits it and shows
only the passkey button. e2e specs log in through the visible email/password
form.

## users-auth Endpoints

| Endpoint | Method | Behavior |
|----------|--------|----------|
| `/api/auth/token` | POST | Exchange OIDC code for tokens (calls PocketID `/api/oidc/token`) |
| `/api/auth/refresh` | POST | **Planned** — exchange a refresh token for a new `id_token` |
| `/api/auth/me` | GET | Validate JWT, return user from claims + DB |
| `/api/auth/logout` | POST | Currently a no-op; **planned** to revoke the refresh session |
| `/api/users/profile` | GET | Merge JWT claims + DB row |
| `/api/users/profile` | PATCH | Update DB only |
| `/api/users/preferences` | GET/PATCH | DB only, scoped to JWT user |
| `/api/users/preferences/custom-benchmarks` | GET/PATCH | DB only |
| `/api/users/preferences/custom-timeframes` | GET/PATCH | DB only |
| `/api/users/onboarding/status` | PATCH | DB only |
| `/api/users/onboarding/draft` | PATCH | DB only |
| `/api/users/change-password` | POST | 403 (PocketID manages passwords) |
| `/api/users/clear-data` | DELETE | Delete `user_preferences` row, 204 |
| `/api/users/account` | DELETE | Delete `user_preferences` row, 204 |
| `/internal/verify` | GET | 204 if the Bearer token validates, else 401 |

All endpoints read/write user data from the JWT `sub` claim and scope queries to
that user. `POST /api/auth/login` and `/api/auth/register` are **not**
implemented by users-auth — they remain on the mock for local dev only.

## Risks / Considerations

- **PKCE in SPA**: the code verifier is stored in `localStorage` to survive the
  redirect. It is single-use and cleared on callback.
- **JWT expiry**: the frontend does not check expiry — it relies on 401s from
  the backend. This is acceptable *once* refresh-on-401 exists; today it is the
  cause of the mid-task ejection described in **Session Lifetime**.
- **Token refresh**: planned, see §77 of `../plan.md`.
- **Concurrent 401s**: a dashboard load fires ~15 parallel API requests (10 of
  them per-portfolio analytics). Refresh-on-401 therefore needs a single
  in-flight refresh — otherwise rotation invalidates the token for all but the
  first request. No proactive refresh timer: the 401 path is event-driven and
  costs one round-trip, which is cheaper than a scheduler that has to be
  re-armed, cleaned up, and that browsers throttle in background tabs.
- **Refresh-token revocation**: relies on PocketID re-validating authorization
  state on refresh. The known advisory (GHSA-w6p7-2fxx-4f44) where refresh
  bypassed disabled-user / revoked-authorization / group-restriction checks is
  **fixed in the deployed v2.14.0** (`compare/978ac87...v2.14.0` →
  `behind_by: 0`). Disabling a user or changing `portfoliost_admin` membership
  takes effect on the next refresh.
- **nginx edge auth**: ingress-nginx has no native JWT validation, and
  PocketID's own endpoints cannot serve as an `auth-url` target (see the note in
  §2). Not currently used; `/internal/verify` exists if it is ever wanted.
- **Multi-user**: all endpoints are scoped to the authenticated user via the
  JWT `sub` claim. PocketID/lldap is the source of truth for identity.