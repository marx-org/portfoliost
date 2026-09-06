<script setup lang="ts">
import { computed, onMounted } from "vue"
import { storeToRefs } from "pinia"
import { useLabelsStore } from "@/stores/labels"
import LabelBadge from "@/components/LabelBadge.vue"

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ "update:modelValue": [ids: string[]]; manage: [] }>()

const store = useLabelsStore()
const { labels } = storeToRefs(store)
const selected = computed(() => new Set(props.modelValue))

onMounted(() => {
  if (!store.labels.length && !store.loading) void store.fetchLabels().catch(() => {})
})

function toggle(id: string) {
  const next = selected.value.has(id)
    ? props.modelValue.filter((s) => s !== id)
    : [...props.modelValue, id]
  emit("update:modelValue", next)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-xs font-medium uppercase text-slate-400 dark:text-slate-500">Labels</span>
    <LabelBadge
      v-for="l in labels"
      :key="l.id"
      :label="l"
      :active="selected.has(l.id)"
      class="opacity-60 dark:opacity-50 hover:opacity-100 dark:hover:opacity-100"
      @click="toggle(l.id)"
    />
    <button
      type="button"
      class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
      @click="emit('manage')"
    >
      Manage labels
    </button>
  </div>
</template>
