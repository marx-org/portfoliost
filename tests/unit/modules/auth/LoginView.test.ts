import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia, type Pinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import LoginView from "@/modules/auth/LoginView.vue"

let pinia: Pinia

const push = vi.fn()
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, currentRoute: { value: { query: {} } } }),
  useRoute: () => ({ query: {} }),
}))

vi.mock("@/auth/pkce", () => ({
  createAuthorizationUrl: vi.fn(),
}))

vi.mock("@/runtime-config", () => ({
  getOidcConfig: () => ({ issuerUrl: "https://issuer.example.com", clientId: "client-id" }),
}))

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

  it("hides the user/password form", () => {
    const wrapper = mountLogin()
    expect(wrapper.find("input[data-testid=email]").exists()).toBe(false)
    expect(wrapper.find("input[data-testid=password]").exists()).toBe(false)
    expect(wrapper.find("button[data-testid=signin]").exists()).toBe(false)
  })

  it("hides the create account link", () => {
    const wrapper = mountLogin()
    expect(wrapper.text()).not.toContain("Create one")
    expect(wrapper.text()).not.toContain("Don't have an account?")
  })

  it("renders the passkey sign-in button when OIDC is enabled", () => {
    const wrapper = mountLogin()
    expect(wrapper.find("button[data-testid=oidc-signin]").exists()).toBe(true)
  })
})
