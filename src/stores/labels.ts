import { defineStore } from "pinia"
import { ref } from "vue"
import { getLabels, createLabel, updateLabel, deleteLabel, type Label } from "@/api/labels"

function byName(a: Label, b: Label): number {
  return a.name.localeCompare(b.name)
}

export const useLabelsStore = defineStore("labels", () => {
  const labels = ref<Label[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLabels() {
    loading.value = true
    error.value = null
    try {
      const data = await getLabels()
      labels.value = Array.isArray(data) ? data.sort(byName) : []
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load labels"
      throw err
    } finally {
      loading.value = false
    }
  }

  async function addLabel(input: { name: string; color?: string }): Promise<Label> {
    const created = await createLabel(input)
    labels.value = [...labels.value, created].sort(byName)
    return created
  }

  async function editLabel(id: string, patch: { name?: string; color?: string }): Promise<Label> {
    const updated = await updateLabel(id, patch)
    labels.value = labels.value.map((l) => (l.id === id ? updated : l)).sort(byName)
    return updated
  }

  async function removeLabel(id: string): Promise<void> {
    await deleteLabel(id)
    labels.value = labels.value.filter((l) => l.id !== id)
  }

  return { labels, loading, error, fetchLabels, addLabel, editLabel, removeLabel }
})
