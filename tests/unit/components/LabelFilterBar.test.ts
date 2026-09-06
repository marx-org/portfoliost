import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import LabelFilterBar from "@/components/LabelFilterBar.vue"
import * as labelsApi from "@/api/labels"

vi.mock("@/api/labels", async (importOriginal) => {
  const actual = await importOriginal<typeof labelsApi>()
  return { ...actual, getLabels: vi.fn(), createLabel: vi.fn(), updateLabel: vi.fn(), deleteLabel: vi.fn() }
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

describe("LabelFilterBar (3.12)", () => {
  beforeEach(() => {
    mocked.getLabels.mockResolvedValue([label("a", "Dividend"), label("b", "Fund"), label("c", "Speculative")])
  })

  it("renders all labels plus a Manage labels link", async () => {
    const w = mount(LabelFilterBar, { props: { modelValue: [] }, global: { plugins: [makePinia()] } })
    await flushPromises()
    expect(w.text()).toContain("Dividend")
    expect(w.text()).toContain("Fund")
    expect(w.text()).toContain("Speculative")
    expect(w.text()).toContain("Manage labels")
  })

  it("clicking an inactive label emits it as selected", async () => {
    const w = mount(LabelFilterBar, {
      props: { modelValue: [], "onUpdate:modelValue": (v: string[]) => w.setProps({ modelValue: v }) },
      global: { plugins: [makePinia()] },
    })
    await flushPromises()
    await w.findAllComponents({ name: "LabelBadge" })[0].trigger("click")
    expect(w.props("modelValue")).toEqual(["a"])
  })

  it("clicking an active label removes it from the selection", async () => {
    const w = mount(LabelFilterBar, {
      props: { modelValue: ["a", "b"], "onUpdate:modelValue": (v: string[]) => w.setProps({ modelValue: v }) },
      global: { plugins: [makePinia()] },
    })
    await flushPromises()
    await w.findAllComponents({ name: "LabelBadge" })[0].trigger("click")
    expect(w.props("modelValue")).toEqual(["b"])
  })

  it("emits manage when the Manage labels link is clicked", async () => {
    const w = mount(LabelFilterBar, { props: { modelValue: [] }, global: { plugins: [makePinia()] } })
    await flushPromises()
    const manage = w.findAll("button").find((b) => b.text() === "Manage labels")!
    await manage.trigger("click")
    expect(w.emitted("manage")).toBeTruthy()
  })
})