<script setup lang="ts">
import { computed } from "vue"
import { labelColors } from "@/utils/labelColors"
import type { Label } from "@/api/labels"

const props = defineProps<{ label: Label; active?: boolean; removable?: boolean }>()
const emit = defineEmits<{ click: []; remove: [] }>()
const style = computed(() => {
  const c = labelColors(props.label.color)
  return { backgroundColor: c.bg, color: c.text }
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors"
    :class="{
      'ring-2 ring-offset-1 ring-current': active,
      'hover:opacity-80 cursor-pointer': !removable,
      'gap-1': removable,
    }"
    :style="style"
    :title="label.name"
    @click="emit('click')"
  >
    {{ label.name }}
    <button
      v-if="removable"
      type="button"
      class="ml-0.5 -mr-1 h-3 w-3 rounded-full hover:bg-black/10 flex items-center justify-center"
      aria-label="Remove"
      @click.stop="emit('remove')"
    >
      <svg class="h-2 w-2" viewBox="0 0 12 12" fill="currentColor"><path d="M9.5 2.5l-7 7M2.5 2.5l7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
  </span>
</template>
