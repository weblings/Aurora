import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RecipesApp } from './RecipesApp'
import '@xyflow/react/dist/style.css'
import '../../../ui/styles/tokens.css'
import '@weblings/grille/tokens.css'
import '@weblings/grille/ui.css'
import '../../../ui/styles/forms.css'
import '../editor.css'
import './recipes.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RecipesApp />
  </StrictMode>,
)
