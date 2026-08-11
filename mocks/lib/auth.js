import { loadRaw } from "./data.js"
import { uuid, nowIso } from "./http.js"

const USER = loadRaw("auth_me.json").user
const EMAIL = process.env.EXAMPLE_SERVICE_MOCK_EMAIL || USER.email
const PASSWORD = process.env.EXAMPLE_SERVICE_MOCK_PASSWORD || "example-service-mock"
const STATIC_TOKEN = process.env.EXAMPLE_SERVICE_MOCK_TOKEN || "mock-dev-token"

const sessions = new Map()

export function authConfig() {
  return { email: EMAIL, password: PASSWORD, staticToken: STATIC_TOKEN }
}

export function createSession() {
  const token = uuid()
  sessions.set(token, { user: USER, createdAt: nowIso() })
  return token
}

export function isValidCredentials(email, password) {
  if (typeof email !== "string" || typeof password !== "string") return false
  return email.trim().toLowerCase() === EMAIL.toLowerCase() && password === PASSWORD
}

export function resolveUser(bearer) {
  if (!bearer) return null
  if (bearer === STATIC_TOKEN) return USER
  const s = sessions.get(bearer)
  return s ? s.user : null
}

export function requireAuth(ctx) {
  const auth = ctx.headers.authorization || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  const user = resolveUser(token)
  if (!user) {
    ctx.res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid bearer token",
      statusCode: 401,
    })
    return false
  }
  ctx.user = user
  return true
}
