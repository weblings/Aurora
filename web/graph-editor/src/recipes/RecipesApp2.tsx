import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Button, Dialog, Header, Icon, Menu, MenuItem, Popover, Tabs, chevronDownIcon } from '@weblings/grille'
import { EditorPopup } from '../EditorPopup'
import { hints } from '../graph/keys'
import { Hint } from '../Hint'
import { estimateHeight, layered } from '../graph/layout'
import { copyClip } from './copyClip'
import { RecipeOutline } from './RecipeOutline'
import { RecipeViewer } from './RecipeViewer'
import { catalog, recipes, type Recipe } from './recipes'

// Variant 2 (?v=2): pills pick the recipe (a Select on phones), the graph is the content, and the text
// outline (a box-and-wire picture) is a switch away, and the text list stays in the page for assistive tech.
const fromHash = () => recipes.find((r) => r.slug === window.location.hash.slice(1)) ?? recipes[0]

function usePhone(): boolean {
  const query = '(max-width: 649px)'
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}

// Tall enough for the graph at a readable size, never an empty band: from the layout's own extent.
function viewerHeight(recipe: Recipe): number {
  const at = layered(recipe.doc, catalog)
  const extent = Math.max(...recipe.doc.nodes.map((n) => at[n.id].y + estimateHeight(recipe.doc, catalog, n.id)))
  return Math.round(Math.min(640, Math.max(300, extent * 0.62 + 96)))
}

export function RecipesApp2() {
  const [current, setCurrent] = useState<Recipe>(fromHash)
  const phone = usePhone()
  // The outline replaces the graph, and stays on while moving between recipes.
  const [outline, setOutline] = useState(false)
  useEffect(() => {
    const onHash = () => setCurrent(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (slug: string) => {
    window.location.hash = slug
  }
  return (
    <div className="r2">
      <Header>
        <div className="r2-head">
          <h1>Aurora recipes</h1>
        </div>
      </Header>
      <main className="r2-main">
        {phone ? (
          <>
            <div className="r2-pick">
              <RecipePicker current={current} onPick={go} />
            </div>
            <RecipeDetail recipe={current} phone outline={outline} onOutline={setOutline} />
          </>
        ) : (
          <Tabs
            label="Recipes"
            selectedKey={current.slug}
            onSelectionChange={go}
            tabs={recipes.map((r) => ({ id: r.slug, label: r.name, content: r.slug === current.slug ? <RecipeDetail recipe={r} phone={false} outline={outline} onOutline={setOutline} /> : null }))}
          />
        )}
      </main>
    </div>
  )
}

function RecipeDetail({ recipe, phone, outline, onOutline }: { recipe: Recipe; phone: boolean; outline: boolean; onOutline: (on: boolean) => void }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const box = useRef<HTMLTextAreaElement>(null)
  const timer = useRef(0)
  const copyAt = useRef<HTMLSpanElement>(null)
  const height = useMemo(() => viewerHeight(recipe), [recipe])
  useEffect(() => {
    setState('idle')
    return () => window.clearTimeout(timer.current)
  }, [recipe])
  useEffect(() => {
    if (state === 'manual') box.current?.select()
  }, [state])
  const copy = async () => {
    window.clearTimeout(timer.current)
    if (await copyClip(recipe.text)) {
      setState('copied')
      timer.current = window.setTimeout(() => setState('idle'), 2000)
    } else setState('manual')
  }
  return (
    <article className="r2-detail" aria-labelledby="r2-name">
      <div className="r2-top">
        <div className="r2-info">
          <h2 id="r2-name">{recipe.name}</h2>
          <p className="r2-desc">{recipe.description}</p>
          {recipe.layout ? <p className="r2-meta">{recipe.layout}</p> : null}
        </div>
        <div className="r2-actions">
          <span ref={copyAt}>
            <Button size="action" variant="primary" onPress={copy}>
              {state === 'copied' ? 'Copied' : 'Copy'}
            </Button>
          </span>
          <Hint text="Show a simplified outline of the nodes and wires, instead of the full graph." placement="bottom">
            <label className="r2-text-switch">
              <span className="toggle-switch">
                <input type="checkbox" checked={outline} onChange={(e) => onOutline(e.target.checked)} />
                <span className="toggle-knob" />
              </span>
              <span>Outline</span>
            </label>
          </Hint>
        </div>
      </div>
      {/* Always mounted, so a screen reader hears the confirmation; the popout below is the visible one. */}
      <span role="status" className="r2-sr">{state === 'copied' ? `Copied. Paste into graph editor with ${hints.paste}.` : ''}</span>
      <Popover isOpen={state === 'copied'} onOpenChange={(open) => !open && setState('idle')} triggerRef={copyAt} isNonModal placement="bottom" offset={phone ? 8 : 48} aria-label="Copied">
        <Balloon anchor={copyAt}>Paste into graph editor with {hints.paste}</Balloon>
      </Popover>
      {state === 'manual' ? (
        <label className="r2-manual">
          Copying was blocked here. Select all of this text, copy it, and paste it in the graph editor.
          <textarea ref={box} readOnly value={recipe.text} rows={4} onFocus={(e) => e.currentTarget.select()} />
        </label>
      ) : null}
      {outline ? null : <RecipeViewer recipe={recipe} height={phone ? undefined : height} />}
      <RecipeOutline recipe={recipe} heading={false} picture={outline} tall />
    </article>
  )
}

// The word balloon (as the refused-save callout in the problems chip). React Aria places the popover, which
// flips and clamps to the window, and the pointer is aimed at the anchor from where the box actually landed.
function Balloon({ anchor, children }: { anchor: RefObject<HTMLElement | null>; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [arrow, setArrow] = useState<number | null>(null)
  useLayoutEffect(() => {
    let frame = 0
    const aim = () => {
      const b = box.current?.getBoundingClientRect()
      const a = anchor.current?.getBoundingClientRect()
      if (b && a) setArrow(Math.round(Math.min(b.width - 14, Math.max(14, a.left + a.width / 2 - b.left))))
      frame = requestAnimationFrame(aim)
    }
    aim()
    return () => cancelAnimationFrame(frame)
  }, [anchor])
  return (
    <div ref={box} className="ui-tooltip r2-balloon" style={arrow === null ? undefined : ({ '--balloon-arrow': `${arrow}px` } as CSSProperties)}>
      {children}
    </div>
  )
}

// Phone recipe picker: the editor's own menu pattern (Grille Menu, single selection, checkmark on the current
// one) rather than Grille's Select, whose list marks the choice only in bold.
function RecipePicker({ current, onPick }: { current: Recipe; onPick: (slug: string) => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => setOpen(false)
  return (
    <>
      <button ref={trigger} type="button" className="ui-select-trigger r2-picker" aria-haspopup="menu" aria-expanded={open} aria-label={`Recipe: ${current.name}`} onClick={() => setOpen((o) => !o)}>
        <span>{current.name}</span>
        <Icon icon={chevronDownIcon} size="sm" />
      </button>
      <EditorPopup isOpen={open} onClose={close} label="Recipes" triggerRef={trigger} placement="bottom" className="r2-picker-popup">
        <Dialog aria-label="Recipes">
          <Menu
            aria-label="Recipes"
            selectionMode="single"
            selectedKey={current.slug}
            onClose={close}
            onAction={(id) => {
              close()
              onPick(id)
            }}
          >
            {recipes.map((r) => (
              <MenuItem key={r.slug} id={r.slug}>
                {r.name}
              </MenuItem>
            ))}
          </Menu>
        </Dialog>
      </EditorPopup>
    </>
  )
}
