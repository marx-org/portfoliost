<script setup lang="ts">
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import TransactionsSubTabs from "@/modules/portfolios/TransactionsSubTabs.vue"
import CashTransactionsTable from "@/components/CashTransactionsTable.vue"
</script>

<template>

  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold">Transactions</h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">All investing and cash transactions from across your account.</p>
    </div>

    <InvestmentsTabs />
    <TransactionsSubTabs />

    <CashTransactionsTable mode="global" />
  </div>
</template>
