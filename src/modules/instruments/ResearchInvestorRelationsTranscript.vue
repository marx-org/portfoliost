<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getTranscript } from "@/api/instruments"
import type { components } from "@/api/types"
import { formatDateTime } from "@/utils/format"
import { researchSymbol } from "@/utils/research"

type IRTranscript = components["schemas"]["IRTranscript"]

const route = useRoute()
const symbol = String(route.params.symbol).toUpperCase()
const eventId = String(route.params.eventId)

const transcript = ref<IRTranscript | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    transcript.value = await getTranscript(symbol, eventId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load document"
  } finally {
    loading.value = false
  }
})

const title = computed(() => transcript.value?.title ?? "Investor relations document")
const bodyText = computed(() => transcript.value?.body?.trim() ?? "")
const bodyParagraphs = computed(() => (bodyText.value ? bodyText.value.split(/\n\n+/) : []))
const hasBody = computed(() => bodyParagraphs.value.length > 0)
const hasQa = computed(() => (transcript.value?.transcript?.length ?? 0) > 0)

const participantNames = computed(() =>
  (transcript.value?.participant ?? []).map((p) => p.name ?? ""),
)
const qaBlocks = computed(() =>
  (transcript.value?.transcript ?? []).map((b) => ({
    name: b.name ?? "",
    speech: b.speech ?? [],
  })),
)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <router-link
        :to="{ name: 'research-ir', params: { symbol: researchSymbol(symbol) } }"
        class="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        &larr; Investor Relations
      </router-link>
      <span
        v-if="transcript?.time"
        class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300"
      >
        {{ formatDateTime(transcript.time) }}
      </span>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading document...</p>

    <template v-if="!loading && !error && transcript">
      <div class="card p-6">
        <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ title }}</h2>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ symbol }}</p>
      </div>

      <!-- MD&A narrative (SEC) -->
      <div v-if="hasBody" class="card p-6">
        <h3 class="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Management Discussion &amp; Analysis</h3>
        <div class="space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <p v-for="(para, i) in bodyParagraphs" :key="i">{{ para }}</p>
        </div>
        <p v-if="!bodyText" class="text-sm text-slate-500 dark:text-slate-400">No document text available.</p>
      </div>

      <!-- Q&A earnings-call transcript (mock/legacy shape) -->
      <template v-else-if="hasQa">
        <div v-if="participantNames.length" class="card p-6">
          <h3 class="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Participants</h3>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(name, i) in participantNames"
              :key="i"
              class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300"
            >
              {{ name }}
            </span>
          </div>
        </div>
        <div v-for="(block, i) in qaBlocks" :key="i" class="card p-6">
          <p class="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{{ block.name }}</p>
          <div
            v-for="(line, j) in block.speech"
            :key="j"
            class="mb-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
          >
            {{ line }}
          </div>
        </div>
      </template>

      <p v-else class="text-sm text-slate-500 dark:text-slate-400">No transcript or document text is available for this event.</p>
    </template>
  </div>
</template>
