<script setup lang="ts">
import SidebarNav from "./SidebarNav.vue"
</script>

<template>
  <div class="flex min-h-screen">
    <SidebarNav />
    <main class="flex-1 overflow-x-auto bg-slate-50 dark:bg-slate-950">
      <!-- pt-16 on mobile gives clearance for the fixed hamburger button -->
      <div class="mx-auto max-w-7xl px-6 py-8 pt-16 md:pt-8">
        <router-view />
      </div>
    </main>
  </div>
</template>
