import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import LabelBadge from "@/components/LabelBadge.vue"
import LabelChips from "@/components/LabelChips.vue"

function label(id: string, name: string, color = "#3b82f6") {
  return { id, name, color }
}

describe("LabelBadge (3.9)", () => {
  it("renders the label name with inline palette colors", () => {
    const w = mount(LabelBadge, { props: { label: label("1", "Dividend") } })
    expect(w.text()).toBe("Dividend")
    const style = w.attributes("style") ?? ""
    expect(style).toContain("background-color")
    expect(style).toContain("color")
  })

  it("shows the active ring when selected", () => {
    const w = mount(LabelBadge, { props: { label: label("1", "Dividend"), active: true } })
    expect(w.classes()).toContain("ring-2")
  })

  it("emits click when the badge is clicked", async () => {
    const w = mount(LabelBadge, { props: { label: label("1", "Dividend") } })
    await w.trigger("click")
    expect(w.emitted("click")).toBeTruthy()
  })

  it("emits remove when the removable x is clicked (and not click)", async () => {
    const w = mount(LabelBadge, { props: { label: label("1", "Dividend"), removable: true } })
    await w.find("button").trigger("click")
    expect(w.emitted("remove")).toBeTruthy()
    expect(w.emitted("click")).toBeUndefined()
  })
})

describe("LabelChips (3.9)", () => {
  const many = Array.from({ length: 12 }, (_, i) => label(String(i), `L${i}`, i % 2 ? "#ef4444" : "#3b82f6"))

  it("shows the first 10 badges plus an +N pill", () => {
    const w = mount(LabelChips, { props: { labels: many } })
    expect(w.findAllComponents(LabelBadge)).toHaveLength(10)
    expect(w.text()).toContain("+2")
  })

  it("shows all badges when under the limit", () => {
    const w = mount(LabelChips, { props: { labels: many.slice(0, 3) } })
    expect(w.findAllComponents(LabelBadge)).toHaveLength(3)
    expect(w.text()).not.toContain("+")
  })
})