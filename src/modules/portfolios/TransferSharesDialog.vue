<script setup lang="ts">
/**
 * §74 — move an instrument from this portfolio to another one, in kind.
 *
 * Not a sale: the server draws the quantity FIFO from this portfolio's open lots
 * and writes one TRANSFER_OUT per lot at that lot's own cost, plus its TRANSFER_IN
 * in the destination. No cash moves and nothing is realised, so there are no fee
 * or FX fields here — only which instrument, how much, where it goes, and when.
 *
 * The quantity cap is the position's own holding. The server is the authority
 * (it rejects a quantity exceeding the open lots with 422), but capping here
 * means the common mistake — a typo of 100 on a 4-share lot — is caught before
 * the request.
 */
import { computed, ref, watch } from "vue"
import { usePortfolioStore } from "@/stores/portfolios"
import { getPortfolioPositions, transferPosition } from "@/api/portfolios"
import { formatNumber } from "@/utils/format"
import type { components } from "@/api/types"

type Position = components["schemas"]["Position"]

const props = defineProps<{ open: boolean; portfolioId: string }>()
const emit = defineEmits<{ (e: "close"): void; (e: "done"): void }>()

const store = usePortfolioStore()

const positions = ref<Position[]>([])
const positionsLoading = ref(false)
const symbol = ref("")
const quantity = ref("")
const toPortfolioId = ref("")
const date = ref(new Date().toISOString().slice(0, 10))
const notes = ref("")
const busy = ref(false)
const error = ref<string | null>(null)
const moved = ref<components["schemas"]["TransferPositionResponse"] | null>(null)

const targetPortfolios = computed(
  () => store.portfolios.filter((p) => p.id !== props.portfolioId && !p.isVirtual),
)

const selected = computed(() => positions.value.find((p) => p.symbol === symbol.value) ?? null)
const maxQuantity = computed(() => selected.value?.quantity ?? 0)
const quantityValue = computed(() => Number(quantity.value))
const overMax = computed(() => selected.value != null && quantityValue.value > maxQuantity.value)
const canSubmit = computed(
  () =>
    !busy.value &&
    symbol.value !== "" &&
    toPortfolioId.value !== "" &&
    Number.isFinite(quantityValue.value) &&
    quantityValue.value > 0 &&
    !overMax.value,
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    symbol.value = ""
    quantity.value = ""
    toPortfolioId.value = ""
    date.value = new Date().toISOString().slice(0, 10)
    notes.value = ""
    error.value = null
    moved.value = null
    // A portfolio page can be opened directly (a shared link, a deep link)
    // without the investments list ever being fetched, and the destination
    // picker needs it.
    if (store.portfolios.length === 0) {
      try {
        await store.fetchAll()
      } catch {
        error.value = "Could not load your other portfolios"
      }
    }
    positionsLoading.value = true
    try {
      const rows = await getPortfolioPositions(props.portfolioId)
      positions.value = rows.filter((p) => p.isOpen && (p.direction ?? "LONG") === "LONG" && p.quantity > 0)
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Could not load positions"
    } finally {
      positionsLoading.value = false
    }
  },
)

// Selecting an instrument is the natural place to pre-fill "all of it": the
// dialog is almost always opened to move a whole holding or a slice of one.
watch(symbol, () => {
  if (selected.value && quantity.value === "") quantity.value = String(selected.value.quantity)
})

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = null
  try {
    moved.value = await transferPosition(props.portfolioId, {
      symbol: symbol.value,
      quantity: quantityValue.value,
      toPortfolioId: toPortfolioId.value,
      executedAt: date.value,
      notes: notes.value || null,
    })
    emit("done")
    // The dialog stays open on success: a multi-lot move is worth confirming, and
    // the list is re-fetched so a second transfer in the same dialog is capped
    // against what is actually still open.
    try {
      const rows = await getPortfolioPositions(props.portfolioId)
      positions.value = rows.filter((p) => p.isOpen && (p.direction ?? "LONG") === "LONG" && p.quantity > 0)
    } catch {
      // The move already succeeded; a stale list here must not read as a failure.
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Transfer failed"
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
    @click.self.stop="emit('close')"
  >
    <div class="card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6" role="dialog" aria-modal="true" aria-label="Transfer shares">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">Transfer shares</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="emit('close')">✕</button>
      </div>

      <p class="mb-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
        An in-kind transfer, not a sale. The shares keep their original cost basis, no cash moves, and nothing is realised — each lot that leaves gets its own matching row in the destination.
      </p>

      <form class="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="ts-form" @submit.prevent="submit">
        <div>
          <label for="ts-instrument" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Instrument *</label>
          <select id="ts-instrument" v-model="symbol" class="input" required data-testid="ts-instrument">
            <option value="" disabled>{{ positionsLoading ? "Loading positions…" : "Select a holding" }}</option>
            <option v-for="p in positions" :key="p.id" :value="p.symbol">
              {{ p.symbol }} — {{ formatNumber(p.quantity, 2) }} {{ p.assetType === "OPTION" ? "contracts" : "shares" }}
            </option>
          </select>
        </div>

        <div>
          <label for="ts-quantity" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">
            Quantity *
            <span v-if="selected" class="text-slate-500 dark:text-slate-400">(max {{ formatNumber(maxQuantity, 2) }})</span>
          </label>
          <input
            id="ts-quantity"
            v-model="quantity"
            type="number"
            min="1"
            :max="maxQuantity || undefined"
            class="input"
            required
            data-testid="ts-quantity"
          />
        </div>

        <div>
          <label for="ts-to-portfolio" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">To portfolio *</label>
          <select id="ts-to-portfolio" v-model="toPortfolioId" class="input" required data-testid="ts-to-portfolio">
            <option value="" disabled>Select destination portfolio</option>
            <option v-for="p in targetPortfolios" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>

        <div>
          <label for="ts-date" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Date</label>
          <input id="ts-date" v-model="date" type="date" class="input" data-testid="ts-date" />
        </div>

        <div class="sm:col-span-2">
          <label for="ts-notes" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Note</label>
          <input id="ts-notes" v-model="notes" type="text" class="input" maxlength="2000" data-testid="ts-notes" />
        </div>

        <p v-if="overMax" class="text-sm text-red-600 dark:text-red-400 sm:col-span-2" data-testid="ts-over-max">
          Only {{ formatNumber(maxQuantity, 2) }} of {{ symbol }} are open in this portfolio.
        </p>
        <p v-if="error" class="text-sm text-red-600 dark:text-red-400 sm:col-span-2">{{ error }}</p>
        <p v-if="moved" class="text-sm text-emerald-700 dark:text-emerald-300 sm:col-span-2" data-testid="ts-result">
          Moved {{ formatNumber(moved.quantity, 2) }} of {{ moved.legs[0]?.instrumentSymbol }} in
          {{ moved.legs.length / 2 }} lot{{ moved.legs.length / 2 === 1 ? "" : "s" }}.
        </p>

        <div class="flex justify-end gap-2 sm:col-span-2">
          <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn-primary" :disabled="!canSubmit" data-testid="ts-submit">
            {{ busy ? "Transferring…" : "Transfer" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
