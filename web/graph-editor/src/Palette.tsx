import { paletteGroups } from './graph/palette'
import type { Catalog } from './graph/types'

export const PALETTE_DRAG_TYPE = 'application/x-aurora-node-type'

type Props = {
  catalog: Catalog
  onAdd: (type: string) => void
}

// Every node type the server offers; click adds at the view centre, dragging
// onto the canvas adds at the drop point.
export function Palette({ catalog, onAdd }: Props) {
  return (
    <nav className="palette" aria-label="Add node">
      <h3>Add node</h3>
      {paletteGroups(catalog).map((group) => (
        <section key={group.prefix}>
          <h4>{group.prefix}</h4>
          {group.types.map((info) => (
            <button
              type="button"
              key={info.type}
              className="palette-item"
              title={info.purpose || info.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(PALETTE_DRAG_TYPE, info.type)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onAdd(info.type)}
            >
              {info.title || info.type}
            </button>
          ))}
        </section>
      ))}
    </nav>
  )
}
