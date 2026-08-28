<script setup lang="ts">
import { useRoute } from "vue-router"
import TransactionsTable from "@/components/TransactionsTable.vue"

const route = useRoute()
const portfolioId = String(route.params.id)
</script>

<template>
  <TransactionsTable mode="portfolio" :portfolio-id="portfolioId" />
</template>
