<script setup lang="ts">
import { ref } from "vue"
import { useI18n } from "vue-i18n"

const { t } = useI18n()
const connecting = ref(false)

async function connectBroker() {
  connecting.value = true
  setTimeout(() => {
    connecting.value = false
  }, 800)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-base font-semibold">{{ t("settings.brokerConnections.title") }}</h2>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ t("settings.brokerConnections.help") }}</p>
    </div>

    <div class="card p-8 text-center">
      <p class="text-sm text-slate-500 dark:text-slate-400">{{ t("settings.brokerConnections.noneConnected") }}</p>
      <button type="button" class="btn-primary mt-4" :disabled="connecting" @click="connectBroker">
        {{ connecting ? t("settings.brokerConnections.connecting") : t("settings.brokerConnections.connectBroker") }}
      </button>
      <p class="mt-3 text-xs text-slate-400 dark:text-slate-500">{{ t("settings.brokerConnections.proFeature") }}</p>
    </div>
  </div>
</template>
