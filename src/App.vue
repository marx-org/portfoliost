<script setup lang="ts">
import { onMounted } from "vue"
import { useAuthStore } from "@/stores/auth"

const auth = useAuthStore()

onMounted(async () => {
  // The router guard already awaited this on an /en/admin/* load; hydrateUser
  // shares one request between the two (§36), so this is free rather than a
  // second /auth/me on every deep link.
  if (auth.isAuthenticated && !(await auth.hydrateUser())) {
    await auth.logout()
  }
})
</script>

<template>
  <router-view />
</template>
