# Proposal: Auth Implementation — OIDC + PKCE with PocketID

**Status**: Proposed  
**Date**: 2026-08-18  

## Problem

Auth is currently fully mocked: the mock backend issues in-memory UUID tokens, validates against static credentials (`demo@example.com` / `example-service-mock`), and serves static seed data for user profiles. This needs to be replaced with real authentication backed by PocketID (OIDC provider with passkey login) in the cluster, while keeping local development self-contained.

## Architecture Overview

The backend lives at `../portfoliost-backend/` (sibling to the `portfoliost` frontend repo).

### Two Deployment Modes via KrakenD

```
Docker Compose (local dev)          Cluster (production)
┌───────────┐                       ┌───────────┐
│ KrakenD   │                       │ KrakenD   │
│ (config1) │                       │ (config2) │
└─────┬─────┘                       └─────┬─────┘
      │                                   │
      ▼                                   ▼
┌───────────┐                    ┌────────┬────────┐
│ mock      │                    │ real   │ mock   │
│ backend   │                    │ backend│ backend│
│ (all)     │                    │ (auth) │ (rest) │
└───────────┘                    └────────┴────────┘
```

**Docker Compose**: KrakenD routes ALL endpoints (including `/api/auth/*`) to the mock backend. Zero changes to existing setup. Mock still issues simple tokens.

**Cluster**: KrakenD splits traffic — `/api/auth/*` and `/api/users/*` to `portfoliost-backend` (PocketID JWT validation + SQLite/Postgres), everything else stays on the mock backend (also deployed in the cluster).

### KrakenD Config Difference

The only change between configs is the `API_AUTH_URL` and `API_USERS_URL` environment variables:

```jsonc
// Docker Compose: both point to mock
"API_AUTH_URL": "http://example-service-mock:4010"
"API_USERS_URL": "http://example-service-mock:4010"

// Cluster: both point to portfoliost-backend
"API_AUTH_URL": "http://portfoliost-backend:3000"
"API_USERS_URL": "http://portfoliost-backend:3000"
```

All other KrakenD endpoints remain unchanged. The frontend doesn't know which backend serves what.

## OIDC Flow (Cluster / Production)

### 1. Register PocketID Client

Create a `PocketIDOIDCClient` CRD:

```yaml
apiVersion: pocketid.internal/v1alpha1
kind: PocketIDOIDCClient
metadata:
  name: portfoliost
  namespace: networking
spec:
  pocketIDInstanceRef:
    name: pocket-id
  name: PortfolioST
  callbackURLs:
    - https://portfoliost.${SECRET_DOMAIN}/auth/callback
  logoutURLs:
    - https://portfoliost.${SECRET_DOMAIN}/logout
```

Operator creates the client and writes credentials to secret `portfoliost-oidc-credentials` (`clientId`, `clientSecret`).

### 2. Frontend Login Flow (OIDC Authorization Code + PKCE)

```
1. User clicks "Login" → frontend redirects to:
   https://pocket-id.${SECRET_DOMAIN}/oauth2/authorize
     ?response_type=code
     &client_id=<clientId>
     &redirect_uri=https://portfoliost.${SECRET_DOMAIN}/auth/callback
     &scope=openid email profile
     &code_challenge=<SHA256(code_verifier)>
     &code_challenge_method=S256

2. PocketID authenticates via passkey

3. PocketID redirects back to /auth/callback?code=<auth_code>

4. Frontend exchanges code for tokens (via real backend):
   POST /api/auth/token
   { code, code_verifier, redirect_uri }

5. Real backend:
   a. Calls PocketID's token endpoint with code + code_verifier + clientSecret
   b. Receives JWT access_token + id_token
   c. Validates the tokens
   d. Returns to frontend: { access_token, token_type, expires_in, user }

6. Frontend stores access_token in localStorage (same as today)
```

### 3. portfoliost-backend Token Exchange

portfoliost-backend handles the token exchange because the `clientSecret` must not be exposed to the browser:

```
Frontend → POST /api/auth/token { code, code_verifier, redirect_uri }
         → portfoliost-backend calls PocketID /oauth2/token with code + code_verifier + clientSecret
         → portfoliost-backend validates returned JWT (verify signature via JWKS)
         → portfoliost-backend extracts user claims from JWT
         → portfoliost-backend upserts user_preferences row in DB (auto-provisions on first login)
         → Returns { access_token, token_type, expires_in, user } to frontend
```

### 4. Authenticated Requests

Same as today — `Authorization: Bearer <token>` header on every API call. portfoliost-backend validates the JWT on each request (verify signature + expiry via JWKS). The mock backend's `requireAuth` continues to work with its in-memory tokens.

### 5. Session Validation (Page Load)

`App.vue` calls `GET /api/auth/me` on mount. In the cluster, portfoliost-backend:
1. Validates the JWT from the Bearer header
2. Extracts user claims (id, email, name)
3. Reads language from DB
4. Returns merged user object

If the JWT is expired or invalid, returns 401 → frontend clears token → redirect to login.

### 6. Logout

`POST /api/auth/logout` — portfoliost-backend returns 204 (no-op, same as mock). The frontend clears localStorage. Optionally, the frontend can redirect to PocketID's logout endpoint to end the OIDC session:

```
https://pocket-id.${SECRET_DOMAIN}/oauth2/logout
  ?client_id=<clientId>
  &post_logout_redirect_uri=https://portfoliost.${SECRET_DOMAIN}/login
```

## Data Ownership: JWT vs DB

| Field | Source | Mutability | Where Used |
|-------|--------|-----------|-----------|
| `id` | JWT claim `sub` | Read-only | `auth.me`, `users/profile` |
| `email` | JWT claim | Read-only | `auth.me`, `users/profile` |
| `firstName` | JWT claim (from lldap) | Read-only | `users/profile` |
| `lastName` | JWT claim (from lldap) | Read-only | `users/profile` |
| `language` | DB (`user_preferences`) | Read/write | `users/profile`, `users/language` |
| `uiPreferences` | DB (JSON) | Read/write | `users/preferences` |
| `customBenchmarks` | DB (JSON) | Read/write | `users/preferences/custom-benchmarks` |
| `customTimeframes` | DB (JSON) | Read/write | `users/preferences/custom-timeframes` |
| `onboardingStatus` | DB (JSON) | Read/write | `users/onboarding/status` |
| `isDemoUser` | Hardcoded `false` | Read-only | `auth.me`, `users/profile` |
| `role` | Hardcoded `"user"` | Read-only | `auth.me` |

### Profile Endpoint (`GET /api/users/profile`)

Merges JWT claims + DB row:

```json
{
  "id": "00000000-...",
  "email": "demo@example.com",
  "firstName": "",
  "lastName": "",
  "language": "en",
  "isDemoUser": false,
  "createdAt": "2026-08-01T10:13:13.981Z",
  "updatedAt": "2026-08-11T08:43:57.401Z"
}
```

### Update Profile (`PATCH /api/users/profile`)

Writes only to DB. Identity fields (`firstName`, `lastName`, `email`) in the request body are silently ignored. portfoliost-backend updates `language` (and any other app-specific fields) in the `user_preferences` table.

### Change Password (`POST /api/users/change-password`)

Returns 403 or 501 in the cluster — password management is handled by PocketID, not the app. The frontend should hide or disable this option when PocketID is the auth provider.

### Auto-Provisioning

When a user authenticates for the first time, portfoliost-backend upserts a `user_preferences` row with defaults (language: `"en"`, empty preferences). No separate registration step — PocketID/lldap handles user creation, the backend just ensures the app-specific row exists.

## Local Development (Docker Compose)

No PocketID involved. The mock backend continues to:

1. Accept `POST /api/auth/login` with static credentials
2. Issue UUID tokens (not real JWTs)
3. Validate via in-memory session map
4. Serve static seed data for all user endpoints

The frontend doesn't know the difference — it stores the token and sends it as Bearer. The `VITE_API_BASE_URL` points to KrakenD, which routes everything to the mock.

## Frontend Changes Required

Minimal — the existing auth flow is compatible with OIDC:

| Component | Change |
|-----------|--------|
| `LoginView.vue` | Replace email/password form with "Sign in with PocketID" button. Keep the page as a landing — it handles `?redirect=` deep linking and is the logout return target. In local dev (Docker Compose), the mock login still works as before. |
| `App.vue` | Add `/auth/callback` route handler to exchange code for tokens |
| `src/api/auth.ts` | Add `exchangeToken(code, codeVerifier)` function, add `logoutUrl` getter |
| `src/router/index.ts` | Add `/auth/callback` route (public, no auth required) |
| `stores/auth.ts` | No changes — token storage and `fetchMe()` work as-is |
| `src/api/client.ts` | No changes — Bearer header injection works as-is |
| Profile page | Hide "Change Password" when PocketID is the auth provider |

### Login Page Behavior

The `/login` route still exists and the router guard still redirects unauthenticated users there. But the page content changes:

- **Cluster (OIDC)**: Shows a single "Sign in with PocketID" button. Clicking it redirects to PocketID's authorize endpoint. No email/password form.
- **Docker Compose (mock)**: Shows the existing email/password form (pre-filled with mock credentials). No change.

The login page can detect which mode it's in by checking if `VITE_OIDC_CLIENT_ID` is set (or a similar env var). If set → show OIDC button. If not → show mock form.

### PKCE Helpers

Need a small utility for PKCE:

```ts
// src/auth/pkce.ts
function generateCodeVerifier(): string  // random 43-128 char string
function sha256(plain: string): string    // SHA-256 hash
function base64urlencode(array: Uint8Array): string  // base64url encoding
function generateCodeChallenge(verifier: string): string  // SHA-256 + base64url
```

~20 lines of code. No external dependency needed (uses Web Crypto API).

## portfoliost-backend Endpoints

portfoliost-backend implements these endpoints (replacing mock for auth + users):

| Endpoint | Method | Behavior |
|----------|--------|----------|
| `/api/auth/token` | POST | Exchange OIDC code for JWT (calls PocketID token endpoint) |
| `/api/auth/me` | GET | Validate JWT, return user from claims + DB |
| `/api/auth/logout` | POST | Return 204 (no-op) |
| `/api/users/profile` | GET | Merge JWT claims + DB row |
| `/api/users/profile` | PATCH | Update DB only (ignore identity fields) |
| `/api/users/preferences` | GET | Read from DB (scoped to JWT user) |
| `/api/users/preferences` | PATCH | Update DB (scoped to JWT user) |
| `/api/users/preferences/custom-benchmarks` | GET | Read from DB (JSON column, scoped to JWT user) |
| `/api/users/preferences/custom-timeframes` | GET | Read from DB (JSON column, scoped to JWT user) |
| `/api/users/onboarding/status` | GET | Read from DB (scoped to JWT user) |
| `/api/users/onboarding/draft` | GET | Read from DB (scoped to JWT user) |
| `/api/users/change-password` | POST | Return 403 (PocketID manages passwords) |
| `/api/users/clear-data` | DELETE | Delete user_preferences row (scoped to JWT user), return 204 |
| `/api/users/account` | DELETE | Delete user_preferences row (scoped to JWT user), return 204 |

All endpoints that read/write user data extract the user ID from the JWT `sub` claim and scope queries to that user. No endpoint operates across users.

Note: `POST /api/auth/login` and `POST /api/auth/register` are NOT implemented by portfoliost-backend — they remain on the mock for local dev. In the cluster, the login flow goes through PocketID's OIDC, not a login form.

## Risks / Considerations

- **PKCE in SPA**: The code verifier must be stored in `sessionStorage` (not `localStorage`) to survive the redirect. Browser support for Web Crypto API is universal.
- **JWT expiry**: PocketID JWTs have a configurable expiry. The frontend doesn't check expiry — it relies on 401 responses from the backend. This is fine.
- **Token refresh**: Not implemented initially. If the JWT expires, the user must re-authenticate via PocketID. Can be added later with a refresh token flow.
- **CORS**: KrakenD handles CORS. portfoliost-backend is only accessed via KrakenD, not directly from the browser.
- **Mock `/api/auth/register`**: Not used by the frontend (no register UI). Can be removed from the mock or kept for testing.
- **Multi-user**: All endpoints are scoped to the authenticated user via JWT `sub` claim. The `user_preferences` table supports multiple users from day one. PocketID/lldap is the source of truth for user identity — portfoliost-backend does not manage user creation.
