// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BinEditor } from './BinEditor'
import { SNAP_GRID } from '@/lib/constants'

const baseProps = {
  placedTools: [],
  onPlacedToolsChange: () => {},
  textLabels: [],
  onTextLabelsChange: () => {},
  gridX: 2,
  gridY: 2,
  partialBins: false,
  partialBinsValues: [false, false],
  wallThickness: 1.6,
  defaultCutoutDepth: 10,
  maxCutoutDepth: 20,
}

describe('BinEditor snap to grid', () => {
  afterEach(cleanup)

  it('defaults to off', () => {
    render(<BinEditor {...baseProps} />)

    expect(screen.getByTitle(`Snap to ${SNAP_GRID}mm grid (off)`)).toBeTruthy()
  })

  it('can be toggled on', () => {
    render(<BinEditor {...baseProps} />)

    fireEvent.click(screen.getByTitle(`Snap to ${SNAP_GRID}mm grid (off)`))

    expect(screen.getByTitle(`Snap to ${SNAP_GRID}mm grid (on)`)).toBeTruthy()
  })
})

describe('bin cutouts', () => {
  afterEach(cleanup)

  it('opens visible tool settings when an outline is selected', () => {
    const tool = {
      id: 'placed', tool_id: 'source', name: 'Wrench', rotation: 0,
      points: [{ x: 15, y: 15 }, { x: 35, y: 15 }, { x: 35, y: 35 }, { x: 15, y: 35 }],
      finger_holes: [], interior_rings: [],
    }
    render(<BinEditor {...baseProps} placedTools={[tool]} />)
    const canvas = screen.getByTestId('bin-canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 742, height: 702 } as DOMRect)
    fireEvent.mouseDown(canvas.querySelector('path')!, { clientX: 210, clientY: 210 })
    fireEvent.mouseUp(window)
    fireEvent.click(canvas.querySelector('path')!, { clientX: 210, clientY: 210 })
    expect(screen.getByRole('complementary', { name: 'Tool settings' })).toBeTruthy()
    expect(screen.getByLabelText('Tool pocket depth (mm)').getAttribute('value')).toBe('10')
  })

  it('chooses an owner explicitly, then places a saved-size scoop beside its outline', () => {
    localStorage.setItem('tracefinity-settings', JSON.stringify({ cutoutDefaults: { scoop: { radius: 7 } } }))
    const onPlacedToolsChange = vi.fn()
    const tool = {
      id: 'placed', tool_id: 'source', name: 'Tool', rotation: 0,
      points: [{ x: 15, y: 15 }, { x: 35, y: 15 }, { x: 35, y: 35 }, { x: 15, y: 35 }],
      finger_holes: [], interior_rings: [],
    }
    render(<BinEditor {...baseProps} placedTools={[tool]} onPlacedToolsChange={onPlacedToolsChange} />)
    const canvas = screen.getByTestId('bin-canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 742, height: 702 } as DOMRect)
    fireEvent.click(screen.getByTitle('Add cutout to a tool'))
    expect(screen.getByText(/Click a tool to choose/)).toBeTruthy()
    const outline = canvas.querySelector('path')!
    fireEvent.mouseDown(outline, { clientX: 210, clientY: 210 })
    fireEvent.mouseUp(outline, { clientX: 210, clientY: 210 })
    fireEvent.click(outline, { clientX: 210, clientY: 210 })
    expect(screen.getByRole('status').textContent).toMatch(/Placing finger scoop for Tool/)
    expect(onPlacedToolsChange).not.toHaveBeenCalled()
    fireEvent.click(canvas, { clientX: 370, clientY: 210 })
    expect(onPlacedToolsChange).toHaveBeenCalledWith([
      expect.objectContaining({ finger_holes: [expect.objectContaining({ radius: 7, shape: 'scoop', x: 45, y: 25, bin_override: true })] }),
    ])
    localStorage.removeItem('tracefinity-settings')
  })

  it('places a cutout without crypto.randomUUID, as over plain HTTP', () => {
    vi.stubGlobal('crypto', {})
    const onPlacedToolsChange = vi.fn()
    const tool = {
      id: 'placed', tool_id: 'source', name: 'Tool', rotation: 0,
      points: [{ x: 15, y: 15 }, { x: 35, y: 15 }, { x: 35, y: 35 }, { x: 15, y: 35 }],
      finger_holes: [], interior_rings: [],
    }
    render(<BinEditor {...baseProps} placedTools={[tool]} onPlacedToolsChange={onPlacedToolsChange} />)
    const canvas = screen.getByTestId('bin-canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 742, height: 702 } as DOMRect)
    fireEvent.click(screen.getByTitle('Add cutout to a tool'))
    fireEvent.click(canvas.querySelector('path')!, { clientX: 210, clientY: 210 })
    fireEvent.click(canvas, { clientX: 370, clientY: 210 })
    expect(onPlacedToolsChange).toHaveBeenCalledWith([
      expect.objectContaining({ finger_holes: [expect.objectContaining({ id: expect.stringMatching(/^bin-fh-/), x: 45, y: 25 })] }),
    ])
    vi.unstubAllGlobals()
  })

  it('edits the selected cutout diameter and keeps ownership visible', () => {
    const tool = {
      id: 'placed', tool_id: 'source', name: 'Wrench', rotation: 0,
      points: [{ x: 15, y: 15 }, { x: 35, y: 15 }, { x: 35, y: 35 }, { x: 15, y: 35 }],
      finger_holes: [{ id: 'hole', x: 40, y: 25, radius: 5, shape: 'scoop' as const }], interior_rings: [],
    }
    const updated = vi.fn()
    function Harness() {
      const [tools, setTools] = useState([tool])
      return <BinEditor {...baseProps} placedTools={tools} onPlacedToolsChange={next => { updated(next); setTools(next as typeof tools) }} />
    }
    render(<Harness />)
    const canvas = screen.getByTestId('bin-canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 742, height: 702 } as DOMRect)
    const cutout = canvas.querySelector('circle')!
    fireEvent.mouseDown(cutout, { clientX: 330, clientY: 210 })
    fireEvent.mouseUp(cutout)
    fireEvent.click(cutout, { clientX: 330, clientY: 210 })
    expect(screen.getByText('Cutout for Wrench')).toBeTruthy()
    const diameter = screen.getByLabelText('Diameter (mm)')
    fireEvent.change(diameter, { target: { value: '18' } })
    fireEvent.blur(diameter)
    expect(updated).toHaveBeenCalledWith([expect.objectContaining({ finger_holes: [expect.objectContaining({ radius: 9, bin_override: true })] })])
  })
})
