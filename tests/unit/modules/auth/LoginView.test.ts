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
    vi.clearAllMocks()
  })

  it("renders the form fields", () => {
    const wrapper = mountLogin()
    expect(wrapper.find("input[data-testid=email]").exists()).toBe(true)
    expect(wrapper.find("input[data-testid=password]").exists()).toBe(true)
    expect(wrapper.find("button[data-testid=signin]").exists()).toBe(true)
  })

  it("disables submit until the form is valid", async () => {
    const wrapper = mountLogin()
    const button = wrapper.find("button[data-testid=signin]")

    await wrapper.find("input[data-testid=email]").setValue("not-an-email")
    await wrapper.find("input[data-testid=password]").setValue("")
    expect(button.attributes("disabled")).toBeDefined()

    await wrapper.find("input[data-testid=email]").setValue("user@example.com")
    await wrapper.find("input[data-testid=password]").setValue("secret")
    expect(button.attributes("disabled")).toBeUndefined()
  })

  it("logs in and navigates to investments", async () => {
    mocked.login.mockResolvedValue(makeResponse())

    const wrapper = mountLogin()
    await wrapper.find("form").trigger("submit")
    await flushPromises()

    expect(mocked.login).toHaveBeenCalledWith({ email: "demo@example.com", password: "example-service-mock" })
    expect(push).toHaveBeenCalledWith({ name: "investments" })
  })

  it("shows the error message when login fails", async () => {
    mocked.login.mockRejectedValue(new Error("Invalid email or password"))

    const wrapper = mountLogin()
    await wrapper.find("form").trigger("submit")
    await flushPromises()

    expect(wrapper.find("[data-testid=login-error]").exists()).toBe(true)
    expect(wrapper.find("[data-testid=login-error]").text()).toContain("Invalid email or password")
  })
})
