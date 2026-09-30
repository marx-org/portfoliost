<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import { clearToken } from "@/api/client"

/**
 * Pocket-ID's post-logout redirect target (§77.4).
 *
 * The OIDC client registers `https://<app>/logout` as its logout callback, so
 * this route only ever runs after Pocket-ID has ended the OIDC session. All it
 * has to do is drop the local token and get out of the way.
 */
onMounted(() => {
  clearToken()
  const router = useRouter()
  router.replace({ name: "login" })
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
    <p class="text-sm text-slate-500 dark:text-slate-400">Signing you out…</p>
  </div>
</template>
