import { createPinia, setActivePinia, type Pinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useLabelsStore } from "@/stores/labels"
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

describe("labels store (3.8)", () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  it("starts empty", () => {
    const store = useLabelsStore()
    expect(store.labels).toEqual([])
  })

  it("loads labels sorted alphabetically by name", async () => {
    mocked.getLabels.mockResolvedValue([label("z", "Zeta"), label("a", "Alpha"), label("m", "Mid")])
    const store = useLabelsStore()
    await store.fetchLabels()
    expect(store.labels.map((l) => l.name)).toEqual(["Alpha", "Mid", "Zeta"])
  })

  it("records the error when loading fails", async () => {
    mocked.getLabels.mockRejectedValue(new Error("boom"))
    const store = useLabelsStore()
    await expect(store.fetchLabels()).rejects.toThrow("boom")
    expect(store.error).toBe("boom")
  })

  it("adds a label and keeps the list sorted", async () => {
    mocked.getLabels.mockResolvedValue([label("a", "Alpha")])
    mocked.createLabel.mockResolvedValue(label("b", "Beta"))
    const store = useLabelsStore()
    await store.fetchLabels()
    await store.addLabel({ name: "Beta", color: "#ef4444" })
    expect(store.labels.map((l) => l.name)).toEqual(["Alpha", "Beta"])
  })

  it("edits a label in place", async () => {
    mocked.getLabels.mockResolvedValue([label("a", "Alpha")])
    mocked.updateLabel.mockResolvedValue(label("a", "Alpha!", "#ef4444"))
    const store = useLabelsStore()
    await store.fetchLabels()
    await store.editLabel("a", { name: "Alpha!", color: "#ef4444" })
    expect(store.labels[0].name).toBe("Alpha!")
    expect(store.labels[0].color).toBe("#ef4444")
  })

  it("removes a label", async () => {
    mocked.getLabels.mockResolvedValue([label("a", "Alpha"), label("b", "Beta")])
    mocked.deleteLabel.mockResolvedValue(undefined)
    const store = useLabelsStore()
    await store.fetchLabels()
    expect(store.labels).toHaveLength(2)
    await store.removeLabel("a")
    expect(store.labels.map((l) => l.id)).toEqual(["b"])
  })
})