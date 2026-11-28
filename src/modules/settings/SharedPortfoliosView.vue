<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { createPortfolioShare, deletePortfolioShare, getPortfolioShares } from "@/api/portfolios"
import type { PortfolioShare } from "@/api/portfolios"
import { getPortfolios } from "@/api/portfolios"
import { formatDate } from "@/utils/format"

const { t } = useI18n()

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

async function load() {
  loading.value = true
  error.value = null
  try {
    shares.value = await getPortfolioShares()
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("settings.sharedPortfolios.loadError")
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
    createError.value = t("settings.sharedPortfolios.loadPortfoliosError")
  }
}

async function submitCreate() {
  if (!createForm.value.portfolioId) return
  createBusy.value = true
  createError.value = null
  try {
    await createPortfolioShare({ portfolioId: createForm.value.portfolioId, displayName: createForm.value.displayName })
    showCreate.value = false
    notice.value = t("settings.sharedPortfolios.shareCreated")
    await load()
  } catch (err) {
    createError.value = err instanceof Error ? err.message : t("settings.sharedPortfolios.createError")
  } finally {
    createBusy.value = false
  }
}

async function copyLink(share: PortfolioShare) {
  try {
    await navigator.clipboard.writeText(shareUrl(share))
    notice.value = t("settings.sharedPortfolios.linkCopied")
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
    notice.value = t("settings.sharedPortfolios.shareDeleted")
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("settings.sharedPortfolios.deleteShare")
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold">{{ t("settings.sharedPortfolios.title") }}</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ t("settings.sharedPortfolios.help") }}</p>
      </div>
      <button type="button" class="btn-primary" @click="openCreate">{{ t("settings.sharedPortfolios.sharePortfolio") }}</button>
    </div>

    <p v-if="notice" class="rounded-lg bg-green-50 dark:bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">{{ t("settings.sharedPortfolios.loading") }}</p>

    <div v-if="!loading" class="card p-5">
      <div class="flex items-baseline gap-2">
        <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t("settings.sharedPortfolios.activeShares") }}</span>
        <span class="text-sm text-slate-500 dark:text-slate-400">{{ shares.length }} / 10</span>
      </div>
    </div>

    <div v-if="!loading && shares.length" class="space-y-4">
      <div v-for="share in shares" :key="share.id" class="card p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-slate-900 dark:text-slate-100">{{ share.displayName || share.portfolioName }}</h3>
            <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{{ t("settings.sharedPortfolios.created", { date: formatDate(share.createdAt) }) }}</span>
              <span>{{ t("settings.sharedPortfolios.views", { count: share.viewCount }) }}</span>
            </div>
          </div>
          <div class="flex gap-2">
            <router-link :to="`/public/portfolio/${share.id}`" target="_blank" class="btn-secondary text-sm">
              {{ t("settings.sharedPortfolios.viewShared") }}
            </router-link>
            <button type="button" class="btn-red-ghost text-sm" @click="confirmDelete = share">{{ t("settings.sharedPortfolios.deleteShare") }}</button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2 text-xs">
          <span v-if="share.privacySettings.showValues" class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">{{ t("settings.sharedPortfolios.showsValues") }}</span>
          <span v-if="share.privacySettings.showHoldings" class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">{{ t("settings.sharedPortfolios.showHoldings") }}</span>
          <span v-if="share.privacySettings.showPerformanceChart" class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">{{ t("settings.sharedPortfolios.showsPerformance") }}</span>
        </div>

        <div class="mt-4 flex gap-2">
          <input :value="shareUrl(share)" readonly class="input flex-1 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400" />
          <button type="button" class="btn-secondary text-sm" @click="copyLink(share)">{{ t("settings.sharedPortfolios.copyLink") }}</button>
        </div>
      </div>
    </div>

    <div v-if="!loading && !shares.length" class="card p-8 text-center">
      <p class="text-sm text-slate-500 dark:text-slate-400">{{ t("settings.sharedPortfolios.noShares") }}</p>
    </div>

    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showCreate = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" :aria-label="t('settings.sharedPortfolios.shareDialogAria')">
        <h3 class="mb-4 text-base font-semibold">{{ t("settings.sharedPortfolios.shareDialogTitle") }}</h3>
        <form @submit.prevent="submitCreate">
          <label for="share-portfolio" class="label">{{ t("settings.sharedPortfolios.portfolio") }}</label>
          <select id="share-portfolio" v-model="createForm.portfolioId" class="input mb-4" required>
            <option value="" disabled>{{ t("settings.sharedPortfolios.selectPortfolio") }}</option>
            <option v-for="p in portfolios" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <label for="share-display-name" class="label">{{ t("settings.sharedPortfolios.displayName") }}</label>
          <input
            id="share-display-name"
            v-model="createForm.displayName"
            type="text"
            class="input mb-4"
            :placeholder="t('settings.sharedPortfolios.displayNamePlaceholder')"
          />
          <p v-if="createError" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ createError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showCreate = false">{{ t("settings.profile.cancel") }}</button>
            <button type="submit" class="btn-primary" :disabled="createBusy || !createForm.portfolioId">
              {{ createBusy ? t("settings.sharedPortfolios.creating") : t("settings.sharedPortfolios.createShare") }}
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
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" :aria-label="t('settings.sharedPortfolios.deleteDialogAria')">
        <h3 class="mb-2 text-base font-semibold">{{ t("settings.sharedPortfolios.deleteDialogTitle") }}</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          {{ t("settings.sharedPortfolios.deleteDialogBody", { name: confirmDelete.displayName || confirmDelete.portfolioName }) }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="confirmDelete = null">{{ t("settings.profile.cancel") }}</button>
          <button type="button" class="btn-danger" :disabled="deleteBusy" @click="removeShare">
            {{ deleteBusy ? t("settings.sharedPortfolios.deleting") : t("settings.sharedPortfolios.delete") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
