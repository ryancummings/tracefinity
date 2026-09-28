// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BinCutoutInspector } from './BinCutoutInspector'
import { BinToolInspector } from './BinToolInspector'

afterEach(cleanup)

const selectedTool = {
  id: 'placed', tool_id: 'square', name: 'Square', points: [],
  finger_holes: [], interior_rings: [], rotation: 0, depth_override: 14,
}
describe('per-feature depth controls', () => {
  it('shows tool pocket depth in a bounded inspector and updates an override when the bin gets shallower', () => {
    const onDepthChange = vi.fn()
    const props = { tool: selectedTool, binDepth: 20, maxDepth: 14.25, smoothed: false, smoothLevel: 0.5, onDepthChange, onRemove: vi.fn() }
    const { rerender } = render(<BinToolInspector {...props} />)
    const depth = screen.getByLabelText('Tool pocket depth (mm)')
    expect(screen.getByRole('complementary', { name: 'Tool settings' })).toBeTruthy()
    expect(depth.getAttribute('value')).toBe('14')
    fireEvent.change(depth, { target: { value: '7' } })
    fireEvent.blur(depth)
    expect(onDepthChange).toHaveBeenCalledWith(7)
    rerender(<BinToolInspector {...props} maxDepth={0.25} />)
    expect(depth.getAttribute('value')).toBe('0.25')
  })

  it('shows the tool depth as a cutout’s inherited depth and permits an override', () => {
    const onDepthChange = vi.fn()
    render(<BinCutoutInspector hole={{ id: 'hole', x: 1, y: 1, radius: 2, shape: 'cylinder' }}
      tool={{ ...selectedTool, depth_override: 6 }} binDepth={20} maxDepth={7.25}
      onUpdate={vi.fn()} onDepthChange={onDepthChange} onRemove={vi.fn()} />)
    const depth = screen.getByDisplayValue('6')
    fireEvent.change(depth, { target: { value: '8' } })
    fireEvent.blur(depth)
    expect(onDepthChange).toHaveBeenCalledWith(7.25)
  })

  it('edits rectangle width and height without an inert radius control', () => {
    const onUpdate = vi.fn()
    render(<BinCutoutInspector hole={{ id: 'hole', x: 1, y: 1, radius: 15, width: 30, height: 10, shape: 'rectangle' }}
      tool={selectedTool} binDepth={20} maxDepth={21.25}
      onUpdate={onUpdate} onDepthChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByLabelText(/Diameter|Radius/)).toBeNull()
    fireEvent.change(screen.getByLabelText(/Width \(mm\)/i), { target: { value: '42' } })
    fireEvent.blur(screen.getByLabelText(/Width \(mm\)/i))
    expect(onUpdate).toHaveBeenCalledWith({ width: 42 })
  })

  it('shows the effective depth and equivalent rotation without changing them on blur', () => {
    const onUpdate = vi.fn()
    const onDepthChange = vi.fn()
    render(<BinCutoutInspector hole={{ id: 'hole', x: 1, y: 1, radius: 15, width: 30, height: 10, shape: 'rectangle', rotation: 270, depth_override: 30 }}
      tool={selectedTool} binDepth={20} maxDepth={21.25}
      onUpdate={onUpdate} onDepthChange={onDepthChange} onRemove={vi.fn()} />)
    expect(screen.getByLabelText('Rotation (°)').getAttribute('value')).toBe('-90')
    expect(screen.getByLabelText('Depth (mm)').getAttribute('value')).toBe('21.25')
    fireEvent.blur(screen.getByLabelText('Rotation (°)'))
    fireEvent.blur(screen.getByLabelText('Depth (mm)'))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onDepthChange).not.toHaveBeenCalled()
  })
})
