import { nextTick } from "vue"
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import LabelPickerPopover from "@/components/LabelPickerPopover.vue"
import * as labelsApi from "@/api/labels"

vi.mock("@/api/labels", async (importOriginal) => {
  const actual = await importOriginal<typeof labelsApi>()
  return {
    ...actual,
    getLabels: vi.fn(),
    createLabel: vi.fn(),
    setPositionLabels: vi.fn(),
    setTransactionLabels: vi.fn(),
    setWalletTransactionLabels: vi.fn(),
  }
})

const mocked = vi.mocked(labelsApi)

function label(id: string, name: string, color = "#3b82f6") {
  return { id, name, color }
}

function makePinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

function mountPopover(props: Record<string, unknown>) {
  return mount(LabelPickerPopover, {
    props: { open: true, entityId: "pos1", entityKind: "position", currentLabels: [], ...props },
    global: { plugins: [makePinia()] },
  })
}

describe("LabelPickerPopover (3.11)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getLabels.mockResolvedValue([label("a", "Dividend"), label("b", "Fund")])
    mocked.setPositionLabels.mockResolvedValue([label("b", "Fund")])
    mocked.setTransactionLabels.mockResolvedValue([])
    mocked.setWalletTransactionLabels.mockResolvedValue([])
  })

  it("syncs the current labels as checked on open", async () => {
    const w = mountPopover({ currentLabels: [label("a", "Dividend")] })
    await flushPromises()
    const checks = w.findAll('input[type="checkbox"]')
    expect(checks).toHaveLength(2)
    expect((checks[0].element as HTMLInputElement).checked).toBe(true)
    expect((checks[1].element as HTMLInputElement).checked).toBe(false)
  })

  it("saves the checked set and emits saved on Save", async () => {
    const w = mountPopover({})
    await flushPromises()
    const checks = w.findAll('input[type="checkbox"]')
    await checks[1].setValue(true)
    await w.findAll("button").find((b) => b.text() === "Save")!.trigger("click")
    await flushPromises()
    expect(mocked.setPositionLabels).toHaveBeenCalledWith("pos1", ["b"])
    expect(w.emitted("saved")).toBeTruthy()
    expect(w.emitted("close")).toBeTruthy()
  })

  it("routes transaction kind to setTransactionLabels with the portfolio id", async () => {
    const w = mountPopover({ entityKind: "transaction", portfolioId: "pf1" })
    await flushPromises()
    await w.findAll("button").find((b) => b.text() === "Save")!.trigger("click")
    await flushPromises()
    expect(mocked.setTransactionLabels).toHaveBeenCalledWith("pf1", "pos1", [])
  })

  it("routes cash-transaction kind to setWalletTransactionLabels", async () => {
    const w = mountPopover({ entityKind: "cash-transaction", walletId: "w1" })
    await flushPromises()
    await w.findAll("button").find((b) => b.text() === "Save")!.trigger("click")
    await flushPromises()
    expect(mocked.setWalletTransactionLabels).toHaveBeenCalledWith("w1", "pos1", [])
  })

  it("creates a new label inline and auto-checks it", async () => {
    mocked.createLabel.mockResolvedValue(label("c", "Core", "#10b981"))
    const w = mountPopover({})
    await flushPromises()
    await w.findAll("button").find((b) => b.text().includes("Create new label"))!.trigger("click")
    await w.find('input[placeholder="Label name"]').setValue("Core")
    await w.findAll("button").find((b) => b.text() === "Create")!.trigger("click")
    await flushPromises()
    await nextTick()
    expect(mocked.createLabel).toHaveBeenCalledWith({ name: "Core", color: expect.any(String) })
    // Initial labels: Dividend, Fund. After adding Core, sorted = [Core, Dividend, Fund]
    const checks = w.findAll('input[type="checkbox"]')
    expect(checks).toHaveLength(3)
    expect((checks[0].element as HTMLInputElement).checked).toBe(true) // Core — sorted first, just created & selected
  })
})