<script setup lang="ts">
import { computed } from "vue"

interface StatItem {
  label: string
  value: string
}

const props = defineProps<{
  title: string
  items: StatItem[]
}>()

const items = computed(() => props.items.filter((i) => i.value !== "—"))
</script>

<template>
  <div>
    <h3 class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{{ title }}</h3>
    <dl class="space-y-1.5">
      <div v-for="item in items" :key="item.label" class="flex items-baseline justify-between gap-4 text-sm">
        <dt class="text-slate-500 dark:text-slate-400">{{ item.label }}</dt>
        <dd class="font-medium tabular-nums">{{ item.value }}</dd>
      </div>
    </dl>
  </div>
</template>
