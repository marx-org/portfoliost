<script setup lang="ts">
import { computed } from "vue"
import { useRouter } from "vue-router"
import { useAuthStore } from "@/stores/auth"
import { createAuthorizationUrl } from "@/auth/pkce"
import { getOidcConfig } from "@/runtime-config"

const auth = useAuthStore()
const router = useRouter()

const oidc = getOidcConfig()
const OIDC_ISSUER = oidc.issuerUrl
const OIDC_CLIENT_ID = oidc.clientId
const oidcEnabled = computed(() => Boolean(OIDC_ISSUER && OIDC_CLIENT_ID))

async function startOidcLogin() {
  const redirect = typeof router.currentRoute.value.query.redirect === "string" ? router.currentRoute.value.query.redirect : undefined
  if (redirect) sessionStorage.setItem("portfoliost_oidc_redirect", redirect)
  const redirectUri = `${window.location.origin}/auth/callback`
  const { url } = await createAuthorizationUrl({
    issuerUrl: OIDC_ISSUER!,
    clientId: OIDC_CLIENT_ID!,
    redirectUri,
  })
  window.location.href = url
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-800/50">
    <header class="flex items-center justify-between px-6 py-4">
      <div class="flex items-center gap-2">
        <img src="/favicon.svg" alt="Portfoliost" class="h-8 w-8" />
        <span class="text-xl font-semibold text-slate-900 dark:text-slate-100">Portfoliost</span>
      </div>
      <span class="text-sm text-slate-500 dark:text-slate-400">Investment portfolio tracking</span>
    </header>

    <main class="flex flex-1 items-center justify-center px-4">
      <div class="card w-full max-w-md p-8">
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100">Welcome Back</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to your account</p>

        <div class="mt-6 space-y-4">
          <div v-if="oidcEnabled">
            <button
              type="button"
              class="btn-primary w-full"
              :disabled="auth.loading"
              data-testid="oidc-signin"
              @click="startOidcLogin"
            >
              Sign in with Passkey
            </button>
          </div>
          <p v-if="auth.error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400" data-testid="login-error">
            {{ auth.error }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
