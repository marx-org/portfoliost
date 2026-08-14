<script setup lang="ts">
import { onMounted, ref } from "vue"
import { createPortfolioShare, deletePortfolioShare, getPortfolioShares } from "@/api/portfolios"
import type { PortfolioShare } from "@/api/portfolios"
import { getPortfolios } from "@/api/portfolios"

const shares = ref<PortfolioShare[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const portfolios = ref<{ id: string; name: string }[]>([])
const showCreate = ref(false)
const createForm = ref({ portfolioId: "", displayName: "" })
const createBusy = ref(false)
const createError = ref<string | null>(null)

const confirmDelete = ref<PortfolioShare | null>(null)
const deleteBusy = ref(false)

function shareUrl(share: PortfolioShare): string {
  return `${window.location.origin}/public/portfolio/${share.id}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

async function load() {
  loading.value = true
  error.value = null
  try {
    shares.value = await getPortfolioShares()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load shares"
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function openCreate() {
  createError.value = null
  createForm.value = { portfolioId: "", displayName: "" }
  try {
    const list = await getPortfolios()
    portfolios.value = list.map((p) => ({ id: p.id, name: p.name }))
    showCreate.value = true
  } catch {
    createError.value = "Failed to load portfolios"
  }
}

async function submitCreate() {
  if (!createForm.value.portfolioId) return
  createBusy.value = true
  createError.value = null
  try {
    await createPortfolioShare({ portfolioId: createForm.value.portfolioId, displayName: createForm.value.displayName })
    showCreate.value = false
    notice.value = "Share created"
    await load()
  } catch (err) {
    createError.value = err instanceof Error ? err.message : "Failed to create share"
  } finally {
    createBusy.value = false
  }
}

async function copyLink(share: PortfolioShare) {
  try {
    await navigator.clipboard.writeText(shareUrl(share))
    notice.value = "Link copied to clipboard"
  } catch {
    notice.value = shareUrl(share)
  }
}

async function removeShare() {
  if (!confirmDelete.value) return
  deleteBusy.value = true
  try {
    await deletePortfolioShare(confirmDelete.value.id)
    confirmDelete.value = null
    notice.value = "Share deleted"
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to delete share"
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold">Shared Portfolios</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage your shared portfolio links. You can have up to 10 active shares at once.</p>
      </div>
      <button type="button" class="btn-primary" @click="openCreate">Share Portfolio</button>
    </div>

    <p v-if="notice" class="rounded-lg bg-green-50 dark:bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading shares...</p>

    <div v-if="!loading" class="card p-5">
      <div class="flex items-baseline gap-2">
        <span class="text-sm font-medium text-slate-700 dark:text-slate-200">Active Shares</span>
        <span class="text-sm text-slate-500 dark:text-slate-400">{{ shares.length }} / 10</span>
      </div>
    </div>

    <div v-if="!loading && shares.length" class="space-y-4">
      <div v-for="share in shares" :key="share.id" class="card p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-slate-900 dark:text-slate-100">{{ share.displayName || share.portfolioName }}</h3>
            <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>Created: {{ formatDate(share.createdAt) }}</span>
              <span>{{ share.viewCount }} views</span>
            </div>
          </div>
          <div class="flex gap-2">
            <router-link :to="`/public/portfolio/${share.id}`" target="_blank" class="btn-secondary text-sm">
              View shared portfolio
            </router-link>
            <button type="button" class="btn-red-ghost text-sm" @click="confirmDelete = share">Delete share</button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2 text-xs">
          <span v-if="share.privacySettings.showValues" class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">💰 Shows values</span>
          <span v-if="share.privacySettings.showHoldings" class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">📊 Shows holdings</span>
          <span v-if="share.privacySettings.showPerformanceChart" class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">📈 Performance chart</span>
        </div>

        <div class="mt-4 flex gap-2">
          <input :value="shareUrl(share)" readonly class="input flex-1 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400" />
          <button type="button" class="btn-secondary text-sm" @click="copyLink(share)">Copy link</button>
        </div>
      </div>
    </div>

    <div v-if="!loading && !shares.length" class="card p-8 text-center">
      <p class="text-sm text-slate-500 dark:text-slate-400">No shared portfolios yet.</p>
    </div>

    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showCreate = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Share portfolio">
        <h3 class="mb-4 text-base font-semibold">Share Portfolio</h3>
        <form @submit.prevent="submitCreate">
          <label for="share-portfolio" class="label">Portfolio</label>
          <select id="share-portfolio" v-model="createForm.portfolioId" class="input mb-4" required>
            <option value="" disabled>Select a portfolio</option>
            <option v-for="p in portfolios" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <label for="share-display-name" class="label">Display name</label>
          <input
            id="share-display-name"
            v-model="createForm.displayName"
            type="text"
            class="input mb-4"
            placeholder="Optional display name"
          />
          <p v-if="createError" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ createError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showCreate = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="createBusy || !createForm.portfolioId">
              {{ createBusy ? "Creating..." : "Create Share" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="confirmDelete"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="confirmDelete = null"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Delete share">
        <h3 class="mb-2 text-base font-semibold">Delete share</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          Delete the public share for "{{ confirmDelete.displayName || confirmDelete.portfolioName }}"? Anyone with the link will lose access.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="confirmDelete = null">Cancel</button>
          <button type="button" class="btn-danger" :disabled="deleteBusy" @click="removeShare">
            {{ deleteBusy ? "Deleting..." : "Delete" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
