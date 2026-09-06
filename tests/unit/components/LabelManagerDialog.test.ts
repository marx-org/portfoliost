import { flushPromises, mount } from "@vue/test-utils"
import { createPinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import LabelManagerDialog from "@/components/LabelManagerDialog.vue"
import * as labelsApi from "@/api/labels"

vi.mock("@/api/labels", async (importOriginal) => {
  const actual = await importOriginal<typeof labelsApi>()
  return {
    ...actual,
    getLabels: vi.fn(),
    createLabel: vi.fn(),
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
  }
})

const mocked = vi.mocked(labelsApi)

function label(id: string, name: string, color = "#3b82f6") {
  return { id, name, color, createdAt: "2026-08-01T10:00:00.000Z" }
}

function mountDialog() {
  const pinia = createPinia()
  return mount(LabelManagerDialog, {
    props: { open: true },
    global: { plugins: [pinia], stubs: { teleport: true } },
  })
}

describe("LabelManagerDialog (3.10)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getLabels.mockResolvedValue([label("a", "Dividend", "#ef4444"), label("b", "Fund")])
    mocked.createLabel.mockResolvedValue(label("c", "Core"))
    mocked.updateLabel.mockResolvedValue(label("a", "Dividends!", "#f59e0b"))
    mocked.deleteLabel.mockResolvedValue(undefined)
  })

  it("loads and lists the user's labels", async () => {
    const w = mountDialog()
    await flushPromises()
    expect(w.text()).toContain("Dividend")
    expect(w.text()).toContain("Fund")
  })

  it("creates a new label from the form", async () => {
    const w = mountDialog()
    await flushPromises()
    await w.find('input[placeholder="e.g. Dividend"]').setValue("Core")
    await w.find("form").trigger("submit")
    await flushPromises()
    expect(mocked.createLabel).toHaveBeenCalledWith({ name: "Core", color: expect.any(String) })
    expect(w.text()).toContain("Core")
  })

  it("edits a label inline via Edit then Save", async () => {
    const w = mountDialog()
    await flushPromises()
    const firstRow = w.find(".group")
    await firstRow.find("button").trigger("click") // Edit (first row action)
    await flushPromises()
    await w.find('[data-testid="lm-edit-name"]').setValue("Dividends!")
    await w.findAll("button").find((b) => b.text() === "Save")!.trigger("click")
    await flushPromises()
    expect(mocked.updateLabel).toHaveBeenCalledWith("a", { name: "Dividends!", color: "#ef4444" })
  })

  it("confirms before deleting a label", async () => {
    const w = mountDialog()
    await flushPromises()
    // Delete button is the last action in the first row
    const firstRow = w.find(".group")
    const buttons = firstRow.findAll("button")
    await buttons[buttons.length - 1].trigger("click")
    await flushPromises()
    expect(w.text()).toContain("Delete label?")
    await w.find('[data-testid="lm-confirm-delete"]').trigger("click")
    await flushPromises()
    expect(mocked.deleteLabel).toHaveBeenCalledWith("a")
    expect(w.text()).not.toContain("Dividend")
  })
})