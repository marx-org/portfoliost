<script setup lang="ts">
import SidebarNav from "./SidebarNav.vue"
</script>

<template>
  <div class="flex min-h-screen">
    <SidebarNav />
    <main class="flex-1 overflow-x-auto bg-slate-50">
      <div class="mx-auto max-w-7xl px-6 py-8">
        <router-view />
      </div>
    </main>
  </div>
</template>
