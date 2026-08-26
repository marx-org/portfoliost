<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { fetchAdminUsers, type AdminUser } from "@/api/admin"

const users = ref<AdminUser[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const search = ref("")
const sortField = ref<"email" | "firstName" | "lastName" | "createdAt">("email")
const sortDir = ref<"asc" | "desc">("asc")

async function load() {
  try {
    loading.value = true
    const params: Record<string, string> = { per_page: "200" }
    if (search.value) params.search = search.value
    const res = await fetchAdminUsers(params)
    users.value = res.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load"
  } finally {
    loading.value = false
  }
}

onMounted(load)

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  const list = q ? users.value.filter((u) =>
    (u.email ?? "").toLowerCase().includes(q) ||
    (u.firstName ?? "").toLowerCase().includes(q) ||
    (u.lastName ?? "").toLowerCase().includes(q),
  ) : users.value
  return list.sort((a, b) => {
    const av = (a[sortField.value] ?? "") as string
    const bv = (b[sortField.value] ?? "") as string
    return sortDir.value === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
  })
})

function toggleSort(field: typeof sortField.value) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc"
  } else {
    sortField.value = field
    sortDir.value = "asc"
  }
}

function sortIcon(field: typeof sortField.value) {
  if (sortField.value !== field) return ""
  return sortDir.value === "asc" ? " ↑" : " ↓"
}

function groupBadgeClass(group: string) {
  if (group === "portfoliost_admin") return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
  return "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
}
</script>

<template>
  <div>
    <div v-if="loading && !users.length" class="text-sm text-slate-500 dark:text-slate-400">Loading...</div>
    <div v-else-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</div>

    <div v-else>
      <input
        v-model="search"
        placeholder="Filter by name or email..."
        class="input mb-4 w-full max-w-sm"
      />

      <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th class="cursor-pointer px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300" @click="toggleSort('email')">
                Email{{ sortIcon("email") }}
              </th>
              <th class="cursor-pointer px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300" @click="toggleSort('firstName')">
                Name{{ sortIcon("firstName") }}
              </th>
              <th class="px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Groups</th>
              <th class="px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Last Login</th>
              <th class="cursor-pointer px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300" @click="toggleSort('createdAt')">
                Created{{ sortIcon("createdAt") }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="user in filtered" :key="user.id" class="bg-white dark:bg-slate-900">
              <td class="px-4 py-2 text-slate-900 dark:text-slate-100">{{ user.email ?? "—" }}</td>
              <td class="px-4 py-2 text-slate-900 dark:text-slate-100">
                {{ [user.firstName, user.lastName].filter(Boolean).join(" ") || "—" }}
              </td>
              <td class="px-4 py-2">
                <span
                  v-for="group in user.groups"
                  :key="group"
                  class="mr-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="groupBadgeClass(group)"
                >
                  {{ group }}
                </span>
                <span v-if="!user.groups.length" class="text-slate-400 dark:text-slate-500">—</span>
              </td>
              <td class="px-4 py-2 text-slate-500 dark:text-slate-400">
                {{ user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "—" }}
              </td>
              <td class="px-4 py-2 text-slate-500 dark:text-slate-400">{{ user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="mt-4 text-xs text-slate-400 dark:text-slate-500">{{ filtered.length }} user{{ filtered.length !== 1 ? "s" : "" }}</p>
    </div>
  </div>
</template>
