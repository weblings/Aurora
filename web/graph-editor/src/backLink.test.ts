import { describe, expect, it, vi } from 'vitest'
import { closeFramedEditor } from './backLink'

describe('closeFramedEditor', () => {
  it('is false when not framed', () => {
    const win = {} as Window & { parent: unknown }
    win.parent = win
    expect(closeFramedEditor(win)).toBe(false)
  })
  it('is false when the parent has no hook', () => {
    expect(closeFramedEditor({ parent: {} } as unknown as Window)).toBe(false)
  })
  it('is false when reading the parent throws (cross-origin)', () => {
    const win = { get parent(): never { throw new Error('blocked') } } as unknown as Window
    expect(closeFramedEditor(win)).toBe(false)
  })
  it('calls the hook on the parent', () => {
    const auroraCloseEditor = vi.fn()
    expect(closeFramedEditor({ parent: { auroraCloseEditor } } as unknown as Window)).toBe(true)
    expect(auroraCloseEditor).toHaveBeenCalledOnce()
  })
})
