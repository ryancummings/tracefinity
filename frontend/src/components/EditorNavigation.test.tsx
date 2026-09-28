// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorNavigation } from './EditorNavigation'

describe('EditorNavigation', () => {
  const props = { href: '/projects/project-1', label: 'Back to project', pending: false, saving: false, saved: true, error: null }

  it('offers a clear return link and confirms completed changes', () => {
    render(<EditorNavigation {...props} />)
    expect(screen.getByRole('link', { name: 'Back to project' }).getAttribute('href')).toBe('/projects/project-1')
    expect(screen.getByRole('status').textContent).toBe('Saved')
  })

  it('never reports saved while an edit is pending or a save has failed', () => {
    const { rerender, container } = render(<EditorNavigation {...props} pending />)
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Saving...')

    rerender(<EditorNavigation {...props} saved={false} error={new Error('offline')} />)
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Not saved')
  })
})
