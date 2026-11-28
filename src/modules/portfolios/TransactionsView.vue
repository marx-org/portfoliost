<script setup lang="ts">
import { useI18n } from "vue-i18n"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import TransactionsSubTabs from "@/modules/portfolios/TransactionsSubTabs.vue"
import TransactionsTable from "@/components/TransactionsTable.vue"

const { t } = useI18n()
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><span class="signal-dot" /> {{ t("portfolios.eyebrowPortfolios") }}</p>
        <h1 class="page-title">{{ t("portfolios.transactions") }}</h1>
        <p class="page-description">{{ t("portfolios.transactionsDescription") }}</p>
      </div>
    </div>
    <InvestmentsTabs />
    <TransactionsSubTabs />
    <TransactionsTable mode="global" />
  </div>
</template>
