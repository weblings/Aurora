import { useMemo } from 'react'
import { BOX_H, BOX_W, diagram, outlineSteps } from './outline'
import { catalog, type Recipe } from './recipes'

// The generated static view: an SVG on wide screens, the text list under 650 px (CSS picks). The list is
// always in the page, so it doubles as the viewer's text alternative; the SVG is a picture of it.
export function RecipeOutline({ recipe }: { recipe: Recipe }) {
  const steps = useMemo(() => outlineSteps(recipe.doc, catalog), [recipe])
  const pic = useMemo(() => diagram(recipe.doc, catalog), [recipe])
  return (
    <section className="recipe-outline" aria-label={`${recipe.name}, outline`}>
      <h3>Outline</h3>
      <svg className="recipe-outline-svg" viewBox={`-2 -2 ${pic.width + 4} ${pic.height + 4}`} aria-hidden="true" focusable="false">
        {pic.wires.map((w) => (
          <path key={w.id} d={w.d} fill="none" stroke={w.color} strokeWidth={w.bulk ? 3 : 2} strokeDasharray={w.dashed ? '6 4' : undefined} />
        ))}
        {pic.boxes.map((b) => (
          <g key={b.id} transform={`translate(${b.x} ${b.y})`}>
            <rect width={BOX_W} height={BOX_H} rx="6" />
            <text x="10" y="20" className="recipe-outline-title">{b.title}</text>
            <text x="10" y="37" className="recipe-outline-type">{b.type}</text>
          </g>
        ))}
      </svg>
      <ol className="recipe-outline-list">
        {steps.map((s) => (
          <li key={s.id}>
            <strong>{s.title}</strong> <code>{s.type}</code>
            {s.takes.length > 0 ? <span className="recipe-outline-line">Takes {s.takes.join(', ')}</span> : null}
            {s.set.length > 0 ? <span className="recipe-outline-line">Set {s.set.join(', ')}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}
