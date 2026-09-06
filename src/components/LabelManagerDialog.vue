<script setup lang="ts">
import { ref, watch } from "vue"
import { storeToRefs } from "pinia"
import { useLabelsStore } from "@/stores/labels"
import { labelColors, labelPaletteHexes } from "@/utils/labelColors"
import type { Label } from "@/api/labels"

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const store = useLabelsStore()
const { labels } = storeToRefs(store)
const busy = ref(false)
const error = ref<string | null>(null)

const newName = ref("")
const newColor = ref(labelPaletteHexes[0])
const editingId = ref<string | null>(null)
const editingName = ref("")
const editingColor = ref("")
const deleteId = ref<string | null>(null)
const deleteBusy = ref(false)

watch(
  () => props.open,
  (v) => {
    if (v) {
      error.value = null
      editingId.value = null
      deleteId.value = null
      newName.value = ""
      newColor.value = labelPaletteHexes[0]
      void store.fetchLabels().catch(() => {})
    }
  },
  { immediate: true },
)

function swatchStyle(hex: string, selected: boolean) {
  const c = labelColors(hex)
  return {
    backgroundColor: c.bg,
    color: c.text,
    boxShadow: selected ? `0 0 0 2px ${c.text}` : "none",
  }
}

async function handleCreate() {
  if (!newName.value.trim()) return
  busy.value = true
  error.value = null
  try {
    await store.addLabel({ name: newName.value.trim(), color: newColor.value })
    newName.value = ""
    newColor.value = labelPaletteHexes[0]
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to create label"
  } finally {
    busy.value = false
  }
}

function startEdit(label: Label) {
  editingId.value = label.id
  editingName.value = label.name
  editingColor.value = label.color
}

async function saveEdit() {
  if (!editingId.value || !editingName.value.trim()) return
  busy.value = true
  error.value = null
  try {
    await store.editLabel(editingId.value, {
      name: editingName.value.trim(),
      color: editingColor.value,
    })
    editingId.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to update label"
  } finally {
    busy.value = false
  }
}

function startDelete(id: string) {
  deleteId.value = id
}

async function confirmDelete() {
  if (!deleteId.value) return
  deleteBusy.value = true
  error.value = null
  try {
    await store.removeLabel(deleteId.value)
    deleteId.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to delete label"
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24" @click.self="emit('close')">
      <div class="card w-full max-w-lg p-6" role="dialog" aria-modal="true" aria-label="Manage labels">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold">Manage Labels</h3>
          <button type="button" class="btn-ghost px-2 py-1 text-sm" @click="emit('close')">Close</button>
        </div>

        <!-- Create form -->
        <div class="mb-4 rounded-lg border border-slate-200 dark:border-slate-700/60 p-3">
          <p class="mb-2 text-xs font-medium uppercase text-slate-400 dark:text-slate-500">New label</p>
          <form class="flex items-end gap-3" @submit.prevent="handleCreate">
            <label class="flex-1">
              <span class="label">Name</span>
              <input v-model="newName" type="text" class="input" required maxlength="40" placeholder="e.g. Dividend" />
            </label>
            <div>
              <span class="label">Colour</span>
              <div class="flex flex-wrap gap-1 pt-1">
                <button
                  v-for="hex in labelPaletteHexes"
                  :key="hex"
                  type="button"
                  class="h-6 w-6 rounded-full"
                  :style="swatchStyle(hex, newColor === hex)"
                  @click="newColor = hex"
                />
              </div>
            </div>
            <button type="submit" class="btn-primary" :disabled="busy || !newName.trim()">Add</button>
          </form>
        </div>

        <p v-if="error" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>

        <!-- Label list -->
        <div class="max-h-72 space-y-1 overflow-y-auto">
          <div v-if="!labels.length" class="py-4 text-center text-sm text-slate-400 dark:text-slate-500">No labels yet.</div>
          <div v-for="label in labels" :key="label.id" class="group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <!-- View mode -->
            <template v-if="editingId !== label.id">
              <span class="h-3 w-3 rounded-full flex-shrink-0" :style="{ backgroundColor: labelColors(label.color).bg, border: '1px solid ' + labelColors(label.color).text }" />
              <span class="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{{ label.name }}</span>
              <button type="button" class="btn-ghost px-2 py-1 text-xs opacity-0 group-hover:opacity-100" @click="startEdit(label)">Edit</button>
              <button type="button" class="btn-ghost px-2 py-1 text-xs text-red-600 opacity-0 group-hover:opacity-100" @click="startDelete(label.id)">Delete</button>
            </template>
            <!-- Edit mode -->
            <template v-else>
              <input v-model="editingName" data-testid="lm-edit-name" type="text" class="input flex-1 !py-1" maxlength="40" />
              <div class="flex gap-1">
                <button
                  v-for="hex in labelPaletteHexes"
                  :key="hex"
                  type="button"
                  class="h-5 w-5 rounded-full"
                  :style="swatchStyle(hex, editingColor === hex)"
                  @click="editingColor = hex"
                />
              </div>
              <button type="button" class="btn-ghost px-2 py-1 text-xs text-green-600" :disabled="busy" @click="saveEdit">Save</button>
              <button type="button" class="btn-ghost px-2 py-1 text-xs" @click="editingId = null">Cancel</button>
            </template>
          </div>
        </div>

        <!-- Delete confirmation -->
        <Teleport to="body">
          <div v-if="deleteId" class="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 p-4" @click.self="deleteId = null">
            <div class="card w-full max-w-sm p-6" role="dialog" aria-label="Delete label">
              <h4 class="mb-2 text-sm font-semibold">Delete label?</h4>
              <p class="mb-4 text-sm text-slate-600 dark:text-slate-300">
                This label will be removed from all positions and transactions. This cannot be undone.
              </p>
              <div class="flex justify-end gap-2">
                <button type="button" class="btn-ghost" @click="deleteId = null">Cancel</button>
                <button type="button" class="btn-danger" :disabled="deleteBusy" data-testid="lm-confirm-delete" @click="confirmDelete">
                  {{ deleteBusy ? "Deleting..." : "Delete" }}
                </button>
              </div>
            </div>
          </div>
        </Teleport>
      </div>
    </div>
  </Teleport>
</template>
