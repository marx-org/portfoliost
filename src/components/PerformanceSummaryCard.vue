<script setup lang="ts">
/**
 * PerformanceSummaryCard — the one performance summary used by both the
 * consolidated (cumulative) page and a single portfolio's Performance tab.
 *
 * It is a READ of the analytics payload: every figure is already on
 * `PortfolioAnalytics.performance` (totalValue, capitalBasis, totalReturn,
 * realized/unrealized gains, income, annualizedReturn/TWR, moneyWeightedReturn
 * /MWR, xirr). Money is converted base → display currency through the one
 * `useDisplayConversion` (D27/§66.3); rates are never converted.
 *
 * Each value carries a tooltip (title + accessible description) explaining what
 * it means and how it is calculated. Withheld rates show the reason, never a
 * confident 0.
 */
import { computed } from "vue"
import type { PortfolioAnalytics } from "@/api/types"
import { formatPercent, formatSignedCurrency } from "@/utils/format"
import { useDisplayConversion } from "@/composables/useDisplayConversion"
import InfoTip from "@/components/InfoTip.vue"

const props = withDefaults(
  defineProps<{
    /** `/:id/analytics` or `/merged`, cast to the one PortfolioAnalytics. */
    performance: PortfolioAnalytics["performance"] | null
    /** The base currency `performance` is denominated in. */
    baseCurrency: string
    /** Testid prefix (docs/COMPONENTS.md `${tid}-<field>`). */
    testid?: string
    /** Virtual portfolios are views over existing transactions, not cash books. */
    showInvested?: boolean
    /** Cash balance in the base currency (shown in the Value group when provided). */
    cashValue?: number | null
    /** Instruments (open-position) market value in the base currency. */
    instrumentsValue?: number | null
    /** Print the constant-currency caveat (aggregate mount only). */
    fxCaveat?: boolean
  }>(),
  { testid: "perf-summary", showInvested: true, fxCaveat: false },
)

function tid(id: string): string {
  return `${props.testid}-${id}`
}

const perf = computed(() => props.performance ?? null)

// Money rides the SAME conversion as the chart (never a bare × rate): no rate
// yet means no number, and the label falls back to the amount's own currency.
const { convert, displayCurrencyOr } = useDisplayConversion(() => props.baseCurrency)
const ccy = computed(() => displayCurrencyOr() ?? undefined)

// Tooltip copy for each field (rendered by InfoTip).
const tips = {
  total_value: 'Market value of everything: positions at market price plus cash, in your display currency.',
  total_invested: 'Net money you put in (deposits − withdrawals) plus the cost of shares transferred in or out. Excludes interest, fees and FX.',
  net_gain: 'Total value minus total invested. The % is that gain over total invested.',
  realized: 'Profit locked in when you sold, using FIFO cost basis. Cash in the bank from selling.',
  unrealized: 'Paper gain or loss on positions still open: market value minus cost.',
  income: 'Dividends received in the period, net of withholding tax.',
  twr: 'Time-weighted return per year: how the strategy performed with cash-flow timing removed. Chain-linked daily.',
  mwr: 'Money-weighted return over the period: the return your actual money earned, weighted by when you added or took out cash.',
  xirr: "Annualised money-weighted rate: the single yearly rate that discounts every cash flow to today's value.",
  cash: 'Cash balance across currencies, in your display currency.',
  instruments: 'Market value of open positions (instruments), in your display currency.',
}


/** base-currency money → display currency, formatted (null → "—"). */
function money(v: number | null | undefined): string {
  return formatSignedCurrency(convert(v), ccy.value)
}
/** A rate is currency-independent — never converted. */
function pct(v: number | null | undefined): string {
  return formatPercent(v, 2, true)
}

/** Sign colouring for a rate/money tile. Absent stays neutral, never "green 0%". */
function signClass(v: number | null | undefined): string {
  if (v == null || v === 0) return ""
  return v > 0 ? "text-emerald" : "text-danger"
}

/** Plain-language rendering of the contract's withheld reasons. */
function withheldText(reason: string | null | undefined): string {
  if (reason === "insufficient_history") return "not enough history yet"
  if (reason === "invalid_data") return "history contains gaps"
  return "not available"
}

const twrPa = computed(() => perf.value?.annualizedReturn ?? null)
const twrPaWithheld = computed(() => perf.value?.annualizedReturnWithheldReason ?? null)
const mwr = computed(() => perf.value?.moneyWeightedReturn ?? null)
const xirr = computed(() => perf.value?.xirr ?? null)
const xirrWithheld = computed(() => perf.value?.xirrWithheldReason ?? null)
</script>

<template>
  <div class="card p-6" :data-testid="tid('root')">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-base font-semibold">Performance summary</h2>
      <p
        v-if="fxCaveat"
        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-muted dark:bg-slate-800/50 dark:text-muted"
        :data-testid="tid('fx-caveat')"
      >
        Constant currency: totals converted at today's rate across the whole history.
      </p>
    </div>

    <!-- Value -->
    <section class="mb-5" :data-testid="tid('group-value')">
      <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-muted">Value</h3>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            Total value
            <InfoTip :text="tips.total_value" :testid="tid('tip-total-value')" />
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :data-testid="tid('total-value')">{{ money(perf?.totalValue) }}</dd>
        </div>
        <div v-if="showInvested" class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            Total invested
            <InfoTip :text="tips.total_invested" :testid="tid('tip-total-invested')" />
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :data-testid="tid('total-invested')">{{ money(perf?.capitalBasis) }}</dd>
        </div>
        <div v-if="instrumentsValue != null" class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            Instruments
            <InfoTip :text="tips.instruments" :testid="tid('tip-instruments')" />
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :data-testid="tid('instruments')">{{ money(instrumentsValue) }}</dd>
        </div>
        <div v-if="cashValue != null" class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            Cash
            <InfoTip :text="tips.cash" :testid="tid('tip-cash')" />
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :data-testid="tid('cash')">{{ money(cashValue) }}</dd>
        </div>
      </dl>
    </section>

    <!-- Return -->
    <section class="mb-5" :data-testid="tid('group-return')">
      <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-muted">Return</h3>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            Net gain
            <InfoTip :text="tips.net_gain" :testid="tid('tip-net-gain')" />
          </dt>
          <dd class="mt-1 flex flex-wrap items-baseline gap-2">
            <span class="text-xl font-semibold tabular-nums" :class="signClass(perf?.totalReturn)" :data-testid="tid('net-gain')">{{ money(perf?.totalReturn) }}</span>
            <span class="text-sm tabular-nums" :class="signClass(perf?.totalReturnPercent)" :data-testid="tid('net-gain-percent')">{{ pct(perf?.totalReturnPercent) }}</span>
          </dd>
        </div>
        <div class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            Realized P/L
            <InfoTip :text="tips.realized" :testid="tid('tip-realized')" />
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(perf?.realizedGains)" :data-testid="tid('realized')">{{ money(perf?.realizedGains) }}</dd>
        </div>
        <div class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            Unrealized P/L
            <InfoTip :text="tips.unrealized" :testid="tid('tip-unrealized')" />
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(perf?.unrealizedGains)" :data-testid="tid('unrealized')">{{ money(perf?.unrealizedGains) }}</dd>
        </div>
        <div class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            Income
            <InfoTip :text="tips.income" :testid="tid('tip-income')" />
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(perf?.income)" :data-testid="tid('income')">{{ money(perf?.income) }}</dd>
        </div>
      </dl>
    </section>

    <!-- Rates -->
    <section :data-testid="tid('group-rates')">
      <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-muted">Rates</h3>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            TWR p.a.
            <InfoTip :text="tips.twr" :testid="tid('tip-twr')" />
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(twrPa)" :data-testid="tid('twr')">{{ pct(twrPa) }}</dd>
          <p v-if="twrPa == null" class="mt-1 text-xs text-muted dark:text-muted" :data-testid="tid('twr-withheld')">{{ withheldText(twrPaWithheld) }}</p>
        </div>
        <div class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            MWR
            <InfoTip :text="tips.mwr" :testid="tid('tip-mwr')" />
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(mwr)" :data-testid="tid('mwr')">{{ pct(mwr) }}</dd>
        </div>
        <div class="rounded-lg bg-surface-2 p-4 dark:bg-slate-800/50">
          <dt class="flex items-center gap-1 text-sm text-muted">
            XIRR
            <InfoTip :text="tips.xirr" :testid="tid('tip-xirr')" />
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(xirr)" :data-testid="tid('xirr')">{{ pct(xirr) }}</dd>
          <p v-if="xirr == null" class="mt-1 text-xs text-muted dark:text-muted" :data-testid="tid('xirr-withheld')">{{ withheldText(xirrWithheld) }}</p>
        </div>
      </dl>
    </section>
  </div>
</template>