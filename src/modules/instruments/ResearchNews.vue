<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"
import { getNewsStats, getTickerNews, type NewsArticle, type NewsStats } from "@/api/instruments"
import { formatDate } from "@/utils/format"

const route = useRoute()
const { t } = useI18n()
const symbol = String(route.params.symbol).toUpperCase()

const articles = ref<NewsArticle[]>([])
const total = ref(0)
const stats = ref<NewsStats | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const [page, s] = await Promise.all([getTickerNews(symbol), getNewsStats(symbol).catch(() => null)])
    articles.value = page.data
    total.value = page.pagination.total_count
    stats.value = s
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
  if (t.includes("bear") || t.includes("negative")) return "bg-red-50 text-danger"
  if (t.includes("bull") || t.includes("positive")) return "bg-green-50 text-emerald"
  return "bg-surface-2 text-muted"
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
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" class="text-sm text-muted">{{ t("research.loadingNews") }}</p>

    <template v-if="!loading && !error">
      <dl v-if="stats" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div class="card p-4">
          <dt class="text-sm text-muted">{{ t("research.timelineEvents") }}</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">{{ stats.data.total_article_count.toLocaleString() }}</dd>
        </div>
        <div class="card p-4">
          <dt class="text-sm text-muted">{{ t("research.analyzedArticles") }}</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">{{ stats.data.total_analyzed_article_count.toLocaleString() }}</dd>
        </div>
        <div class="card p-4">
          <dt class="text-sm text-muted">{{ t("research.lastFetched") }}</dt>
          <dd class="mt-1 text-sm font-medium tabular-nums">{{ formatDate(stats.data.last_fetched_at) }}</dd>
        </div>
      </dl>

      <p class="text-sm text-muted">
        {{ t("research.articlesCount", { count: articles.length, total: total.toLocaleString(), symbol }) }}
      </p>

      <ul v-if="articles.length" class="space-y-3">
        <li v-for="article in articles" :key="article.id" class="card p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <a
                :href="article.article?.url"
                target="_blank"
                rel="noopener"
                class="font-medium text-text hover:text-accent-text dark:hover:text-blue-400 hover:underline"
              >
                {{ article.article?.title ?? t("research.untitled") }}
              </a>
              <p class="mt-1 text-xs text-muted">
                {{ sourceOf(article) ?? t("research.unknownSource") }} &middot; {{ formatDate(article.published_at) }}
              </p>
              <p v-if="summary(article)" class="mt-2 line-clamp-3 text-sm text-muted">{{ summary(article) }}</p>
            </div>
            <span v-if="toneOf(article)" class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="toneClass(toneOf(article))">
              {{ toneOf(article) }}
            </span>
          </div>
        </li>
      </ul>

      <p v-else class="text-sm text-muted">{{ t("research.noNews") }}</p>
    </template>
  </div>
</template>
