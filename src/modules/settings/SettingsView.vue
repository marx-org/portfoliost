<script setup lang="ts">
const nav = [
  { label: "Profile", to: { name: "settings-profile" } },
  { label: "Shared Portfolios", to: { name: "settings-shared-portfolios" } },
  { label: "Broker Connections", to: { name: "settings-broker-connections" } },
]

const footer = [
  { label: "Terms", href: "https://example-service.ai/terms" },
  { label: "Privacy", href: "https://example-service.ai/privacy" },
  { label: "Roadmap", href: "https://example-service.ai/roadmap" },
]
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Settings</h1>

    <div class="mt-6 flex flex-col gap-8 md:flex-row">
      <div class="w-full shrink-0 md:w-52">
        <nav aria-label="Settings" class="flex flex-col gap-1">
          <router-link
            v-for="item in nav"
            :key="item.label"
            :to="item.to"
            class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            active-class="bg-blue-50 text-blue-700"
          >
            {{ item.label }}
          </router-link>
        </nav>
        <div class="mt-6 flex flex-col gap-2 border-t border-slate-200 pt-4">
          <a v-for="item in footer" :key="item.label" :href="item.href" target="_blank" rel="noopener" class="text-sm text-slate-500 hover:text-slate-900">
            {{ item.label }}
          </a>
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <router-view />
      </div>
    </div>
  </div>
</template>
