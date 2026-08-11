<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getTickerNews, type NewsArticle } from "@/api/instruments"
import { formatDate } from "@/utils/format"

const route = useRoute()
const symbol = String(route.params.symbol).toUpperCase()

const articles = ref<NewsArticle[]>([])
const total = ref(0)
const error = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const page = await getTickerNews(symbol)
    articles.value = page.data
    total.value = page.pagination.total_count
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load news"
  } finally {
    loading.value = false
  }
})

function sourceOf(a: NewsArticle): string | undefined {
  return a.metadata?.source ?? a.article?.source
}

function toneOf(a: NewsArticle): string | undefined {
  if (a.sentiment && typeof a.sentiment === "object" && "tone" in a.sentiment) {
    return String((a.sentiment as { tone: string }).tone)
  }
  return undefined
}

function toneClass(tone: string | undefined): string {
  const t = (tone ?? "").toLowerCase()
  if (t.includes("bear") || t.includes("negative")) return "bg-red-50 text-red-700"
  if (t.includes("bull") || t.includes("positive")) return "bg-green-50 text-green-700"
  return "bg-slate-100 text-slate-600"
}

function summary(a: NewsArticle): string | undefined {
  if (!a.content) return undefined
  const c = a.content as Record<string, unknown>
  if (typeof c.core_thesis === "string") return c.core_thesis
  return undefined
}
</script>

<template>
  <div class="space-y-4">
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading news...</p>

    <template v-if="!loading && !error">
      <p class="text-sm text-slate-500">
        {{ articles.length }} of {{ total.toLocaleString() }} articles for {{ symbol }}
      </p>

      <ul v-if="articles.length" class="space-y-3">
        <li v-for="article in articles" :key="article.id" class="card p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <a
                :href="article.article?.url"
                target="_blank"
                rel="noopener"
                class="font-medium text-slate-900 hover:text-blue-600 hover:underline"
              >
                {{ article.article?.title ?? "Untitled" }}
              </a>
              <p class="mt-1 text-xs text-slate-500">
                {{ sourceOf(article) ?? "Unknown source" }} &middot; {{ formatDate(article.published_at) }}
              </p>
              <p v-if="summary(article)" class="mt-2 line-clamp-3 text-sm text-slate-600">{{ summary(article) }}</p>
            </div>
            <span v-if="toneOf(article)" class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="toneClass(toneOf(article))">
              {{ toneOf(article) }}
            </span>
          </div>
        </li>
      </ul>

      <p v-else class="text-sm text-slate-500">No news articles found.</p>
    </template>
  </div>
</template>
