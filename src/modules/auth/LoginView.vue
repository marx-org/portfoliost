<script setup lang="ts">
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { useAuthStore } from "@/stores/auth"

const auth = useAuthStore()
const router = useRouter()

const email = ref("demo@example.com")
const password = ref("example-service-mock")
const rememberMe = ref(false)

const valid = computed(() => {
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
  return emailOk && password.value.length > 0
})

const showPassword = ref(false)

async function submit() {
  if (!valid.value || auth.loading) return
  try {
    await auth.login(email.value, password.value)
    const redirect = typeof router.currentRoute.value.query.redirect === "string" ? router.currentRoute.value.query.redirect : undefined
    router.push(redirect || { name: "investments" })
  } catch {
    // error is stored in auth.error
  }
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
      <form class="card w-full max-w-md p-8" @submit.prevent="submit">
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100">Welcome Back</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to your account</p>

        <div class="mt-6 space-y-4">
          <div>
            <label class="label" for="email">Email Address *</label>
            <input
              id="email"
              v-model="email"
              type="email"
              class="input"
              placeholder="Enter your email"
              autocomplete="email"
              data-testid="email"
            />
          </div>
          <div>
            <label class="label" for="password">Password *</label>
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="input"
              placeholder="Enter your password"
              autocomplete="current-password"
              data-testid="password"
            />
          </div>

          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input v-model="rememberMe" type="checkbox" class="h-4 w-4 rounded border-slate-300 dark:border-slate-600" />
              Remember me
            </label>
            <a href="#" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">Forgot password?</a>
          </div>

          <p v-if="auth.error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400" data-testid="login-error">
            {{ auth.error }}
          </p>

          <button
            type="submit"
            class="btn-primary w-full"
            :disabled="!valid || auth.loading"
            data-testid="signin"
          >
            <span v-if="auth.loading" class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
            {{ auth.loading ? "Signing in..." : "Sign In" }}
          </button>
        </div>

        <p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Don't have an account? <a href="#" class="text-blue-600 dark:text-blue-400 hover:underline">Create one</a>
        </p>
      </form>
    </main>
  </div>
</template>
