<script setup lang="ts">
/**
 * InfoTip — a small ⓘ that reveals an explanation on hover AND keyboard focus.
 *
 * A native `title` only shows on a long hover and not at all on focus, and it
 * overlaps this bubble (double tooltip). This renders a styled bubble on hover
 * AND keyboard focus; `aria-label` carries the text for assistive tech.
 */
defineProps<{ text: string; testid?: string }>()
</script>

<template>
  <span class="group/tip relative inline-flex">
    <span
      class="cursor-help text-slate-400 outline-none focus:text-slate-600 dark:focus:text-slate-200"
      tabindex="0"
      role="note"
      :aria-label="text"
      :data-testid="testid"
    >ⓘ</span>
    <span
      class="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-snug text-white shadow-lg group-hover/tip:block group-focus-within/tip:block"
    >{{ text }}</span>
  </span>
</template>