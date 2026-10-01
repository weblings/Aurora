import { useEffect, useState } from 'react'
import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react'

// Toolchain spike (Aurora-lzj): proves Vite+React+@xyflow/react build through
// CMake, embed into the C++ binary, and load at /graph-editor/. No real
// editor code yet.
const nodes: Node[] = [
  { id: 'input', position: { x: 0, y: 0 }, data: { label: 'Input' } },
  { id: 'output', position: { x: 240, y: 0 }, data: { label: 'Output' } },
]
const edges: Edge[] = [{ id: 'input-output', source: 'input', target: 'output' }]

export function App() {
  const [version, setVersion] = useState('...')

  useEffect(() => {
    // Root-absolute on purpose: Aurora's REST API ignores the editor's base.
    fetch('/api/version')
      .then((r) => r.json())
      .then((j: { version: string }) => setVersion(j.version))
      .catch(() => setVersion('unavailable'))
  }, [])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Asset URLs are built from BASE_URL: a bare '/icon.svg' would 404. */}
        <img src={`${import.meta.env.BASE_URL}icon.svg`} width={20} height={20} alt="" />
        <strong>Aurora graph editor</strong>
        <span>server: {version}</span>
      </header>
      <div style={{ flex: 1 }}>
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
