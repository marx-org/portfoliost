// D55-6 — node data shape passed to custom topology node components via
// vue-flow's `node.data`. The topology store (step 7 / D55-4) maps the
// /topology/status and /topology/traffic contract responses into this shape.

import type { components } from "@/api/types"
import type { NodeArea, ProviderMeta } from "../graph-definition"

export type TopologyServiceStatus = components["schemas"]["TopologyServiceStatus"]
export type TopologyServiceTraffic = components["schemas"]["TopologyServiceTraffic"]

export interface TopologyNodeData {
  label: string
  area: NodeArea
  /** True when the node maps to a probed deployment (status dot shown). */
  live: boolean
  provider?: ProviderMeta
  status?: TopologyServiceStatus
  traffic?: TopologyServiceTraffic
}
