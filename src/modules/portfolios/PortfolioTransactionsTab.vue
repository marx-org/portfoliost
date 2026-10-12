<script setup lang="ts">
import { useRoute } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import TransactionsTable from "@/components/TransactionsTable.vue"

const route = useRoute()
const portfolioId = String(route.params.id)
const store = usePortfolioStore()
</script>

<template>
  <TransactionsTable mode="portfolio" :portfolio-id="portfolioId" :readonly="Boolean(store.detail?.isVirtual)" />
</template>
