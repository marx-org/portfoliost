import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia, type Pinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import LoginView from "@/modules/auth/LoginView.vue"
import * as authApi from "@/api/auth"
import type { AuthResponse } from "@/api/types"

vi.mock("@/api/auth", () => ({
  login: vi.fn(),
  register: vi.fn(),
  fetchMe: vi.fn(),
  logout: vi.fn(),
}))

const mocked = vi.mocked(authApi)

let pinia: Pinia

const push = vi.fn()
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, currentRoute: { value: { query: {} } } }),
  useRoute: () => ({ query: {} }),
}))

vi.mock("@/auth/pkce", () => ({
  createAuthorizationUrl: vi.fn(),
}))

const passwordLoginEnabled = { value: false }
vi.mock("@/runtime-config", () => ({
  getOidcConfig: () => ({ issuerUrl: "https://issuer.example.com", clientId: "client-id" }),
  isPasswordLoginEnabled: () => passwordLoginEnabled.value,
}))

function makeResponse(): AuthResponse {
  return {
    access_token: "mock-token",
    token_type: "bearer",
    expires_in: 3600,
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "demo@example.com",
      language: "en",
      role: "user",
      isDemoUser: true,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
      lastLoginAt: "2026-08-11T09:00:00.000Z",
    },
  }
}

function mountLogin() {
  return mount(LoginView, { global: { plugins: [pinia] } })
}

describe("LoginView", () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    push.mockReset()
    passwordLoginEnabled.value = false
    vi.clearAllMocks()
  })

  it("hides the user/password form when password login is disabled", () => {
    const wrapper = mountLogin()
    expect(wrapper.find("input[data-testid=email]").exists()).toBe(false)
    expect(wrapper.find("input[data-testid=password]").exists()).toBe(false)
    expect(wrapper.find("button[data-testid=signin]").exists()).toBe(false)
    expect(wrapper.text()).not.toContain("Create one")
    expect(wrapper.find("button[data-testid=oidc-signin]").exists()).toBe(true)
  })

  it("shows the password form and create account link when enabled", () => {
    passwordLoginEnabled.value = true
    const wrapper = mountLogin()
    expect(wrapper.find("input[data-testid=email]").exists()).toBe(true)
    expect(wrapper.find("input[data-testid=password]").exists()).toBe(true)
    expect(wrapper.find("button[data-testid=signin]").exists()).toBe(true)
    expect(wrapper.text()).toContain("Create one")
    expect(wrapper.find("button[data-testid=oidc-signin]").exists()).toBe(true)
  })

  it("logs in and navigates to investments when password login is enabled", async () => {
    passwordLoginEnabled.value = true
    mocked.login.mockResolvedValue(makeResponse())
    const wrapper = mountLogin()
    await wrapper.find("form").trigger("submit")
    await flushPromises()
    expect(mocked.login).toHaveBeenCalledWith({ email: "demo@example.com", password: "example-service-mock" })
    expect(push).toHaveBeenCalledWith({ name: "investments" })
  })
})
