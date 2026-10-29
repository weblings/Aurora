import { describe, expect, it } from 'vitest'
import nodesSample from './server-samples/nodes.json'
import video from './server-samples/builtin.video.json'
import audio from './server-samples/builtin.audio.json'
import { refuseConnection } from './connection'
import { removeEdge, splitEndpoint } from './doc'
import { toFlowNodes } from './flow'
import type { Catalog, GraphDoc, NodeTypeInfo } from './types'

// Snapshots of GET /api/nodes and GET /api/effects/builtin.{video,audio} from a
// running Aurora (2026-10-29). Refresh them if the catalog's shape changes.
const catalog: Catalog = new Map((nodesSample.nodes as unknown as NodeTypeInfo[]).map((n) => [n.type, n]))
const KINDS = new Set(['float', 'optional-float', 'bool', 'enum', 'gradient'])

describe.each([
  ['builtin.video', video.graph],
  ['builtin.audio', audio.graph],
])('%s from the server', (_name, graph) => {
  const doc = graph as unknown as GraphDoc

  it('uses only catalog types and param kinds the editor draws', () => {
    for (const node of doc.nodes) {
      const info = catalog.get(node.type)
      expect(info, node.type).toBeDefined()
      for (const p of info!.params) expect(KINDS.has(p.kind), `${node.type}.${p.name}: ${p.kind}`).toBe(true)
    }
  })

  it('lays every node out in its own place', () => {
    const nodes = toFlowNodes(doc, catalog)
    expect(nodes).toHaveLength(doc.nodes.length)
    expect(new Set(nodes.map((n) => `${n.position.x},${n.position.y}`)).size).toBe(nodes.length)
  })

  it('allows each existing edge when it is the one being drawn', () => {
    for (const edge of doc.edges) {
      const from = splitEndpoint(edge[0])
      const to = splitEndpoint(edge[1])
      const without = removeEdge(doc, edge)
      const reason = refuseConnection(without, catalog, {
        source: from.node, sourceHandle: from.port, target: to.node, targetHandle: to.port,
      })
      expect(reason, `${edge[0]} -> ${edge[1]}`).toBeNull()
    }
  })

  it('refuses re-drawing an existing edge', () => {
    const edge = doc.edges[0]
    const from = splitEndpoint(edge[0])
    const to = splitEndpoint(edge[1])
    expect(
      refuseConnection(doc, catalog, { source: from.node, sourceHandle: from.port, target: to.node, targetHandle: to.port }),
    ).toMatch(/already has a connection/)
  })
})

describe('catalog from the server', () => {
  it('has titles and port descriptions for every type', () => {
    for (const info of catalog.values()) {
      expect(typeof info.title === 'string' && info.title !== '', `${info.type} title`).toBe(true)
      for (const p of [...info.inputs, ...info.outputs]) expect(typeof p.description === 'string' && p.description !== '', `${info.type}.${p.name} description`).toBe(true)
    }
  })
})
