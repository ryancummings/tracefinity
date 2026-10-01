// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultPaperSize, localePaperSize, saveSettings } from './settings'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('localePaperSize', () => {
  it('uses Letter in the US and Canada', () => {
    expect(localePaperSize(['en-US'])).toBe('letter')
    expect(localePaperSize(['fr-CA'])).toBe('letter')
  })

  it('infers the region of a bare language', () => {
    expect(localePaperSize(['en'])).toBe('letter')
    expect(localePaperSize(['de'])).toBe('a4')
  })

  it('uses A4 elsewhere and for unusable tags', () => {
    expect(localePaperSize(['en-GB'])).toBe('a4')
    expect(localePaperSize(['not a tag!'])).toBe('a4')
    expect(localePaperSize([])).toBe('a4')
  })
})

describe('getDefaultPaperSize', () => {
  it('follows the browser region until a size is chosen', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US'])
    expect(getDefaultPaperSize()).toBe('letter')
  })

  it('prefers the saved choice', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US'])
    saveSettings({ paperSize: 'a3' })
    expect(getDefaultPaperSize()).toBe('a3')
  })
})
