// D55-6 — node data shape passed to custom topology node components via
// vue-flow's `node.data`. The topology store (step 7 / D55-4) maps the
// /topology/status and /topology/traffic contract responses into this shape.

import type { components } from "@/api/types"
import type { NodeArea, ProviderMeta } from "../graph-definition"

export type TopologyServiceStatus = components["schemas"]["TopologyServiceStatus"]
export type TopologyServiceTraffic = components["schemas"]["TopologyServiceTraffic"]

export interface TopologyNodeData {
  /** Node id — matches the graph-definition id and the data-node-id attribute. */
  id: string
  label: string
  area: NodeArea
  /** True when the node maps to a probed deployment (status dot shown). */
  live: boolean
  /** D55-7 / step 10 — the clicked node gets a ring (set by the view). */
  selected?: boolean
  /** D55-7 / step 10 — nodes unrelated to the selection are dimmed. */
  dimmed?: boolean
  provider?: ProviderMeta
  status?: TopologyServiceStatus
  traffic?: TopologyServiceTraffic
}
