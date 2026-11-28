import { vi } from "vitest"
import { config } from "@vue/test-utils"
import { i18n } from "@/i18n"

// Every component now calls useI18n(), so a mount without the plugin throws
// "Need to install with app.use". Install it globally for all unit tests rather
// than editing 20+ per-file mount calls; individual tests can still override.
config.global.plugins = [i18n]

// A unit test must never depend on a server being up. Without this, a suite
// passes on a developer machine that happens to run the compose stack and then
// exits non-zero in CI, where nothing listens: the store calls that reach for
// `getUserProfile` fire a real `fetch`, nothing awaits the rejection, and
// happy-dom's NetworkError becomes an unhandled rejection — every assertion
// still passes, yet the process exits 1. Anything a test does not mock answers
// with an empty JSON object instead of a socket.
const emptyJsonResponse = () =>
  new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" },
  })

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  globalThis.fetch = (() => Promise.resolve(emptyJsonResponse())) as typeof globalThis.fetch
})
