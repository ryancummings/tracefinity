// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BinToolInspector } from './BinToolInspector'

afterEach(() => { cleanup(); localStorage.clear() })

const tool = {
  id: 'placed', tool_id: 'pliers', name: 'Pliers', points: [],
  finger_holes: [], interior_rings: [], rotation: 0,
}
const props = { tool, binDepth: 20, maxDepth: 14, smoothed: false, smoothLevel: 0.5, onDepthChange: vi.fn(), onRemove: vi.fn() }

describe('collapsible bin inspector', () => {
  it('collapses to a titled tab and expands again', () => {
    render(<BinToolInspector {...props} />)
    expect(screen.getByLabelText('Tool pocket depth (mm)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse settings' }))
    expect(screen.queryByLabelText('Tool pocket depth (mm)')).toBeNull()
    const tab = screen.getByRole('button', { name: 'Pliers' })
    expect(tab.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('complementary', { name: 'Tool settings' })).toBeTruthy()

    fireEvent.click(tab)
    expect(screen.getByLabelText('Tool pocket depth (mm)')).toBeTruthy()
  })

  it('stays collapsed for the next selection and visit', () => {
    const { unmount } = render(<BinToolInspector {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse settings' }))
    unmount()

    render(<BinToolInspector {...props} tool={{ ...tool, id: 'other', name: 'Wrench' }} />)
    expect(screen.queryByLabelText('Tool pocket depth (mm)')).toBeNull()
    expect(screen.getByRole('button', { name: 'Wrench' })).toBeTruthy()
  })
})
