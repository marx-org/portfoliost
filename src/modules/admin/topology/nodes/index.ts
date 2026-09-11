// D55-6 — custom topology node components, one per node area. Register with
// <VueFlow :node-types="TOPOLOGY_NODE_TYPES" /> where each node's `type` is its
// area name (see graph-definition.ts).

import "./nodes.css"

import type { Component } from "vue"
import type { NodeArea } from "../graph-definition"

import InternalNode from "./InternalNode.vue"
import StorageNode from "./StorageNode.vue"
import JobNode from "./JobNode.vue"
import ExternalNode from "./ExternalNode.vue"
import ProviderNode from "./ProviderNode.vue"

export const TOPOLOGY_NODE_TYPES: Record<NodeArea, Component> = {
  internal: InternalNode,
  storage: StorageNode,
  jobs: JobNode,
  "external-services": ExternalNode,
  "data-providers": ProviderNode,
}

export { InternalNode, StorageNode, JobNode, ExternalNode, ProviderNode }
export { default as NodeHandles } from "./NodeHandles.vue"
export { default as StatusDot } from "./StatusDot.vue"
export * from "./status"
export * from "./types"
