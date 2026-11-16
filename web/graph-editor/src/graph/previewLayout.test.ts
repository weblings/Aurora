import { describe, expect, it } from 'vitest'
import { layoutChoices, layoutName, layoutQuery, shownLayout, switchAnnouncement, type LayoutEnv } from './previewLayout'

const base: LayoutEnv = { noLights: false, testing: false, pick: null, savedZones: 8 }
const env = (over: Partial<LayoutEnv>): LayoutEnv => ({ ...base, ...over })

describe('shownLayout', () => {
  it('shows the lights while they work', () => expect(shownLayout(base)).toBe('lights'))
  it('shows the saved room with no lights, else the basic room', () => {
    expect(shownLayout(env({ noLights: true }))).toBe('room')
    expect(shownLayout(env({ noLights: true, savedZones: 0 }))).toBe('basic')
  })
  it('lets a sim be picked while the lights work', () => {
    expect(shownLayout(env({ pick: 'basic' }))).toBe('basic')
    expect(shownLayout(env({ pick: 'room' }))).toBe('room')
  })
  it('ignores a room pick once there is no saved map', () => expect(shownLayout(env({ pick: 'room', savedZones: 0 }))).toBe('lights'))
  it('pins a running test to the lights over any pick or outage', () => {
    expect(shownLayout(env({ testing: true, pick: 'basic' }))).toBe('lights')
    expect(shownLayout(env({ testing: true, noLights: true }))).toBe('lights')
  })
})

describe('names and choices', () => {
  it('names the real layout after the area, else Lights', () => {
    expect(layoutName('lights', 'Living room')).toBe('Living room')
    expect(layoutName('lights', null)).toBe('Lights')
    expect(layoutName('room', 'Living room')).toBe('Sim: your room')
    expect(layoutName('basic', null)).toBe('Sim: basic room')
  })
  it('leaves Sim: your room out with no saved map', () => {
    expect(layoutChoices(8)).toEqual(['lights', 'room', 'basic'])
    expect(layoutChoices(0)).toEqual(['lights', 'basic'])
  })
  it('sends no layout query for the lights', () => {
    expect(layoutQuery('lights')).toBeNull()
    expect(layoutQuery('basic')).toBe('basic')
  })
})

describe('switchAnnouncement', () => {
  it('announces the automatic switches', () => {
    expect(switchAnnouncement(base, env({ noLights: true }), null)).toBe("Can't reach your lights. Preview shows Sim: your room.")
    expect(switchAnnouncement(env({ noLights: true }), base, null)).toBe('Lights are back. Preview shows Lights.')
    expect(switchAnnouncement(env({ noLights: true }), env({ noLights: true, testing: true }), null)).toBe('Testing on your lights. Preview shows Lights.')
    expect(switchAnnouncement(env({ testing: true, noLights: true }), env({ noLights: true }), null)).toBe('Test ended. Preview shows Sim: your room.')
  })
  it('stays quiet for a user pick and for changes that move nothing', () => {
    expect(switchAnnouncement(base, env({ pick: 'basic' }), null)).toBeNull()
    expect(switchAnnouncement(env({ pick: 'basic' }), env({ pick: 'basic', noLights: true }), null)).toBeNull()
    expect(switchAnnouncement(base, env({ testing: true }), null)).toBeNull()
  })
})
