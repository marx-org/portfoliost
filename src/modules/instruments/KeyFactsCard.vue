<script setup lang="ts">
/**
 * §86 — the Key Facts card, one block per asset class.
 *
 * Two blocks: the shared identity rows every class has (Name, Country with its
 * flag, ISIN, Exchange, plus the weburl link), then the class-specific rows
 * driven entirely by `profile.keyFacts.kind` through `KEY_FACT_ROWS`.
 *
 * The heading and the `card p-6` wrapper live here rather than in the parent, so
 * mounting this component is a one-line change at the call site and the markup is
 * identical to the hard-coded card it replaces.
 */
import { computed } from "vue"
import {
  DASH,
  KEY_FACT_ROWS,
  PROFILE_FIELD,
  type KeyFactRow,
  type KeyFacts,
  type RowContext,
} from "./keyFactsRows"
import type { InstrumentsProfile } from "@/api/types"

const props = defineProps<{ profile: InstrumentsProfile }>()

interface ResolvedRow {
  label: string
  value: string
}

const keyFacts = computed<KeyFacts | null>(() => props.profile.keyFacts ?? null)

/** The class-specific rows: the profile's own class when known, the equity four
 *  when not — see `PROFILE_FIELD`. */
const classRows = computed<ReadonlyArray<KeyFactRow>>(() =>
  keyFacts.value ? KEY_FACT_ROWS[keyFacts.value.kind] : KEY_FACT_ROWS.stock,
)

const classRowsResolved = computed<ResolvedRow[]>(() => {
  const ctx: RowContext = { facts: keyFacts.value, profile: props.profile }
  return classRows.value.map((row) => {
    const field = keyFacts.value ? row.field : (PROFILE_FIELD[row.field] ?? row.field)
    const source = (keyFacts.value ?? props.profile) as Record<string, unknown>
    const raw = source[field]
    return {
      label: typeof row.label === "function" ? row.label(ctx) : row.label,
      value: row.format(raw, ctx),
    }
  })
})

const identityRows = computed<ResolvedRow[]>(() => {
  const p = props.profile
  return [
    { label: "Name", value: p.name ?? DASH },
    { label: "Country", value: p.country ?? DASH },
    { label: "ISIN", value: p.isin ?? DASH },
    { label: "Exchange", value: p.exchange ?? DASH },
  ]
})

const countryFlag = computed(() =>
  props.profile.countryCode
    ? `https://flagcdn.com/w40/${props.profile.countryCode.toLowerCase()}.png`
    : null,
)

const weburlLabel = computed(() => props.profile.weburl?.replace(/^https?:\/\//, "") ?? null)

/**
 * A symbol with neither identity nor class-specific facts gets no card at all.
 * Six dashes under a heading called "Key Facts" is worse than the "Limited data
 * availability" banner the page already shows for exactly that case.
 */
const hasSomethingToSay = computed(
  () => Boolean(keyFacts.value) || identityRows.value.some((r) => r.value !== DASH),
)
</script>

<template>
  <div v-if="hasSomethingToSay" class="card p-6" data-testid="key-facts-card">
    <h2 class="mb-3 text-base font-semibold">Key Facts</h2>
    <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <template v-for="row in identityRows" :key="`id-${row.label}`">
        <dt class="text-slate-500 dark:text-slate-400">{{ row.label }}</dt>
        <dd v-if="row.label === 'Country'" class="flex items-center gap-1.5">
          <img
            v-if="countryFlag"
            :src="countryFlag"
            :alt="profile.country ?? ''"
            class="h-3 w-[18px] rounded-[1px] object-cover"
            loading="lazy"
          />
          <span>{{ row.value }}</span>
        </dd>
        <dd v-else-if="row.label === 'ISIN'" class="tabular-nums">{{ row.value }}</dd>
        <dd v-else>{{ row.value }}</dd>
      </template>
      <template v-for="row in classRowsResolved" :key="`kf-${row.label}`">
        <dt class="text-slate-500 dark:text-slate-400">{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </template>
    </dl>
    <a
      v-if="weburlLabel"
      :href="profile.weburl ?? undefined"
      target="_blank"
      rel="noopener"
      class="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline"
    >
      {{ weburlLabel }}
    </a>
  </div>
</template>