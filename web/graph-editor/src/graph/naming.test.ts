import { describe, expect, it } from 'vitest'
import { controlLabelCheck, nameBlocked, renameEffectSpec, saveAsSpec, sectionSpec, TITLE_MAX } from './naming'

const taken = ['Sunset', 'Slow rainbow']

describe('naming dialog rules', () => {
  it('Save as new opens on a free name and notices a taken one without blocking', () => {
    const s = saveAsSpec('Sunset', taken)
    expect(s.initial).toBe('Sunset (Copy)')
    expect(s.check(s.initial)).toBeNull()
    const m = s.check('sunset')
    expect(m).toEqual({ tone: 'notice', text: 'Another effect is named "Sunset". This saves as "sunset (Copy)".' })
    expect(nameBlocked(s, 'sunset', m)).toBe(false)
    expect(nameBlocked(s, '  ', null)).toBe(true)
  })

  it('Rename blocks a name another effect has, not its own', () => {
    const s = renameEffectSpec('Sunset', taken)
    expect(s.check('Sunset')).toBeNull()
    expect(s.check('Sunset 2')).toBeNull()
    const m = s.check('slow RAINBOW')
    expect(m).toEqual({ tone: 'error', text: 'Another effect is named "Slow rainbow".' })
    expect(nameBlocked(s, 'slow RAINBOW', m)).toBe(true)
  })

  it('notices the length limit', () => {
    const s = renameEffectSpec('Sunset', taken)
    expect(s.check('x'.repeat(TITLE_MAX))?.tone).toBe('notice')
    expect(s.check('x'.repeat(TITLE_MAX - 1))).toBeNull()
  })

  it('a section name may not be General or another section', () => {
    const add = sectionSpec('add', ['Response speed', 'Sensitivity'])
    expect(add.check('Brightness')).toBeNull()
    expect(add.check('sensitivity')).toEqual({ tone: 'error', text: 'Another section is named "Sensitivity".' })
    expect(add.check('general')?.tone).toBe('error')
    const rename = sectionSpec('rename', ['Response speed', 'Sensitivity'], 'Sensitivity')
    expect(rename.check('SENSITIVITY')).toBeNull()
    expect(rename.confirm).toBe('Rename')
    expect(sectionSpec('add', [], '', 'Vibrancy value').confirm).toBe('Create and move')
  })

  it('Edit control: empty and shared labels are notices that never block', () => {
    const empty = controlLabelCheck('  ', 'Vibrancy value', [])
    expect(empty).toEqual({ tone: 'notice', text: "Empty uses the param's own name, \"Vibrancy value\"." })
    expect(nameBlocked({ allowEmpty: true }, '', empty)).toBe(false)
    const shared = controlLabelCheck('fixed hue', 'Hue', ['Fixed hue'])
    expect(shared).toEqual({ tone: 'notice', text: 'Another control is named "Fixed hue". Tuning shows both.' })
    expect(nameBlocked({ allowEmpty: true }, 'fixed hue', shared)).toBe(false)
    expect(controlLabelCheck('Loud', 'Hue', ['Fixed hue'])).toBeNull()
  })
})
