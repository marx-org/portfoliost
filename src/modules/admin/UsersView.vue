<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { fetchAdminUsers, type AdminUser } from "@/api/admin"

const users = ref<AdminUser[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const search = ref("")
const sortField = ref<"email" | "firstName" | "lastName" | "lastLogin" | "createdAt">("email")
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
  if (group === "portfoliost_admin") return "bg-accent-soft text-accent-text"
  return "bg-surface-2 text-muted"
}
</script>

<template>
  <div class="mission-control">
    <header class="page-header">
      <div>
        <p class="page-eyebrow"><span class="signal-dot" /> ADMIN / USERS</p>
        <h1 class="page-title">Users</h1>
      </div>
    </header>

    <div v-if="loading && !users.length" class="text-sm text-muted">Loading...</div>
    <div v-else-if="error" class="text-sm text-danger">{{ error }}</div>

    <div v-else>
      <div class="toolbar mb-4">
        <input
          v-model="search"
          placeholder="Filter by name or email..."
          class="input"
        />
      </div>

      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-2">
            <tr>
              <th class="cursor-pointer px-4 py-2 text-left font-medium text-muted" @click="toggleSort('email')">
                Email{{ sortIcon("email") }}
              </th>
              <th class="cursor-pointer px-4 py-2 text-left font-medium text-muted" @click="toggleSort('firstName')">
                Name{{ sortIcon("firstName") }}
              </th>
              <th class="px-4 py-2 text-left font-medium text-muted">UUID</th>
              <th class="px-4 py-2 text-left font-medium text-muted">Groups</th>
              <th class="cursor-pointer px-4 py-2 text-left font-medium text-muted" @click="toggleSort('lastLogin')">
                Last Login{{ sortIcon("lastLogin") }}
              </th>
              <th class="cursor-pointer px-4 py-2 text-left font-medium text-muted" @click="toggleSort('createdAt')">
                Created{{ sortIcon("createdAt") }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="user in filtered" :key="user.id" class="bg-surface">
              <td class="px-4 py-2 text-text">{{ user.email ?? "—" }}</td>
              <td class="px-4 py-2 text-text">
                {{ [user.firstName, user.lastName].filter(Boolean).join(" ") || "—" }}
              </td>
              <td class="max-w-[16rem] truncate px-4 py-2 font-mono text-xs text-muted" :title="user.id">
                {{ user.id }}
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
                <span v-if="!user.groups.length" class="text-muted">—</span>
              </td>
              <td class="px-4 py-2 text-muted">{{ user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : "—" }}</td>
              <td class="px-4 py-2 text-muted">{{ user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="mt-4 text-xs text-muted">{{ filtered.length }} user{{ filtered.length !== 1 ? "s" : "" }}</p>
    </div>
  </div>
</template>
