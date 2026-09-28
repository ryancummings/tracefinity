// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BinEditorToolbar } from './BinEditorToolbar'
import { BinCutoutInspector } from './BinCutoutInspector'

afterEach(cleanup)

const selectedTool = {
  id: 'placed', tool_id: 'square', name: 'Square', points: [],
  finger_holes: [], interior_rings: [], rotation: 0, depth_override: 14,
}
const props = {
  activeTool: 'select' as const, setActiveTool: vi.fn(), snapEnabled: false,
  onStartCutout: vi.fn(),
  setSnapEnabled: vi.fn(), snapGrid: 1, setSnapGrid: vi.fn(), handleRecenter: vi.fn(),
  selectedTool, selectedLabel: null,
  onRemoveTool: vi.fn(), onRemoveLabel: vi.fn(), onUpdateLabel: vi.fn(),
  defaultCutoutDepth: 20, maxCutoutDepth: 14.25,
  onSetCutoutDepthOverride: vi.fn(),
  cutoutShape: 'scoop' as const, onCutoutShapeChange: vi.fn(),
}

describe('per-feature depth controls', () => {
  it('updates an existing override when the bin gets shallower', () => {
    const onSetCutoutDepthOverride = vi.fn()
    const { rerender } = render(<BinEditorToolbar {...props} onSetCutoutDepthOverride={onSetCutoutDepthOverride} />)
    const depth = screen.getByPlaceholderText('14.25')
    expect(depth.getAttribute('value')).toBe('14')
    rerender(<BinEditorToolbar {...props} maxCutoutDepth={0.25} onSetCutoutDepthOverride={onSetCutoutDepthOverride} />)
    expect(depth.getAttribute('value')).toBe('0.25')
    fireEvent.change(depth, { target: { value: '7' } })
    fireEvent.blur(depth)
    expect(onSetCutoutDepthOverride).toHaveBeenCalledWith('placed', 0.25)
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
