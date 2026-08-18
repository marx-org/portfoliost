import { http } from "./client"
import type { components } from "../../generated/api-types"

type ResearchCompare = components["schemas"]["ResearchCompare"]

export interface ChartingPreset {
  name: string
  description?: string
  symbols: string[]
  metric: keyof ResearchCompare
}

export async function getChartingCompare(symbols: string[]): Promise<ResearchCompare[]> {
  const q = new URLSearchParams({ symbols: symbols.join(",") })
  return http.get<ResearchCompare[]>(`/api/charting/compare?${q}`)
}

export async function getChartingPresets(): Promise<ChartingPreset[]> {
  return http.get<ChartingPreset[]>(`/api/charting/presets`)
}
