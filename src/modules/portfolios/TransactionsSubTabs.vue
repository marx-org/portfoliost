<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"

const { t } = useI18n()
const route = useRoute()

const currentPath = route?.path ?? (typeof window !== "undefined" ? window.location.pathname : "")

const tabs = computed(() => [
  {
    label: t("portfolios.portfolioTransactions"),
    to: "/en/investments/transactions",
    match: (path: string) => path === "/en/investments/transactions",
  },
  {
    label: t("portfolios.cashTransactions"),
    to: "/en/investments/transactions/cash",
    match: (path: string) => path.startsWith("/en/investments/transactions/cash"),
  },
])
</script>

<template>
  <nav :aria-label="t('portfolios.transactionTypes')" class="tab-nav mb-6">
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
</template>
