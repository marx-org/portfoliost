// D55-6 — subtle connection handles shared by every topology node. Left is the
// target (incoming edges), right the source (outgoing edges) for the LR flow.
<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core"
</script>

<template>
  <Handle type="target" :position="Position.Left" class="tf-node-handle" />
  <Handle type="source" :position="Position.Right" class="tf-node-handle" />
</template>
