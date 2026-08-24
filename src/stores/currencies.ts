import { http } from "../api/client"
import { defineStore } from "pinia"
import { computed, ref } from "vue"

export interface CurrencyInfo {
  code: string
  name: string
  symbol: string
  minorUnits: number
  popular: boolean
}

type CurrenciesResponse = { currencies: CurrencyInfo[] }

export const useCurrenciesStore = defineStore("currencies", () => {
  const currencies = ref<CurrencyInfo[]>([])
  const loaded = ref(false)
  let inflight: Promise<void> | null = null

  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const data = await http.get<CurrenciesResponse>("/api/currencies")
        // EUR first, then popular, then the rest — stable selector ordering
        currencies.value = [...data.currencies].sort(
          (a, b) => Number(b.code === "EUR") - Number(a.code === "EUR") || Number(b.popular) - Number(a.popular),
        )
        loaded.value = true
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  const options = computed(() => currencies.value)

  function info(code: string): CurrencyInfo | undefined {
    return currencies.value.find((c) => c.code === code.toUpperCase())
  }

  function minorUnits(code: string): number {
    return info(code)?.minorUnits ?? 2
  }

  return { currencies, options, loaded, load, info, minorUnits }
})
