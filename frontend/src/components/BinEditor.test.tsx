// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('places a saved-size scoop on a placed tool', () => {
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
    fireEvent.click(screen.getByTitle('Place cutout on a tool'))
    fireEvent.click(canvas, { clientX: 210, clientY: 210 })
    expect(onPlacedToolsChange).toHaveBeenCalledWith([
      expect.objectContaining({ finger_holes: [expect.objectContaining({ radius: 7, shape: 'scoop', x: 25, y: 25, bin_override: true })] }),
    ])
    localStorage.removeItem('tracefinity-settings')
  })
})
