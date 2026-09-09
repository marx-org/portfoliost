<script setup lang="ts">
import { computed } from "vue"
import LabelBadge from "@/components/LabelBadge.vue"
import type { Label } from "@/api/labels"

const props = withDefaults(defineProps<{ labels: Label[]; max?: number }>(), { max: 10 })
const emit = defineEmits<{ badgeClick: [label: Label] }>()
const visible = computed(() => props.labels.slice(0, props.max))
const overflow = computed(() => props.labels.slice(props.max))
const overflowTitle = computed(() => props.labels.map((l) => l.name).join(", "))
</script>

<template>
  <div class="flex flex-wrap items-center gap-1" :title="overflow.length ? overflowTitle : undefined">
    <LabelBadge v-for="l in visible" :key="l.id" :label="l" @click="emit('badgeClick', l)" />
    <span
      v-if="overflow.length"
      class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    >
      +{{ overflow.length }}
    </span>
  </div>
</template>
