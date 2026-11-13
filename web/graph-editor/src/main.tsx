import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@xyflow/react/dist/style.css'
import '../../ui/styles/tokens.css'
import '@weblings/grille/tokens.css'
import '@weblings/grille/ui.css'
import '../../ui/styles/forms.css'
import '../../ui/styles/shell.css'
import './editor.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
