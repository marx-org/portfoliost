import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import CollapsibleSection from "@/components/CollapsibleSection.vue"

describe("CollapsibleSection", () => {
  it("is collapsed by default and reveals its body on toggle", async () => {
    const wrapper = mount(CollapsibleSection, {
      props: { title: "Sector Weights", testid: "demo-table" },
      slots: { default: '<div class="body">row</div>' },
    })

    const toggle = wrapper.get('[data-testid="demo-table-toggle"]')
    const body = wrapper.get('[data-testid="demo-table-body"]')
    expect(toggle.attributes("aria-expanded")).toBe("false")
    // v-show keeps the markup and hides it with an inline display:none.
    expect((body.element as HTMLElement).style.display).toBe("none")

    await toggle.trigger("click")
    expect(toggle.attributes("aria-expanded")).toBe("true")
    expect((body.element as HTMLElement).style.display).toBe("")
    expect(wrapper.get(".body").text()).toBe("row")
  })

  it("keeps the body in the DOM while collapsed, so tests read the same markup", () => {
    const wrapper = mount(CollapsibleSection, {
      props: { title: "Holdings", testid: "demo-table" },
      slots: { default: "<table><tbody><tr><td>row</td></tr></tbody></table>" },
    })

    expect(wrapper.find('[data-testid="demo-table"] tbody tr').exists()).toBe(true)
    expect(wrapper.find('[data-testid="demo-table"] tbody tr').text()).toBe("row")
  })

  it("uses the card frame by default and a plain frame on request", () => {
    const card = mount(CollapsibleSection, { props: { title: "T" } })
    expect(card.classes()).toContain("card")

    const plain = mount(CollapsibleSection, { props: { title: "T", variant: "plain" } })
    expect(plain.classes()).not.toContain("card")
  })
})