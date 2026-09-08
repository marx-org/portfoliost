<script setup lang="ts">
import { onMounted } from "vue"
import { useCurrenciesStore } from "../stores/currencies"

const props = withDefaults(defineProps<{
  modelValue: string
  ariaLabel?: string
  testid?: string
  allowEmpty?: boolean
  emptyLabel?: string
}>(), {
  allowEmpty: false,
  emptyLabel: "All",
})

const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>()

const store = useCurrenciesStore()
onMounted(() => {
  if (!store.loaded) void store.load()
})

function onSelect(event: Event): void {
  emit("update:modelValue", (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <select
    class="input w-auto min-w-[7.5rem] py-1 text-xs"
    :value="props.modelValue"
    :aria-label="props.ariaLabel ?? 'Currency'"
    :data-testid="props.testid"
    @change="onSelect"
  >
    <option v-if="props.allowEmpty" value="">{{ props.emptyLabel }}</option>
    <option v-for="c in store.options" :key="c.code" :value="c.code">{{ c.code }}</option>
  </select>
</template>
