<script setup lang="ts">
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import TransactionsSubTabs from "@/modules/portfolios/TransactionsSubTabs.vue"
import CashTransactionsTable from "@/components/CashTransactionsTable.vue"
</script>

<template>

  <div>
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><span class="signal-dot" /> PORTFOLIOS</p>
        <h1 class="page-title">Transactions</h1>
        <p class="page-description">All investing and cash transactions from across your account.</p>
      </div>
    </div>

    <InvestmentsTabs />
    <TransactionsSubTabs />

    <CashTransactionsTable mode="global" />
  </div>
</template>
