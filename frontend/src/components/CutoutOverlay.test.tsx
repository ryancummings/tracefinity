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

describe('filleted rectangle preview', () => {
  it('is a plain rectangle from above, with the floor edges where the side fillets end', () => {
    // 40mm wide at 15mm deep: fillet radius min(40/3, 15/2) = 7.5mm, as the generator uses
    const { container } = render(<svg><CutoutOverlay holes={[{ id: 'f', x: 0, y: 0, radius: 20, width: 40, height: 18, shape: 'filleted_rectangle' }]} defaultCutoutDepth={15} maxCutoutDepth={15} /></svg>)
    const rect = container.querySelector('rect')!
    expect([rect.getAttribute('x'), rect.getAttribute('y'), rect.getAttribute('width'), rect.getAttribute('height')]).toEqual(['-160', '-72', '320', '144'])
    expect(container.querySelector('path')).toBeNull()
    const floorEdges = [...container.querySelectorAll('line')].map(l => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('x2'), l.getAttribute('y2')])
    expect(floorEdges).toEqual([['-100', '-72', '-100', '72'], ['100', '-72', '100', '72']])
  })

  it('leaves out the floor edges where the depth is not known', () => {
    const { container } = render(<svg><CutoutOverlay holes={[{ id: 'f', x: 0, y: 0, radius: 20, width: 40, height: 18, shape: 'filleted_rectangle' }]} /></svg>)
    expect(container.querySelectorAll('rect')).toHaveLength(1)
    expect(container.querySelectorAll('line')).toHaveLength(0)
  })
})
