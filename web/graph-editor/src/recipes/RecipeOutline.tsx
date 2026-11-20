import { useMemo } from 'react'
import { BOX_H, BOX_W, TURN_H, TURN_W, diagram, outlineSteps, turnedDiagram } from './outline'
import { catalog, type Recipe } from './recipes'

// The generated static view: an SVG on wide screens, the text list under 650 px (CSS picks). The list is
// always in the page, so it doubles as the viewer's text alternative; the SVG is a picture of it.
export function RecipeOutline({ recipe, picture = true, tall = false }: { recipe: Recipe; picture?: boolean; tall?: boolean }) {
  const steps = useMemo(() => outlineSteps(recipe.doc, catalog), [recipe])
  const pic = useMemo(() => diagram(recipe.doc, catalog), [recipe])
  const col = useMemo(() => (tall ? turnedDiagram(recipe.doc, catalog) : null), [recipe, tall])
  return (
    <section className="recipe-outline" aria-label={`${recipe.name}, outline`}>
      {picture ? (
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
      ) : null}
      {picture && col ? (
        <svg className="recipe-outline-svg-tall" viewBox={`-2 -2 ${col.width + 4} ${col.height + 4}`} aria-hidden="true" focusable="false">
          {col.wires.map((w) => (
            <path key={w.id} d={w.d} fill="none" stroke={w.color} strokeWidth={w.bulk ? 3 : 2} strokeDasharray={w.dashed ? '6 4' : undefined} />
          ))}
          {col.boxes.map((b) => (
            <g key={b.id} transform={`translate(${b.x} ${b.y})`}>
              <rect width={TURN_W} height={TURN_H} rx="6" />
              {b.lines.map((line, i) => (
                <text key={line} x={TURN_W / 2} y={TURN_H / 2 + (i - (b.lines.length - 1) / 2) * 13 + 4} textAnchor="middle" className="recipe-outline-title">{line}</text>
              ))}
            </g>
          ))}
        </svg>
      ) : null}
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
