// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
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
