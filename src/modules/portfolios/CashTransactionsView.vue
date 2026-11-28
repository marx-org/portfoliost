<script setup lang="ts">
import { useI18n } from "vue-i18n"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import TransactionsSubTabs from "@/modules/portfolios/TransactionsSubTabs.vue"
import CashTransactionsTable from "@/components/CashTransactionsTable.vue"

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

    <CashTransactionsTable mode="global" />
  </div>
</template>
