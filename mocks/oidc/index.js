import { randomUUID, generateKeyPairSync, createHash, createSign } from "node:crypto"
import { loadRaw } from "../lib/data.js"

const CLIENT_ID = process.env.OIDC_CLIENT_ID || "mock-client"
const ISSUER = process.env.OIDC_ISSUER || "http://krakend:8080"
const REDIRECT_URI = process.env.OIDC_REDIRECT_URI || "http://localhost:3000/auth/callback"
const USER = loadRaw("auth_me.json").user

// In-memory auth codes (code → { clientId, redirectUri, codeChallenge, userId, email, expiresAt })
const authCodes = new Map()

// RSA key pair for signing JWTs
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "jwk" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url")
}

function signJwt(payload) {
  const header = { alg: "RS256", typ: "JWT", kid: "mock-key-1" }
  const data = `${base64url(header)}.${base64url(payload)}`
  const sig = createSign("RSA-SHA256").update(data).sign(privateKey, "base64url")
  return `${data}.${sig}`
}

function verifyPkce(verifier, challenge) {
  const hash = createHash("sha256").update(verifier).digest("base64url")
  return hash === challenge
}

export function register(app) {
  // OIDC Discovery
  app.get("/.well-known/openid-configuration", (ctx) => {
    ctx.res.json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/api/auth/token`,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "profile", "email", "groups"],
      claims_supported: ["sub", "email", "given_name", "family_name", "picture", "groups"],
    })
  })

  // JWKS
  app.get("/.well-known/jwks.json", (ctx) => {
    ctx.res.json({
      keys: [{ ...publicKey, kid: "mock-key-1", use: "sig", alg: "RS256" }],
    })
  })

  // Authorization endpoint - redirect to callback with code
  // Note: client_id is not validated here — the mock only serves one client
  // in local dev.
  app.get("/authorize", (ctx) => {
    const { redirect_uri, state, code_challenge, code_challenge_method } = ctx.query

    const code = randomUUID()
    authCodes.set(code, {
      clientId: CLIENT_ID,
      redirectUri: redirect_uri || REDIRECT_URI,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      userId: USER.id || "dev-user-id",
      email: USER.email || "dev@example.com",
      expiresAt: Date.now() + 10 * 60 * 1000,
    })

    const callbackUrl = `${redirect_uri || REDIRECT_URI}?code=${code}&state=${state || ""}`
    // Return an HTML meta-refresh instead of a 302 so the redirect is
    // followed by the browser regardless of proxy behavior.
    const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${callbackUrl}"></head><body><p>Redirecting...</p></body></html>`
    ctx.res.setHeader("content-type", "text/html; charset=utf-8")
    ctx.res.end(html)
  })

  // Token endpoint - exchange code for JWT
  // Reached via POST /api/auth/token through the gateway
  app.post("/api/auth/token", (ctx) => {
    const { code, verifier, redirect_uri } = ctx.body || {}

    if (!code || !verifier) {
      ctx.res.status(400).json({ error: "invalid_request", error_description: "Missing code or verifier" })
      return
    }

    const authCode = authCodes.get(code)
    if (!authCode) {
      ctx.res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired code" })
      return
    }

    if (Date.now() > authCode.expiresAt) {
      authCodes.delete(code)
      ctx.res.status(400).json({ error: "invalid_grant", error_description: "Code expired" })
      return
    }

    // Verify PKCE (S256)
    if (authCode.codeChallenge && authCode.codeChallengeMethod === "S256") {
      if (!verifyPkce(verifier, authCode.codeChallenge)) {
        ctx.res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" })
        return
      }
    }

    authCodes.delete(code)

    const now = Math.floor(Date.now() / 1000)
    const jwt = signJwt({
      iss: ISSUER,
      sub: authCode.userId,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now,
      email: authCode.email,
      given_name: "Dev",
      family_name: "User",
      picture: "https://api.dicebear.com/7.x/initials/svg?seed=Dev+User",
      groups: ["portfoliost_admin"],
    })

    ctx.res.json({
      access_token: jwt,
      token_type: "Bearer",
      expires_in: 3600,
      user: {
        id: authCode.userId,
        email: authCode.email,
        firstName: "",
        lastName: "",
        language: "en",
        role: "user",
        groups: ["portfoliost_admin"],
        isDemoUser: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
  })
}
