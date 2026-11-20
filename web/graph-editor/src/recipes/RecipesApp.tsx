import { useEffect, useRef, useState } from 'react'
import { Button, Header } from '@weblings/grille'
import { copyClip } from './copyClip'
import { RecipeOutline } from './RecipeOutline'
import { RecipeViewer } from './RecipeViewer'
import { recipes, type Recipe } from './recipes'

const fromHash = () => recipes.find((r) => r.slug === window.location.hash.slice(1)) ?? recipes[0]

export function RecipesApp() {
  const [current, setCurrent] = useState<Recipe>(fromHash)
  useEffect(() => {
    const onHash = () => setCurrent(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const pick = (r: Recipe) => {
    setCurrent(r)
    window.history.replaceState(null, '', `#${r.slug}`)
  }
  return (
    <div className="recipes">
      <Header>
        <h1>Aurora recipes</h1>
      </Header>
      <main className="recipes-main">
        <p className="recipes-howto">Pick a recipe, press Copy, then paste it into the graph editor with Ctrl+V (Cmd+V on a Mac).</p>
        <div className="recipes-layout">
          <nav className="recipes-list" aria-label="Recipes">
            {recipes.map((r) => (
              <Button key={r.slug} aria-pressed={r.slug === current.slug} onPress={() => pick(r)}>
                {r.name}
              </Button>
            ))}
          </nav>
          <RecipeCard recipe={current} />
        </div>
      </main>
    </div>
  )
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const box = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<number>(0)
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
    <article className="recipe-card" aria-labelledby="recipe-name">
      <h2 id="recipe-name">{recipe.name}</h2>
      <p>{recipe.description}</p>
      <p className="recipe-meta">Needs {recipe.needs}</p>
      {recipe.notes.length > 0 ? <p className="recipe-meta">{recipe.notes.join('. ')}.</p> : null}
      <div className="recipe-copy">
        <Button variant="primary" onPress={copy}>
          {state === 'copied' ? 'Copied' : 'Copy'}
        </Button>
        <span className="recipe-copy-status" role="status">
          {state === 'copied' ? 'Copied. Paste it in the graph editor with Ctrl+V.' : ''}
        </span>
      </div>
      {state === 'manual' ? (
        <label className="recipe-manual">
          Copying was blocked here. Select all of this text, copy it, and paste it in the graph editor.
          <textarea ref={box} readOnly value={recipe.text} rows={4} onFocus={(e) => e.currentTarget.select()} />
        </label>
      ) : null}
      <RecipeViewer recipe={recipe} />
      <RecipeOutline recipe={recipe} />
    </article>
  )
}
