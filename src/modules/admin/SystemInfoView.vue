<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { fetchSystemVersions, type ServiceVersion } from "@/api/admin"

const rawServices = ref<ServiceVersion[]>([])
const fetchedAt = ref("")
const loading = ref(true)
const error = ref<string | null>(null)

// The SPA cannot read its own image ref from the cluster — the admin
// `/system/versions` endpoint enumerates the other services, not this one — so
// the repository is written here, and pinned by SystemInfoView.test.ts. Keep it
// the org path the HelmRelease deploys.
const spaEntry: ServiceVersion = {
  service: "portfoliost",
  version: __APP_VERSION__,
  impl: "real",
  image: `ghcr.io/marx-org/portfoliost:${__APP_VERSION__}`,
}

const services = computed(() => [spaEntry, ...rawServices.value])

async function load() {
  try {
    loading.value = true
    const res = await fetchSystemVersions()
    rawServices.value = res.services
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

function implBadge(svc: ServiceVersion) {
  if (svc.impl === "real") return { label: "Deployment", class: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" }
  if (svc.impl === "mock") return { label: "Mock", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" }
  // A green "Job" badge read as "running". Three of the pfire CronJobs are
  // suspended, and jobshot is a Deployment rather than a schedule — so say
  // which, from the schedule/suspend the endpoint now reports (§80.1).
  if (svc.impl === "job") {
    if (!svc.schedule) return { label: "Job", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" }
    if (svc.suspended) return { label: "Job · Suspended", class: "bg-slate-200 text-slate-700 dark:bg-slate-600/40 dark:text-slate-300" }
    return { label: "Job · Scheduled", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" }
  }
  return { label: "Unreachable", class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" }
}

function displayRef(svc: ServiceVersion) {
  return svc.image ?? svc.version
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
        :data-testid="`sys-row-${svc.service}`"
      >
        <div>
          <div class="font-medium text-slate-900 dark:text-slate-100">{{ svc.service }}</div>
          <div class="text-sm text-slate-500 dark:text-slate-400" :data-testid="`sys-ref-${svc.service}`">
            {{ displayRef(svc) }}
          </div>
          <div v-if="svc.schedule" class="font-mono text-xs text-slate-400 dark:text-slate-500">
            {{ svc.schedule }}<span v-if="svc.suspended"> · suspended</span>
          </div>
        </div>
        <span
          class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          :class="implBadge(svc).class"
        >
          {{ implBadge(svc).label }}
        </span>
      </div>
    </div>

    <p v-if="fetchedAt" class="mt-4 text-xs text-slate-400 dark:text-slate-500">
      Last updated: {{ new Date(fetchedAt).toLocaleTimeString() }}
    </p>
  </div>
</template>
