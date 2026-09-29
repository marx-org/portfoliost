<script lang="ts">
/**
 * Asset-type display words. The contract enum (`STOCK` / `ETF` / `CORP_BOND` / …)
 * is not what a reader wants to see, and the mixed-case forms the tiers emit
 * ("Stock", "corp_bond") are not either — so exactly one place maps it.
 */
const ASSET_TYPE_LABELS: Record<string, string> = {
  STOCK: "Stock",
  ETF: "ETF",
  FUND: "Fund",
  // `ticker_reference.asset_type` stores the venue's own word for a Polish
  // fund-of-investments line; instruments' `toInstrumentType` maps it to FUND.
  TFI: "Fund",
  BOND: "Bond",
  CORP_BOND: "Bond",
  CRYPTO: "Crypto",
  CURRENCY: "Currency",
  INDEX: "Index",
  CFD: "CFD",
}

export function formatAssetType(t: string | null | undefined): string {
  const raw = (t ?? "").trim()
  if (!raw) return ""
  const upper = raw.toUpperCase()
  const known = ASSET_TYPE_LABELS[upper]
  if (known) return known
  // Already displayable ("Stock") or an unknown class — title-case, never guess
  // a label for a class the map does not know.
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

/**
 * The `(PL) Stock` details line. `null` when there is nothing to say, so a
 * caller can omit the line entirely rather than render an empty one.
 */
export function tickerDetails(
  countryCode?: string | null,
  assetType?: string | null,
): string | null {
  const cc = (countryCode ?? "").trim().toUpperCase()
  const kind = formatAssetType(assetType)
  const parts = [cc ? `(${cc})` : "", kind ? kind : ""].filter(Boolean)
  return parts.length ? parts.join(" ") : null
}
</script>

<script setup lang="ts">
import { computed } from "vue"

const props = withDefaults(
  defineProps<{
    symbol: string
    name?: string | null
    /** 2-letter ISO code; uppercased on render. */
    countryCode?: string | null
    /** Contract enum form (`STOCK`/`ETF`/…) or an already-displayable word. */
    assetType?: string | null
    size?: "sm" | "md" | "lg"
    align?: "left" | "right"
    titleAs?: "div" | "h1" | "h2"
    testid?: string
  }>(),
  { size: "md", align: "left", titleAs: "div", testid: "ticker-badge" },
)

const tid = props.testid
const details = computed(() => tickerDetails(props.countryCode, props.assetType))
const logoClass = computed(
  () =>
    ({
      sm: "h-5 w-5",
      md: "h-6 w-6",
      lg: "h-8 w-8",
    })[props.size],
)
const rowClass = computed(() =>
  props.align === "right"
    ? "flex min-w-0 flex-row-reverse items-center gap-2.5 text-right"
    : "flex min-w-0 items-center gap-2.5",
)
const tickerClass = computed(() =>
  props.titleAs === "div" ? "truncate font-medium" : "truncate font-semibold",
)
</script>

<template>
  <div :data-testid="tid" :class="rowClass">
    <img
      :src="`/api/logos/${symbol}`"
      :alt="symbol"
      loading="lazy"
      class="shrink-0 rounded-[9px] object-contain"
      :class="[logoClass, 'bg-slate-100 dark:bg-slate-800']"
    />
    <div class="min-w-0">
      <div class="flex min-w-0 items-baseline gap-1.5 text-slate-900 dark:text-slate-100" :class="align === 'right' ? 'justify-end' : ''">
        <component :is="titleAs" :class="[tickerClass, titleAs === 'div' ? 'text-sm' : '']">
          {{ symbol }}
        </component>
        <span
          v-if="details"
          :data-testid="`${tid}-details`"
          class="truncate text-[11px] text-slate-400 dark:text-slate-500"
        >
          {{ details }}
        </span>
      </div>
      <p
        v-if="name"
        :data-testid="`${tid}-name`"
        class="truncate text-xs text-slate-500 dark:text-slate-400"
      >
        {{ name }}
      </p>
    </div>
  </div>
</template>
