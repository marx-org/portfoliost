<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRouter, useRoute } from "vue-router"
import { useAuthStore } from "@/stores/auth"
import { getVerifier, clearVerifier, validateState } from "@/auth/pkce"

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const error = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  const code = route.query.code as string
  const state = route.query.state as string
  const errorParam = route.query.error as string

  if (errorParam) {
    error.value = route.query.error_description as string || "Authorization failed"
    loading.value = false
    return
  }

  if (!code) {
    error.value = "No authorization code received"
    loading.value = false
    return
  }

  if (!validateState(state)) {
    error.value = "Invalid state parameter"
    loading.value = false
    return
  }

  const verifier = getVerifier()
  if (!verifier) {
    error.value = "Missing PKCE verifier"
    loading.value = false
    return
  }

  try {
    await auth.loginWithCode(code, verifier)
    clearVerifier()
    const redirect = route.query.redirect as string
    router.push(redirect || { name: "investments" })
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Token exchange failed"
    loading.value = false
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-800/50">
    <div class="card w-full max-w-md p-8 text-center">
      <div v-if="loading" class="space-y-4">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600 mx-auto"></div>
        <p class="text-slate-600 dark:text-slate-300">Completing sign in...</p>
      </div>
      <div v-else-if="error" class="space-y-4">
        <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        <router-link to="/login" class="btn-primary inline-block">Back to Login</router-link>
      </div>
    </div>
  </div>
</template>
