const LABEL_HEX_PALETTE = [
  "#64748b", // slate
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
]

export interface LabelColorStyle {
  bg: string
  text: string
}

const STYLES: Record<string, LabelColorStyle> = {
  "#64748b": { bg: "rgba(100,116,139,0.18)", text: "#334155" },
  "#ef4444": { bg: "rgba(239,68,68,0.15)", text: "#991b1b" },
  "#f59e0b": { bg: "rgba(245,158,11,0.16)", text: "#92400e" },
  "#10b981": { bg: "rgba(16,185,129,0.14)", text: "#065f46" },
  "#3b82f6": { bg: "rgba(59,130,246,0.14)", text: "#1e40af" },
  "#a855f7": { bg: "rgba(168,85,247,0.14)", text: "#6b21a8" },
  "#ec4899": { bg: "rgba(236,72,153,0.14)", text: "#9d174d" },
  "#06b6d4": { bg: "rgba(6,182,212,0.14)", text: "#155e75" },
  "#f97316": { bg: "rgba(249,115,22,0.15)", text: "#9a3412" },
  "#14b8a6": { bg: "rgba(20,184,166,0.14)", text: "#115e59" },
}

const DEFAULT_STYLE: LabelColorStyle = { bg: "rgba(100,116,139,0.18)", text: "#334155" }

export function labelColors(hex: string): LabelColorStyle {
  return STYLES[hex] ?? DEFAULT_STYLE
}

export const labelPaletteHexes: readonly string[] = LABEL_HEX_PALETTE
