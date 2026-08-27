import { createApp } from "../lib/http.js"
import * as authModule from "../auth/index.js"
import * as oidcModule from "../oidc/index.js"
import * as usersModule from "../users/index.js"
import * as billingModule from "../billing/index.js"
import * as notificationsModule from "../notifications/index.js"
import * as newsModule from "../news/index.js"
import * as instrumentsModule from "../instruments/index.js"
import * as chartingModule from "../charting/index.js"
import * as portfoliosModule from "../portfolios/index.js"
import * as walletsModule from "../wallets/index.js"
import * as watchlistsModule from "../watchlists/index.js"
import * as copilotModule from "../copilot/index.js"
import * as fxModule from "../fx/index.js"
import * as miscModule from "../misc/index.js"
import { authConfig } from "../lib/auth.js"

const PORT = Number(process.env.PORT || 4010)
const HOST = process.env.HOST || "0.0.0.0"

const app = createApp()

app.get("/health", (ctx) => {
  ctx.res.json({ status: "ok", service: "example-service-mock", time: new Date().toISOString() })
})

app.get("/", (ctx) => {
  ctx.res.json({
    name: "Example service API mock",
    contract: "docs/api/example-service-real-api.yaml",
    auth: { email: authConfig().email, staticToken: authConfig().staticToken },
    hint: "POST /api/auth/login { email, password } then use the returned access_token",
  })
})

const modules = [
  oidcModule,
  authModule,
  usersModule,
  billingModule,
  notificationsModule,
  newsModule,
  instrumentsModule,
  chartingModule,
  portfoliosModule,
  walletsModule,
  watchlistsModule,
  copilotModule,
  fxModule,
  miscModule,
]
for (const mod of modules) mod.register(app)

app.listen(PORT, HOST, () => {
  console.log(`[example-service-mock] listening on http://${HOST}:${PORT}`)
  console.log(`[example-service-mock] login: POST /api/auth/login { "email": "${authConfig().email}", "password": "${authConfig().password}" }`)
  console.log(`[example-service-mock] static bearer token: ${authConfig().staticToken}`)
})
