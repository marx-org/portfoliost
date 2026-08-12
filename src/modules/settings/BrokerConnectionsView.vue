<script setup lang="ts">
import { ref } from "vue"

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
      <h2 class="text-base font-semibold">Broker Connections</h2>
      <p class="mt-1 text-sm text-slate-500">Connect a brokerage to sync positions and transactions automatically.</p>
    </div>

    <div class="card p-8 text-center">
      <p class="text-sm text-slate-500">No brokers connected yet.</p>
      <button type="button" class="btn-primary mt-4" :disabled="connecting" @click="connectBroker">
        {{ connecting ? "Connecting..." : "Connect Broker" }}
      </button>
      <p class="mt-3 text-xs text-slate-400">Broker integration is a Example service Pro feature. Check the roadmap for supported brokers.</p>
    </div>
  </div>
</template>
