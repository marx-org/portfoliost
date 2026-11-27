<script setup lang="ts">
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import TransactionsSubTabs from "@/modules/portfolios/TransactionsSubTabs.vue"
import TransactionsTable from "@/components/TransactionsTable.vue"
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
    <TransactionsTable mode="global" />
  </div>
</template>
