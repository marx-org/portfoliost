<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"

const { t } = useI18n()
const route = useRoute()

// §143 — `/en/investments` and `/en/investments/virtual-portfolios` render the
// SAME InvestmentsView, so Vue reuses the instance across the navigation and
// this component is not re-created. A `const currentPath = route?.path` read
// once at setup therefore pins the highlight to whatever tab was open on first
// mount; a computed keeps it live, so the border follows the router.
const currentPath = computed(
  () => route?.path ?? (typeof window !== "undefined" ? window.location.pathname : ""),
)

const tabs = computed(() => [
  {
    // §84 — first in the strip, and the landing page `/` points at.
    label: t("portfolios.accountsBalance"),
    to: "/en/investments/accounts-balance",
    match: (path: string) => path.startsWith("/en/investments/accounts-balance"),
  },
  {
    label: t("portfolios.portfoliosTab"),
    to: "/en/investments",
    match: (path: string) => path === "/en/investments",
  },
  {
    label: t("portfolios.virtualPortfolios"),
    to: "/en/investments/virtual-portfolios",
    match: (path: string) => path.startsWith("/en/investments/virtual-portfolios"),
  },
  {
    label: t("portfolios.consolidatedHoldings"),
    to: "/en/investments/holdings",
    match: (path: string) => path.startsWith("/en/investments/holdings"),
  },
  {
    // §83.6 — the cumulative (all-portfolios) performance tab. After Portfolios
    // because it summarises exactly what those cards summarise.
    label: t("portfolios.performance"),
    to: "/en/investments/performance",
    match: (path: string) => path.startsWith("/en/investments/performance"),
  },
  {
    label: t("portfolios.transactions"),
    to: "/en/investments/transactions",
    match: (path: string) => path.startsWith("/en/investments/transactions"),
  },
  {
    label: t("portfolios.watchlists"),
    to: "/en/investments/watchlist",
    match: (path: string) => path.startsWith("/en/investments/watchlist"),
  },
])
</script>

<template>

  <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <nav :aria-label="t('portfolios.investmentSections')" class="tab-nav">
      <router-link
        v-for="tab in tabs"
        :key="tab.label"
        :to="tab.to"
        class="tab-link"
        :class="tab.match(currentPath) ? 'tab-link--active' : ''"
      >
        {{ tab.label }}
      </router-link>
    </nav>
    <button type="button" class="btn-ghost text-sm" disabled>{{ t("portfolios.importFromBroker") }}</button>
  </div>
</template>
