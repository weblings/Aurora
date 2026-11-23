import { describe, expect, it } from 'vitest'
import { hasFiles } from './useFileDrop'

describe('hasFiles', () => {
  it('is true only for a drag that carries files', () => {
    expect(hasFiles({ types: ['Files'] })).toBe(true)
    expect(hasFiles({ types: ['text/plain', 'Files'] })).toBe(true)
    expect(hasFiles({ types: ['text/plain'] })).toBe(false)
    expect(hasFiles(null)).toBe(false)
  })
})
