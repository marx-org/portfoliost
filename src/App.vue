<script setup lang="ts">
import { onMounted } from "vue"
import { useAuthStore } from "@/stores/auth"
import { useLocaleStore } from "@/stores/locale"

const auth = useAuthStore()
const locale = useLocaleStore()

onMounted(async () => {
  // The router guard already awaited this on an /en/admin/* load; hydrateUser
  // shares one request between the two (§36), so this is free rather than a
  // second /auth/me on every deep link.
  if (auth.isAuthenticated && !(await auth.hydrateUser())) {
    await auth.logout()
  }
  // Reconcile the UI locale with the server now that auth is ready — a startup
  // getUserProfile would 401 before the token is set. Best-effort and silent.
  if (auth.isAuthenticated) {
    void locale.hydrateFromServer()
  }
})
</script>

<template>
  <router-view />
</template>
