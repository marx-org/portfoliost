<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import { fetchSystemVersions, type ServiceVersion } from "@/api/admin"

const services = ref<ServiceVersion[]>([])
const fetchedAt = ref("")
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  try {
    loading.value = true
    const res = await fetchSystemVersions()
    services.value = res.services
    fetchedAt.value = res.fetchedAt
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load"
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setInterval>
onMounted(() => {
  load()
  timer = setInterval(load, 30_000)
})
onUnmounted(() => clearInterval(timer))

function implBadge(impl: string) {
  if (impl === "real") return { label: "Real", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" }
  if (impl === "mock") return { label: "Mock", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" }
  return { label: "Unreachable", class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" }
}
</script>

<template>
  <div>
    <div v-if="loading && !services.length" class="text-sm text-slate-500 dark:text-slate-400">Loading...</div>
    <div v-else-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</div>

    <div v-else class="space-y-3">
      <div
        v-for="svc in services"
        :key="svc.service"
        class="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
      >
        <div>
          <div class="font-medium text-slate-900 dark:text-slate-100">{{ svc.service }}</div>
          <div class="text-sm text-slate-500 dark:text-slate-400">{{ svc.version }}</div>
        </div>
        <span
          class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          :class="implBadge(svc.impl).class"
        >
          {{ implBadge(svc.impl).label }}
        </span>
      </div>
    </div>

    <p v-if="fetchedAt" class="mt-4 text-xs text-slate-400 dark:text-slate-500">
      Last updated: {{ new Date(fetchedAt).toLocaleTimeString() }}
    </p>
  </div>
</template>
