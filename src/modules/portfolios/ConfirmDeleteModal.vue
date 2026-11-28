<script setup lang="ts">
import { useI18n } from "vue-i18n"

const { t } = useI18n()

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
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" :aria-label="title ?? t('portfolios.deleteAriaDefault')">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">{{ title ?? t("portfolios.deleteHeadingDefault") }}</h3>
        <button type="button" class="btn-ghost px-2 py-1" :aria-label="t('addPosition.closeModal')" @click="emit('close')">✕</button>
      </div>
      <p class="text-sm text-muted">{{ message }}</p>
      <p v-if="error" class="mb-3 mt-2 text-sm text-danger">{{ error }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="btn-ghost" @click="emit('close')">{{ t("portfolios.cancel") }}</button>
        <button type="button" class="btn-danger" :disabled="busy" @click="emit('confirm')">
          {{ busy ? t("portfolios.deleting") : t("portfolios.delete") }}
        </button>
      </div>
    </div>
  </div>
</template>
