/**
 * Shared ApexCharts title/axis/chart options.
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

type AnyObject = Record<string, any>

/**
 * Shared chart chrome for every ApexCharts surface, re-based on the token layer:
 * token-driven gridlines and axis labels, a muted `foreColor` (legend text, axis
 * titles, data-label colour) and a soft gradient fill for area charts.
 *
 * Everything here is a CSS custom property, not a resolved hex, so the whole
 * layer flips with the theme without rebuilding the options. Merge it into a
 * chart's own options object with `withSharedChart` — chart-local keys (types,
 * heights, colors, formatters, titles, series) always win.
 *
 * Two deliberate differences from a bare object spread: `chart`, `grid` and
 * `xaxis`/`yaxis` merge one level deep (so a chart that sets its own `xaxis`
 * categories keeps the shared label styles underneath), and `yaxis` may be an
 * array (multi-axis charts) — each entry merges the same way. `fill` is NOT
 * merged: charts that render bars, donuts or scatter points must pass
 * `fill: { type: "solid" }` explicitly (a gradient fill washes those data out).
 */
export function sharedChartOptions(): AnyObject {
  return {
    chart: {
      // Drives the legend text, axis-title text and data-label colour. Charts
      // keep their own `type`/`height`/`toolbar` keys on top of this.
      foreColor: "var(--muted)",
    },
    grid: { borderColor: "var(--border)" },
    xaxis: { labels: { style: { colors: "var(--muted)" } } },
    yaxis: { labels: { style: { colors: "var(--muted)" } } },
    // Area/line-style gradient fill. Bar, donut and scatter charts override
    // with `fill: { type: "solid" }`; multi-series line charts leave it alone
    // (inert for line charts in this ApexCharts version).
    fill: {
      type: "gradient" as const,
      gradient: { opacityFrom: 0.25, opacityTo: 0, shadeIntensity: 1 },
    },
  }
}

function mergeAxis(shared: AnyObject, local: AnyObject | undefined): AnyObject {
  const merged = { ...shared, ...(local ?? {}) }
  merged.labels = {
    ...(shared?.labels ?? {}),
    ...(local?.labels ?? {}),
    style: {
      ...(shared?.labels?.style ?? {}),
      ...(local?.labels?.style ?? {}),
    },
  }
  return merged
}

/**
 * Merge the shared chart config into a chart's own options object.
 *
 * Chart-local keys win at the top level; `chart`, `grid`, `xaxis` and `yaxis`
 * merge one level deep (labels merge two levels deep), so a chart that sets
 * its own `xaxis` categories or `yaxis` formatter keeps the shared axis chrome
 * underneath. `fill` is NOT merged — chart-local `fill` always wins.
 */
export function withSharedChart<T extends AnyObject>(options: T): T {
  const shared = sharedChartOptions()
  const merged: AnyObject = { ...shared, ...options }

  merged.chart = { ...shared.chart, ...(options.chart ?? {}) }
  merged.grid = { ...shared.grid, ...(options.grid ?? {}) }

  merged.xaxis = mergeAxis(shared.xaxis, options.xaxis)
  merged.yaxis = Array.isArray(options.yaxis)
    ? options.yaxis.map((axis) => mergeAxis(shared.yaxis, axis))
    : mergeAxis(shared.yaxis, options.yaxis)

  merged.fill = options.fill ?? shared.fill

  // The merged object is the chart's own options plus the shared chrome keys;
  // structurally it satisfies `T` (extra keys are allowed).
  return merged as T
}
