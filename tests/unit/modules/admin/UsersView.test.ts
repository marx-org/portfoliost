import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import UsersView from "@/modules/admin/UsersView.vue"
import { fetchAdminUsers } from "@/api/admin"
import type { AdminUser } from "@/api/admin"

vi.mock("@/api/admin", () => ({
  fetchAdminUsers: vi.fn(),
}))

const mocked = vi.mocked(fetchAdminUsers)

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "uuid-1",
    email: "alice@example.com",
    firstName: "Alice",
    lastName: "Smith",
    groups: ["portfoliost_admin"],
    lastLogin: "2026-08-22T09:00:00.000Z",
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  }
}

describe("UsersView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders users with their last login date", async () => {
    mocked.mockResolvedValue({
      items: [makeUser()],
      pagination: { total: 1, page: 1, per_page: 200, total_pages: 1 },
    })

    const wrapper = mount(UsersView)
    await flushPromises()

    expect(mocked).toHaveBeenCalledWith({ per_page: "200" })
    expect(wrapper.text()).toContain("alice@example.com")
    expect(wrapper.text()).toContain("Alice Smith")
    expect(wrapper.text()).toContain(new Date("2026-08-22T09:00:00.000Z").toLocaleDateString())
  })

  it("shows a dash when lastLogin is null", async () => {
    mocked.mockResolvedValue({
      items: [makeUser({ lastLogin: null })],
      pagination: { total: 1, page: 1, per_page: 200, total_pages: 1 },
    })

    const wrapper = mount(UsersView)
    await flushPromises()

    expect(wrapper.text()).toContain("—")
  })

  it("shows the error message when the request fails", async () => {
    mocked.mockRejectedValue(new Error("Failed to load"))

    const wrapper = mount(UsersView)
    await flushPromises()

    expect(wrapper.text()).toContain("Failed to load")
  })

  it("filters rows by name or email", async () => {
    mocked.mockResolvedValue({
      items: [makeUser(), makeUser({ id: "uuid-2", email: "bob@example.com", firstName: "Bob" })],
      pagination: { total: 2, page: 1, per_page: 200, total_pages: 1 },
    })

    const wrapper = mount(UsersView)
    await flushPromises()

    await wrapper.find("input[placeholder*='Filter']").setValue("bob")
    await flushPromises()

    expect(wrapper.text()).toContain("bob@example.com")
    expect(wrapper.text()).not.toContain("alice@example.com")
  })
})
