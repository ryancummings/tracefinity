// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CutoutOverlay } from './CutoutOverlay'

afterEach(cleanup)

describe('finger scoop preview', () => {
  it('shows the full opening and the narrower floor after the bottom bevel', () => {
    const { container } = render(<svg><CutoutOverlay holes={[{ id: 'scoop', x: 0, y: 0, radius: 10, shape: 'scoop' }]} defaultCutoutDepth={15} maxCutoutDepth={15} /></svg>)
    const circles = container.querySelectorAll('circle')
    expect(circles).toHaveLength(2)
    expect(circles[0].getAttribute('r')).toBe('80')
    expect(circles[1].getAttribute('r')).toBe('56')
  })
})
