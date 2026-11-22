import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../ui/styles/tokens.css'
import '@weblings_things/grille/tokens.css'
import '@weblings_things/grille/ui.css'
import '../../../ui/styles/forms.css'
import '../editor.css'
import './controlsMock.css'
import { ControlsPanelMock } from './ControlsPanelMock'

// Dev-only page (Aurora-e4bi.1): `npm run dev`, then /graph-editor/controls-mock.html. Not in the build.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ControlsPanelMock />
  </StrictMode>,
)
