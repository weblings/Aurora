// Shapes of the two server documents the editor works with: the node catalog
// (GET /api/nodes) and a saved graph (GET /api/effects/:id -> graph).

export type PortInfo = {
  name: string
  type: string
  description: string
  required?: boolean
}

export type ParamKind = 'float' | 'optional-float' | 'bool' | 'enum' | 'gradient'

export type GradientStop = { pos: number; color: string }

// Float: number. OptionalFloat: number or null (unset). Bool: boolean.
// Enum: string. Gradient: 2 to 16 stops in ascending pos.
export type ParamValue = number | null | boolean | string | GradientStop[]

export type ParamInfo = {
  name: string
  kind: ParamKind
  description: string
  label?: string
  min?: number
  max?: number
  step?: number
  unit?: string
  allowsUnset?: boolean
  options?: string[]
  default: ParamValue
}

export type NodeTypeInfo = {
  type: string
  title: string
  purpose: string
  useWhen: string
  example: string
  cost: string
  inputs: PortInfo[]
  outputs: PortInfo[]
  params: ParamInfo[]
  // Name of the param that binds an output.send-style node to one output.
  sink?: string
}

export type Catalog = ReadonlyMap<string, NodeTypeInfo>

export type Position = { x: number; y: number }

export type GraphNode = {
  id: string
  type: string
  params?: Record<string, ParamValue>
  [extra: string]: unknown
}

// ["node.port", "node.port"], output first.
export type GraphEdge = [string, string]

// The whole graph as the server stores it. Keys the editor does not edit
// (version, title, tickHz, controls, ...) ride along untouched.
export type GraphDoc = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  ui?: Record<string, Position>
  [extra: string]: unknown
}

export type EffectListEntry = {
  id: string
  builtin: boolean
  title: string
  description: string | null
}
