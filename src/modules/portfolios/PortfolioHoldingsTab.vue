<script setup lang="ts">
import HoldingsTable from "@/components/HoldingsTable.vue"
import { usePortfolioStore } from "@/stores/portfolios"

const store = usePortfolioStore()
</script>

<template>
  <HoldingsTable mode="portfolio" :readonly="Boolean(store.detail?.isVirtual)" />
</template>
