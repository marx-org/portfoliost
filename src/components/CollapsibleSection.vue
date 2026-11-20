<script setup lang="ts">
/**
 * A titled section whose body is collapsed by default (feature #253, #136).
 *
 * The Charting pages pair every chart with a companion table that duplicates the
 * chart's data. Rendering those tables expanded pushes the charts down the page,
 * so each table lives in one of these: a header that toggles the body, collapsed
 * until the user asks for it. The body stays in the DOM (`v-show`) so a test or a
 * screen reader that reads the table after expanding it sees the same markup.
 */
import { ref } from "vue"

const props = withDefaults(
  defineProps<{
    /** Header text and the accessible name of the toggle. */
    title: string
    /** Testid prefix; the toggle is `${testid}-toggle` and the body `${testid}-body`. */
    testid?: string
    /** `card` (default) draws the standard card frame; `plain` nests inside one. */
    variant?: "card" | "plain"
  }>(),
  { testid: undefined, variant: "card" },
)

const open = ref(false)
</script>

<template>
  <div
    :class="props.variant === 'card' ? 'card overflow-hidden' : 'overflow-hidden'"
    :data-testid="props.testid"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
      :class="open ? 'border-b border-slate-200 dark:border-slate-700/60' : ''"
      :data-testid="props.testid ? `${props.testid}-toggle` : undefined"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="text-base font-semibold">{{ props.title }}</span>
      <svg
        class="h-4 w-4 shrink-0 text-slate-400 transition-transform"
        :class="{ 'rotate-180': open }"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
    <div v-show="open" :data-testid="props.testid ? `${props.testid}-body` : undefined">
      <slot />
    </div>
  </div>
</template>