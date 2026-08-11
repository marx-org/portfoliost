import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"
import { uuid, nowIso } from "../lib/http.js"

const conversations = new Map()

export function register(app) {
  app.get("/api/conversations", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("conversations.json"))
  })

  app.post("/api/conversations", (ctx) => {
    if (!requireAuth(ctx)) return
    const conversation = {
      id: uuid(),
      title: (ctx.body && ctx.body.title) || "New conversation",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
    }
    conversations.set(conversation.id, conversation)
    ctx.res.status(201).json(conversation)
  })

  app.get("/api/chatbot/models", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("chatbot_models.json"))
  })
}
