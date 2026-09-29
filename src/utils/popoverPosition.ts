/**
 * Floating-popover placement (D57 / plan §57.1).
 *
 * The label picker used to be `position: absolute` inside a detached zero-height
 * anchor div, which collapsed to the card's left edge and (inside a
 * `card overflow-hidden`) got clipped away. It is now a `position: fixed` panel
 * teleported to `document.body`, placed from the trigger's rect captured at
 * click time — so this module owns the geometry and nothing else.
 */

/** Rect of the clicked trigger, in viewport coordinates. */
export interface TriggerRect {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PanelSize {
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export interface PopoverPosition {
  top: number
  left: number
}

/** Distance between the trigger and the panel. */
export const POPOVER_GAP = 8

/** Minimum distance kept between the panel and the viewport edges. */
export const VIEWPORT_MARGIN = 8

/** Panel size used for the first paint, before the panel can be measured. */
export const ESTIMATED_PANEL: PanelSize = { width: 288, height: 320 }

/**
 * Place the panel below the trigger, right edges aligned; flip above when there
 * is no room below, then clamp both axes inside the viewport.
 *
 * Pure: plain numbers in, plain numbers out, no DOM.
 */
export function computePopoverPosition(
  trigger: TriggerRect,
  panel: PanelSize,
  viewport: Viewport,
): PopoverPosition {
  const belowTop = trigger.bottom + POPOVER_GAP
  const fitsBelow = belowTop + panel.height <= viewport.height - VIEWPORT_MARGIN
  const top = fitsBelow
    ? belowTop
    : Math.max(VIEWPORT_MARGIN, trigger.top - POPOVER_GAP - panel.height)

  const rightAligned = trigger.right - panel.width
  const withinViewport = viewport.width - panel.width - VIEWPORT_MARGIN
  const left = Math.max(VIEWPORT_MARGIN, Math.min(rightAligned, withinViewport))

  return { top, left }
}

/**
 * Snapshot a trigger's rect at click time. The element itself may unmount
 * before the panel opens (the holdings kebab menu closes on click), so callers
 * keep the numbers, never the element.
 */
export function triggerRectFromEvent(target: EventTarget | null): TriggerRect | null {
  const el = target as Element | null
  if (!el || typeof el.getBoundingClientRect !== "function") return null
  const rect = el.getBoundingClientRect()
  return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }
}
