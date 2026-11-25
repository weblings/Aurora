import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../ui/styles/tokens.css'
import '@weblings_things/grille/tokens.css'
import '@weblings_things/grille/ui.css'
import '../../../ui/styles/forms.css'
import '../../../ui/styles/dropdown.css'
import '../../../ui/styles/shell.css'
import '../../../ui/styles/dashboard.css'
import '../editor.css'
import './gapsMock.css'
import { GapsMock } from './GapsMock'

// Dev-only page (Aurora-4nqt.5): `npm run dev`, then /graph-editor/gaps-mock.html. Not in the build.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GapsMock />
  </StrictMode>,
)
