import { describe, expect, it } from "vitest"
import {
  computePopoverPosition,
  triggerRectFromEvent,
  ESTIMATED_PANEL,
  VIEWPORT_MARGIN,
} from "@/utils/popoverPosition"

const viewport = { width: 1280, height: 720 }
const panel = { width: 288, height: 320 }

describe("computePopoverPosition", () => {
  it("places the panel below the trigger with the right edges aligned", () => {
    // A row button at x 900–1000, y 300–328.
    const pos = computePopoverPosition(
      { top: 300, right: 1000, bottom: 328, left: 900 },
      panel,
      viewport,
    )
    expect(pos.left).toBe(1000 - panel.width)
    expect(pos.top).toBe(328 + 8)
  })

  it("flips above the trigger when there is no room below", () => {
    // Same button, but near the bottom: 328 + 8 + 320 = 656 still fits in 720,
    // so push the trigger down past the fold.
    const pos = computePopoverPosition(
      { top: 600, right: 1000, bottom: 628, left: 900 },
      panel,
      viewport,
    )
    expect(pos.top).toBe(600 - 8 - panel.height)
  })

  it("clamps left to the viewport margin in a narrow viewport", () => {
    const pos = computePopoverPosition(
      { top: 300, right: 40, bottom: 328, left: 0 },
      panel,
      { width: 200, height: 720 },
    )
    expect(pos.left).toBe(VIEWPORT_MARGIN)
  })

  it("never returns a negative top, even for a trigger above the fold", () => {
    const pos = computePopoverPosition(
      { top: 4, right: 1000, bottom: 32, left: 900 },
      { width: 288, height: 900 },
      viewport,
    )
    expect(pos.top).toBe(VIEWPORT_MARGIN)
    expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN)
  })

  it("keeps the panel inside the viewport when the trigger is at the far right", () => {
    const pos = computePopoverPosition(
      { top: 300, right: 1280, bottom: 328, left: 1180 },
      panel,
      viewport,
    )
    expect(pos.left + panel.width).toBeLessThanOrEqual(viewport.width - VIEWPORT_MARGIN)
  })

  it("exposes an estimated panel size for the first paint", () => {
    expect(ESTIMATED_PANEL).toEqual({ width: 288, height: 320 })
  })
})

describe("triggerRectFromEvent", () => {
  it("snapshots the rect of the event target", () => {
    const el = document.createElement("button")
    el.getBoundingClientRect = () =>
      ({ top: 10, right: 90, bottom: 38, left: 50 }) as DOMRect
    expect(triggerRectFromEvent(el)).toEqual({ top: 10, right: 90, bottom: 38, left: 50 })
  })

  it("returns null for a target that is not an element (or is gone)", () => {
    expect(triggerRectFromEvent(null)).toBeNull()
    expect(triggerRectFromEvent(new EventTarget())).toBeNull()
  })
})
