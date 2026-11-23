import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NavFooter } from './NavFooter'

describe('NavFooter island', () => {
  it('draws Back and Continue as Grille action buttons', () => {
    const html = renderToStaticMarkup(<NavFooter />)
    expect(html).toContain('class="nav-footer"')
    expect(html.match(/data-size="action"/g)).toHaveLength(2)
    expect(html).toContain('Back')
    expect(html).toContain('Continue')
    expect(html).toContain('data-variant="primary"')
  })

  it('omits Back on a first step and the icon on request', () => {
    expect(renderToStaticMarkup(<NavFooter showBack={false} />)).not.toContain('Back')
    expect(renderToStaticMarkup(<NavFooter backIcon={false} />)).not.toContain('<svg')
    expect(renderToStaticMarkup(<NavFooter />)).toContain('<svg')
  })

  it('takes custom labels and a disabled Continue', () => {
    const html = renderToStaticMarkup(<NavFooter backLabel="Cancel" continueLabel="Applying…" continueDisabled />)
    expect(html).toContain('Cancel')
    expect(html).toContain('Applying…')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Applying…/)
  })
})
