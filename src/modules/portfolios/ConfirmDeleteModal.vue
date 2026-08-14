<script setup lang="ts">
defineProps<{
  open: boolean
  title?: string
  message: string
  busy?: boolean
  error?: string | null
}>()

const emit = defineEmits<{ (e: "close"): void; (e: "confirm"): void }>()
</script>

<template>

  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
    @click.self="emit('close')"
  >
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Delete transaction">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">{{ title ?? "Delete Transaction" }}</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="emit('close')">✕</button>
      </div>
      <p class="text-sm text-slate-600 dark:text-slate-300">{{ message }}</p>
      <p v-if="error" class="mb-3 mt-2 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
        <button type="button" class="btn-danger" :disabled="busy" @click="emit('confirm')">
          {{ busy ? "Deleting..." : "Delete" }}
        </button>
      </div>
    </div>
  </div>
</template>
