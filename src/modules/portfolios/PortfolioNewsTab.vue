<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioNews } from "@/api/portfolios"
import type { PortfolioNews } from "@/api/types"

const route = useRoute()
const id = String(route.params.id)
const data = ref<PortfolioNews | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    data.value = await getPortfolioNews(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load news"
  } finally {
    loading.value = false
  }
})

function toneClass(tone: string | undefined): string {
  if (tone === "positive") return "bg-green-50 text-green-700"
  if (tone === "negative") return "bg-red-50 text-red-700"
  return "bg-slate-100 text-slate-600"
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading news...</p>

    <template v-if="!loading && !error">
      <div v-if="data?.total" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="a in data.data"
          :key="a.id"
          class="card flex flex-col p-5 transition-shadow hover:shadow-md"
        >
          <div class="mb-2 flex items-center justify-between">
            <span class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium uppercase text-slate-600 dark:text-slate-300">{{ a.ticker }}</span>
            <span v-if="a.sentiment?.tone" class="rounded-full px-2 py-0.5 text-xs font-medium capitalize" :class="toneClass(a.sentiment.tone)">
              {{ a.sentiment.tone }}
            </span>
          </div>
          <a :href="a.article.url" target="_blank" rel="noopener" class="font-medium leading-snug text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
            {{ a.article.title }}
          </a>
          <p class="mt-auto pt-3 text-xs text-slate-500 dark:text-slate-400">{{ new Date(a.published_at).toLocaleDateString() }}</p>
        </article>
      </div>
      <p v-else class="card p-6 text-sm text-slate-500 dark:text-slate-400">No news for held stocks.</p>
    </template>
  </div>
</template>
