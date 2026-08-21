import { authConfig, createSession, destroySession, isValidCredentials, requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"

export function register(app) {
  const me = () => loadRaw("auth_me.json")

  app.post("/api/auth/login", (ctx) => {
    const { email, password } = ctx.body || {}
    if (!isValidCredentials(email, password)) {
      ctx.res.status(401).json({
        error: "InvalidCredentials",
        message: "Invalid email or password",
        statusCode: 401,
      })
      return
    }
    const access_token = createSession()
    const user = me().user
    ctx.res.json({
      access_token,
      token_type: "bearer",
      expires_in: 3600,
      user,
    })
  })

  app.post("/api/auth/register", (ctx) => {
    const { email, password } = ctx.body || {}
    if (!email || !password) {
      ctx.res.status(422).json({ error: "ValidationError", message: "email and password are required" })
      return
    }
    const access_token = createSession()
    const user = { ...me().user, email, createdAt: new Date().toISOString() }
    ctx.res.status(201).json({ access_token, token_type: "bearer", expires_in: 3600, user })
  })

  app.get("/api/auth/me", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(me())
  })

  app.post("/api/auth/logout", (ctx) => {
    if (!requireAuth(ctx)) return
    const auth = ctx.headers.authorization || ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
    destroySession(token)
    ctx.res.status(204).end()
  })
}
