<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { http } from "@/api/client"
import type { InstrumentsDetail } from "@/api/types"

const route = useRoute()
const detail = ref<InstrumentsDetail | null>(null)

onMounted(async () => {
  detail.value = await http.get<InstrumentsDetail>(`/api/instruments/${route.params.symbol}`)
})
</script>

<template>
  <div>
    <p v-if="!detail" class="text-sm text-slate-500">Loading...</p>
    <pre v-else class="rounded-lg bg-slate-100 p-4 text-xs">{{ JSON.stringify(detail, null, 2) }}</pre>
  </div>
</template>
