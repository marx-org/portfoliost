<script lang="ts">
export interface DividendTotals {
  quant: number
  gross: number
  tax: number
  net: number
  price: number
  taxExceedsGross: boolean
}

// Shared gross/tax/net math for the dividend forms (§50.8). Total mode: the
// gross input is the amount; per-share mode: gross = quantity × per-share.
export function dividendTotals(
  perShare: boolean,
  grossTotal: string,
  perShareGross: string,
  quantity: string | number,
  taxes: string | number,
): DividendTotals {
  const quant = Number(quantity) || 0
  const raw = perShare ? quant * (Number(perShareGross) || 0) : Number(grossTotal) || 0
  const gross = Math.round(raw * 1e8) / 1e8
  const tax = Math.round((Number(taxes) || 0) * 1e8) / 1e8
  const net = Math.round((gross - tax) * 1e8) / 1e8
  const price = quant ? Math.round((gross / quant) * 1e8) / 1e8 : 0
  return { quant, gross, tax, net, price, taxExceedsGross: gross > 0 && tax > gross }
}
</script>

<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{
  /** transaction currency code (e.g. "USD") — shown in the summary rows */
  txCcy: string
  /** currency symbol for the input prefixes (from the /api/currencies registry; fallback: the code) */
  ccySymbol: string
  /** testid prefix (record dialog → "dividend", edit modal → "edit-tx") */
  testid?: string
  /** Total Amount / Per Share entry mode */
  perShare: boolean
  /** total-mode gross input */
  grossTotal: string
  /** per-share-mode per-share input */
  perShareGross: string
  /** shares (held quantity in total mode; editable in per-share mode) */
  quantity: string
  /** withholding tax input */
  taxes: string
  /** receive date (YYYY-MM-DD) */
  date: string
  /** notes */
  notes: string
  /** optional cross-currency converted net for the summary (absent ccy = no row) */
  convertedNet?: number | null
  convertedCcy?: string
}>()

const emit = defineEmits<{
  (e: "update:perShare", v: boolean): void
  (e: "update:grossTotal", v: string): void
  (e: "update:perShareGross", v: string): void
  (e: "update:quantity", v: string): void
  (e: "update:taxes", v: string): void
  (e: "update:date", v: string): void
  (e: "update:notes", v: string): void
}>()

const tid = props.testid ?? "dividend"

const totals = computed(() =>
  dividendTotals(props.perShare, props.grossTotal, props.perShareGross, props.quantity, props.taxes),
)
</script>

<template>
  <div class="mb-4 flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800/60">
    <button
      type="button"
      class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
      :class="!perShare ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 dark:text-slate-400'"
      :data-testid="`${tid}-mode-total`"
      @click="emit('update:perShare', false)"
    >
      Total Amount
    </button>
    <button
      type="button"
      class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
      :class="perShare ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 dark:text-slate-400'"
      :data-testid="`${tid}-mode-pershare`"
      @click="emit('update:perShare', true)"
    >
      Per Share
    </button>
  </div>

  <slot name="after-toggle" />

  <template v-if="!perShare">
    <label class="mb-1.5 block text-sm font-medium" :for="`${tid}-gross`">Gross dividend amount</label>
    <div class="relative mb-4">
      <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">{{ ccySymbol }}</span>
      <input
        :id="`${tid}-gross`"
        :value="grossTotal"
        type="number"
        min="0"
        step="any"
        placeholder="0.00"
        class="input pl-7"
        :data-testid="`${tid}-gross`"
        @input="emit('update:grossTotal', ($event.target as HTMLInputElement).value)"
      />
    </div>
  </template>

  <div v-else class="mb-4 grid grid-cols-2 gap-3">
    <div>
      <label class="mb-1.5 block text-sm font-medium" :for="`${tid}-gross-pershare`">Dividend per share</label>
      <div class="relative">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">{{ ccySymbol }}</span>
        <input
          :id="`${tid}-gross-pershare`"
          :value="perShareGross"
          type="number"
          min="0"
          step="any"
          placeholder="0.00"
          class="input pl-7"
          :data-testid="`${tid}-gross`"
          @input="emit('update:perShareGross', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
    <div>
      <label class="mb-1.5 block text-sm font-medium" :for="`${tid}-shares`">Shares receiving dividend</label>
      <input
        :id="`${tid}-shares`"
        :value="quantity"
        type="number"
        min="0"
        step="any"
        class="input"
        :data-testid="`${tid}-shares`"
        @input="emit('update:quantity', ($event.target as HTMLInputElement).value)"
      />
    </div>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div>
      <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium" :for="`${tid}-tax`">
        Withholding Tax
        <span
          class="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300"
          title="Tax withheld at source; subtracted from the gross dividend amount"
        >i</span>
      </label>
      <div class="relative">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">{{ ccySymbol }}</span>
        <input
          :id="`${tid}-tax`"
          :value="taxes"
          type="number"
          min="0"
          step="any"
          placeholder="0.00"
          class="input pl-7"
          :data-testid="`${tid}-tax`"
          @input="emit('update:taxes', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
    <div>
      <label class="mb-1.5 block text-sm font-medium" :for="`${tid}-date`">Date received</label>
      <input :id="`${tid}-date`" :value="date" type="date" class="input" :data-testid="`${tid}-date`" @input="emit('update:date', ($event.target as HTMLInputElement).value)" />
    </div>
  </div>

  <p v-if="totals.taxExceedsGross" class="mb-4 mt-1.5 text-xs text-red-600 dark:text-red-400" :data-testid="`${tid}-tax-error`">
    Withholding tax cannot exceed the gross dividend amount
  </p>

  <label class="mb-1.5 mt-4 block text-sm font-medium" :for="`${tid}-notes`">Notes (optional)</label>
  <textarea
    :id="`${tid}-notes`"
    :value="notes"
    rows="3"
    placeholder="e.g. Q4 2024 dividend"
    class="input mb-4 resize-y"
    :data-testid="`${tid}-notes`"
    @input="emit('update:notes', ($event.target as HTMLTextAreaElement).value)"
  ></textarea>

  <slot name="before-summary" />

  <div class="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50" :data-testid="`${tid}-summary`">
    <div class="flex justify-between py-0.5">
      <span class="text-slate-500 dark:text-slate-400">Gross Dividend</span>
      <span class="tabular-nums">{{ totals.gross.toFixed(2) }} {{ txCcy }}</span>
    </div>
    <div class="flex justify-between py-0.5">
      <span class="text-slate-500 dark:text-slate-400">Withholding Tax</span>
      <span class="tabular-nums text-red-600 dark:text-red-400" :data-testid="`${tid}-tax-total`">
        -{{ totals.tax.toFixed(2) }} {{ txCcy }}
      </span>
    </div>
    <div class="mt-1 flex justify-between border-t border-slate-200 pt-1.5 font-semibold dark:border-slate-700/60">
      <span>Net Amount</span>
      <span class="tabular-nums text-green-600 dark:text-green-400" :data-testid="`${tid}-net`">{{ totals.net.toFixed(2) }} {{ txCcy }}</span>
    </div>
    <div v-if="convertedCcy" class="flex justify-between py-0.5 text-xs text-slate-500 dark:text-slate-400">
      <span>Net ({{ convertedCcy }})</span>
      <span class="tabular-nums" :data-testid="`${tid}-converted`">
        {{ convertedNet != null ? `${convertedNet.toFixed(2)} ${convertedCcy}` : "—" }}
      </span>
    </div>
  </div>
</template>
