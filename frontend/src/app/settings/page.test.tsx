// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import SettingsPage from './page'
import { getCutoutDefaults, getSettings } from '@/lib/settings'

afterEach(() => { cleanup(); localStorage.clear() })

describe('cutout settings', () => {
  it('saves a scoop diameter and text size for later creation', () => {
    render(<SettingsPage />)
    const scoop = screen.getByText('Finger scoop').closest('.rounded-lg') as HTMLElement
    const diameter = within(scoop).getByLabelText(/Diameter/i)
    fireEvent.change(diameter, { target: { value: '24' } })
    fireEvent.blur(diameter)
    expect(getCutoutDefaults('scoop').radius).toBe(12)

    const text = screen.getByLabelText(/Default text size/i)
    fireEvent.change(text, { target: { value: '7.5' } })
    fireEvent.blur(text)
    expect(getSettings().textSize).toBe(7.5)
  })
})

describe('paper size setting', () => {
  it('starts from the browser region and saves a chosen size', () => {
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US'])
    render(<SettingsPage />)
    const group = screen.getByRole('group', { name: 'Default paper size' })
    const radio = (name: string) => within(group).getByRole('radio', { name }) as HTMLInputElement
    expect(radio('Letter').checked).toBe(true)

    fireEvent.click(radio('A4'))
    expect(getSettings().paperSize).toBe('a4')
    expect(radio('A4').checked).toBe(true)
    expect(radio('Letter').checked).toBe(false)
    languages.mockRestore()
  })

  it('saves the inferred size when it is clicked, so a later region change cannot move it', () => {
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB'])
    render(<SettingsPage />)
    expect(screen.getByText(/Following your browser's region/)).toBeTruthy()
    const group = screen.getByRole('group', { name: 'Default paper size' })
    fireEvent.click(within(group).getByRole('radio', { name: 'A4' }))
    expect(getSettings().paperSize).toBe('a4')
    expect(screen.queryByText(/Following your browser's region/)).toBeNull()
    languages.mockRestore()
  })
})
