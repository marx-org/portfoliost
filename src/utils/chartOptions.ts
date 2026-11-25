/**
 * Shared ApexCharts title option builders.
 *
 * Charting keeps the visible HTML heading for page semantics and also sets the
 * built-in ApexCharts title so the title is part of the exported SVG/PNG. The
 * colours are intentionally left to CSS (`.apexcharts-title-text` and the
 * axis-title classes in `styles/main.css`) so the same options stay legible in
 * both light and dark themes.
 */

/** Built-in chart title. Keep `text` identical to the visible HTML heading. */
export function chartTitle(text: string) {
  return {
    text,
    align: "left" as const,
    margin: 16,
    style: { fontSize: "14px", fontWeight: 600 },
  }
}

/** Axis title carrying the unit (`PLN`, `%`, count, …). */
export function axisTitle(text: string) {
  return {
    text,
    style: { fontSize: "12px", fontWeight: 500 },
  }
}