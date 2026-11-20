import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RecipesApp } from './RecipesApp'
import { RecipesApp2 } from './RecipesApp2'
import '@xyflow/react/dist/style.css'
import '../../../ui/styles/tokens.css'
import '@weblings/grille/tokens.css'
import '@weblings/grille/ui.css'
import '../../../ui/styles/forms.css'
import '../editor.css'
import './recipes.css'
import './recipes2.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get('v') === '2' ? <RecipesApp2 /> : <RecipesApp />}
  </StrictMode>,
)
