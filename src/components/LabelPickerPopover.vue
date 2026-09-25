<script setup lang="ts">
import { ref, watch } from "vue"
import { storeToRefs } from "pinia"
import { useLabelsStore } from "@/stores/labels"
import { labelColors, labelPaletteHexes } from "@/utils/labelColors"
import {
  setPositionLabels,
  setTransactionLabels,
  setCashTransactionLabels,
} from "@/api/labels"
import type { Label } from "@/api/labels"

export type EntityKind = "position" | "transaction" | "cash-transaction"

const props = defineProps<{
  open: boolean
  entityId: string
  entityKind: EntityKind
  currentLabels: Label[]
  portfolioId?: string
  walletId?: string
}>()
const emit = defineEmits<{ close: []; saved: [labels: Label[]] }>()

const store = useLabelsStore()
const { labels: allLabels } = storeToRefs(store)
const selectedIds = ref<Set<string>>(new Set())
const busy = ref(false)
const error = ref<string | null>(null)
const showNewForm = ref(false)
const newName = ref("")
const newColor = ref(labelPaletteHexes[0])

watch(
  () => props.open,
  (v) => {
    if (v) {
      selectedIds.value = new Set(props.currentLabels.map((l) => l.id))
      error.value = null
      showNewForm.value = false
      newName.value = ""
      newColor.value = labelPaletteHexes[0]
      void store.fetchLabels().catch(() => {})
    }
  },
  { immediate: true },
)

function toggle(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function swatchStyle(hex: string, selected: boolean) {
  const c = labelColors(hex)
  return {
    backgroundColor: c.bg,
    color: c.text,
    boxShadow: selected ? `0 0 0 2px ${c.text}` : "none",
  }
}

async function save() {
  busy.value = true
  error.value = null
  try {
    const ids = [...selectedIds.value]
    let saved: Label[]
    switch (props.entityKind) {
      case "position":
        saved = await setPositionLabels(props.entityId, ids)
        break
      case "transaction":
        if (!props.portfolioId) throw new Error("Missing portfolioId")
        saved = await setTransactionLabels(props.portfolioId, props.entityId, ids)
        break
      case "cash-transaction":
        await setCashTransactionLabels(props.entityId, { labelIds: ids })
        saved = store.labels.filter((l) => ids.includes(l.id))
        break
    }
    emit("saved", saved)
    emit("close")
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to save labels"
  } finally {
    busy.value = false
  }
}

async function createAndToggle() {
  if (!newName.value.trim()) return
  busy.value = true
  error.value = null
  try {
    const created = await store.addLabel({ name: newName.value.trim(), color: newColor.value })
    selectedIds.value = new Set([...selectedIds.value, created.id])
    showNewForm.value = false
    newName.value = ""
    newColor.value = labelPaletteHexes[0]
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to create label"
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="absolute right-0 z-40 mt-1 w-72 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3 shadow-xl"
    role="dialog"
    aria-label="Set labels"
  >
    <p class="mb-2 text-xs font-medium uppercase text-slate-400 dark:text-slate-500">Set labels</p>
    <p v-if="error" class="mb-2 text-xs text-red-600 dark:text-red-400">{{ error }}</p>

    <div class="max-h-48 space-y-0.5 overflow-y-auto">
      <label
        v-for="label in allLabels"
        :key="label.id"
        class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-slate-300 text-blue-600"
          :checked="selectedIds.has(label.id)"
          @change="toggle(label.id)"
        />
        <span
          class="h-3 w-3 rounded-full flex-shrink-0"
          :style="{ backgroundColor: labelColors(label.color).bg, border: '1px solid ' + labelColors(label.color).text }"
        />
        <span class="truncate text-slate-700 dark:text-slate-200">{{ label.name }}</span>
      </label>
    </div>
    <p v-if="!allLabels.length" class="py-2 text-xs text-slate-400 dark:text-slate-500">No labels available.</p>

    <template v-if="!showNewForm">
      <button
        type="button"
        class="mt-2 w-full rounded-md border border-dashed border-slate-300 dark:border-slate-600 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        @click="showNewForm = true"
      >
        + Create new label
      </button>
    </template>
    <template v-else>
      <div class="mt-2 rounded-md border border-slate-200 dark:border-slate-700/60 p-2">
        <input
          v-model="newName"
          type="text"
          class="input mb-2 w-full !py-1 !text-xs"
          placeholder="Label name"
          maxlength="40"
        />
        <div class="mb-2 flex flex-wrap gap-1">
          <button
            v-for="hex in labelPaletteHexes"
            :key="hex"
            type="button"
            class="h-5 w-5 rounded-full"
            :style="swatchStyle(hex, hex === newColor)"
            @click="newColor = hex"
          />
        </div>
        <div class="flex justify-end gap-1">
          <button type="button" class="btn-ghost px-2 py-0.5 text-xs" @click="showNewForm = false">Cancel</button>
          <button
            type="button"
            class="btn-primary !px-2 !py-0.5 !text-xs"
            :disabled="busy || !newName.trim()"
            @click="createAndToggle"
          >
            Create
          </button>
        </div>
      </div>
    </template>

    <div class="mt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-2">
      <button type="button" class="btn-ghost text-xs" @click="emit('close')">Cancel</button>
      <button type="button" class="btn-primary text-xs" :disabled="busy" @click="save">
        {{ busy ? "Saving..." : "Save" }}
      </button>
    </div>
  </div>
</template>