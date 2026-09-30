import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ApiError, http, refreshSession, setRefreshHandler } from "@/api/client"

/**
 * §77.5 — 401 → one shared refresh → replay once.
 *
 * The concurrency test is the important one: one dashboard load fires ~15
 * parallel requests, and the server rotates the session, so independent
 * refreshes would break all but the first.
 */
describe("api client refresh (§77.5)", () => {
  const TOKEN_KEY = "portfoliost_token"
  let calls: { url: string; auth: string | null }[]
  let respond: (url: string, auth: string | null) => Response
  let origFetch: typeof fetch

  beforeEach(() => {
    localStorage.clear()
    calls = []
    respond = () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    origFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      const headers = (init?.headers ?? {}) as Record<string, string>
      const auth = Object.entries(headers).find(([k]) => k.toLowerCase() === "authorization")?.[1] ?? null
      calls.push({ url, auth })
      return respond(url, auth)
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    setRefreshHandler(null)
  })

  it("refreshes once on 401 and replays the request with the new token", async () => {
    let refreshes = 0
    setRefreshHandler(async () => {
      refreshes += 1
      localStorage.setItem(TOKEN_KEY, "new-token")
      return true
    })

    respond = (_url, auth) => {
      if (auth === "Bearer stale") return new Response("{}", { status: 401 })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    localStorage.setItem(TOKEN_KEY, "stale")

    const data = await http.get<{ ok: boolean }>("/api/portfolios")

    expect(data).toEqual({ ok: true })
    expect(refreshes).toBe(1)
    expect(calls).toHaveLength(2)
    expect(calls[0].auth).toBe("Bearer stale")
    expect(calls[1].auth).toBe("Bearer new-token")
  })

  it("collapses 5 concurrent 401s into exactly one refresh", async () => {
    let refreshes = 0
    // Hold the refresh open so all five callers are genuinely waiting on one
    // promise rather than arriving after it already settled.
    const gate: { open: () => void } = { open: () => {} }
    const held = new Promise<void>((resolve) => {
      gate.open = resolve
    })
    setRefreshHandler(async () => {
      refreshes += 1
      await held
      localStorage.setItem(TOKEN_KEY, "new-token")
      return true
    })

    respond = (_url, auth) =>
      auth === "Bearer stale"
        ? new Response("{}", { status: 401 })
        : new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
    localStorage.setItem(TOKEN_KEY, "stale")

    const pending = [
      http.get("/api/portfolios"),
      http.get("/api/currencies"),
      http.get("/api/users/preferences"),
      http.get("/api/portfolios/merged"),
      http.get("/api/labels"),
    ]
    // Let every request reach its 401 before the refresh completes.
    await new Promise((r) => setTimeout(r, 0))
    gate.open()

    const results = await Promise.all(pending)
    expect(results.every((r) => (r as { ok: boolean }).ok)).toBe(true)
    expect(refreshes).toBe(1)
    expect(calls.filter((c) => c.auth === "Bearer new-token")).toHaveLength(5)
  })

  it("replays only once — a second 401 surfaces instead of looping", async () => {
    let refreshes = 0
    setRefreshHandler(async () => {
      refreshes += 1
      localStorage.setItem(TOKEN_KEY, "new-token")
      return true
    })
    respond = () => new Response("{}", { status: 401 })
    localStorage.setItem(TOKEN_KEY, "stale")

    await expect(http.get("/api/portfolios")).rejects.toBeInstanceOf(ApiError)
    expect(refreshes).toBe(1)
    expect(calls).toHaveLength(2)
  })

  it("does not attempt a refresh when the refresh itself fails", async () => {
    let refreshes = 0
    setRefreshHandler(async () => {
      refreshes += 1
      return false
    })
    respond = () => new Response("{}", { status: 401 })
    localStorage.setItem(TOKEN_KEY, "stale")

    await expect(http.get("/api/portfolios")).rejects.toBeInstanceOf(ApiError)
    expect(refreshes).toBe(1)
    // Original request only — no pointless replay with an unchanged token.
    expect(calls).toHaveLength(1)
  })

  it("never recurses into the refresh endpoint", async () => {
    let refreshes = 0
    setRefreshHandler(async () => {
      refreshes += 1
      return true
    })
    respond = () => new Response("{}", { status: 401 })
    localStorage.setItem(TOKEN_KEY, "stale")

    await expect(
      http.post("/api/auth/refresh", { id_token: "stale" })
    ).rejects.toBeInstanceOf(ApiError)
    expect(refreshes).toBe(0)
  })

  it("replays a non-idempotent request exactly once", async () => {
    // Safe because the 401 comes from auth middleware before the handler runs,
    // so the first attempt created nothing. This test pins that contract.
    const seen: string[] = []
    setRefreshHandler(async () => {
      localStorage.setItem(TOKEN_KEY, "new-token")
      return true
    })
    respond = (_url, auth) => {
      seen.push(String(auth))
      return auth === "Bearer stale"
        ? new Response("{}", { status: 401 })
        : new Response(JSON.stringify({ id: "tx-1" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
    }
    localStorage.setItem(TOKEN_KEY, "stale")

    const res = await http.post<{ id: string }>("/api/transactions", { amount: 10 })
    expect(res).toEqual({ id: "tx-1" })
    // Two HTTP requests, but only the second could have committed anything.
    expect(seen).toEqual(["Bearer stale", "Bearer new-token"])
  })

  it("returns false from refreshSession when no handler is registered", async () => {
    setRefreshHandler(null)
    await expect(refreshSession()).resolves.toBe(false)
  })
})
