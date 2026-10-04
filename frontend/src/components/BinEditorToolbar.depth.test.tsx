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
    expect(screen.getByText('Maximum for this bin: 14.25 mm')).toBeTruthy()
    fireEvent.change(depth, { target: { value: '7' } })
    fireEvent.blur(depth)
    expect(onDepthChange).toHaveBeenCalledWith(7)
    rerender(<BinToolInspector {...props} maxDepth={0.25} />)
    expect(depth.getAttribute('value')).toBe('0.25')
    expect(screen.getByText('Maximum for this bin: 0.25 mm')).toBeTruthy()
  })

  it('shows the tool depth as a cutout’s inherited depth and permits an override', () => {
    const onDepthChange = vi.fn()
    render(<BinCutoutInspector hole={{ id: 'hole', x: 1, y: 1, radius: 2, shape: 'cylinder' }}
      tool={{ ...selectedTool, depth_override: 6 }} placedTools={[]} binDepth={20} maxDepth={7.25}
      onUpdate={vi.fn()} onDepthChange={onDepthChange} onRemove={vi.fn()} />)
    const depth = screen.getByDisplayValue('6')
    fireEvent.change(depth, { target: { value: '8' } })
    fireEvent.blur(depth)
    expect(onDepthChange).toHaveBeenCalledWith(7.25)
  })

  it('edits rectangle width and height without an inert radius control', () => {
    const onUpdate = vi.fn()
    render(<BinCutoutInspector hole={{ id: 'hole', x: 1, y: 1, radius: 15, width: 30, height: 10, shape: 'rectangle' }}
      tool={selectedTool} placedTools={[]} binDepth={20} maxDepth={21.25}
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
      tool={selectedTool} placedTools={[]} binDepth={20} maxDepth={21.25}
      onUpdate={onUpdate} onDepthChange={onDepthChange} onRemove={vi.fn()} />)
    expect(screen.getByLabelText('Rotation (°)').getAttribute('value')).toBe('-90')
    expect(screen.getByLabelText('Depth (mm)').getAttribute('value')).toBe('21.25')
    fireEvent.blur(screen.getByLabelText('Rotation (°)'))
    fireEvent.blur(screen.getByLabelText('Depth (mm)'))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onDepthChange).not.toHaveBeenCalled()
  })
})

describe('depth shortcuts', () => {
  const square = (id: string, name: string, x0: number, depth_override?: number) => ({
    id, tool_id: id, name, rotation: 0, finger_holes: [], interior_rings: [],
    points: [{ x: x0, y: 0 }, { x: x0 + 20, y: 0 }, { x: x0 + 20, y: 20 }, { x: x0, y: 20 }],
    ...(depth_override === undefined ? {} : { depth_override }),
  })

  it('sets a tool pocket to the deepest the bin allows', () => {
    const onDepthChange = vi.fn()
    const props = { tool: selectedTool, binDepth: 20, maxDepth: 21.25, smoothed: false, smoothLevel: 0.5, onDepthChange, onRemove: vi.fn() }
    const { rerender } = render(<BinToolInspector {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Max' }))
    expect(onDepthChange).toHaveBeenCalledWith(21.25)
    rerender(<BinToolInspector {...props} tool={{ ...selectedTool, depth_override: 21.25 }} />)
    expect(screen.getByRole('button', { name: 'Max' }).hasAttribute('disabled')).toBe(true)
  })

  it('copies the depth of another tool pocket the cutout reaches into', () => {
    const onDepthChange = vi.fn()
    const owner = square('a', 'Pliers', 0)
    const neighbour = square('b', 'Driver', 30, 12)
    const far = square('c', 'Hammer', 100, 8)
    // a 10mm scoop centred in the gap between the two tools reaches into the neighbour only
    render(<BinCutoutInspector hole={{ id: 'h', x: 26, y: 10, radius: 5, shape: 'scoop' }}
      tool={owner} placedTools={[owner, neighbour, far]} binDepth={20} maxDepth={21.25}
      onUpdate={vi.fn()} onDepthChange={onDepthChange} onRemove={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Pliers/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Hammer/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Match Driver pocket (12.00 mm)' }))
    expect(onDepthChange).toHaveBeenCalledWith(12)
  })

  it('matches its own tool by inheriting, so the cutout follows later changes to that pocket', () => {
    const onDepthChange = vi.fn()
    const owner = square('a', 'Pliers', 0, 9)
    const { rerender } = render(<BinCutoutInspector hole={{ id: 'h', x: 10, y: 10, radius: 4, shape: 'circle', depth_override: 15 }}
      tool={owner} placedTools={[owner]} binDepth={20} maxDepth={21.25}
      onUpdate={vi.fn()} onDepthChange={onDepthChange} onRemove={vi.fn()} />)
    // one way to inherit, not two
    expect(screen.queryByRole('button', { name: /Use inherited depth/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Match Pliers pocket (9.00 mm)' }))
    expect(onDepthChange).toHaveBeenCalledWith(null)
    rerender(<BinCutoutInspector hole={{ id: 'h', x: 10, y: 10, radius: 4, shape: 'circle' }}
      tool={owner} placedTools={[owner]} binDepth={20} maxDepth={21.25}
      onUpdate={vi.fn()} onDepthChange={onDepthChange} onRemove={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Matches Pliers pocket (9.00 mm)' }).hasAttribute('disabled')).toBe(true)
  })
})
