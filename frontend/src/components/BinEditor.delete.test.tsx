// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BinEditor } from './BinEditor'

afterEach(cleanup)

describe('BinEditor Delete shortcut', () => {
  it('removes the selected tool using the same action as the Remove button', () => {
    const onPlacedToolsChange = vi.fn()
    const { container } = render(
      <BinEditor
        placedTools={[{
          id: 'placed', tool_id: 'square', name: 'Square',
          points: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }],
          finger_holes: [], interior_rings: [], rotation: 0,
        }]}
        onPlacedToolsChange={onPlacedToolsChange}
        textLabels={[]}
        onTextLabelsChange={vi.fn()}
        gridX={2} gridY={2}
        partialBins={false} partialBinsValues={[]}
        wallThickness={1.2} defaultCutoutDepth={10} maxCutoutDepth={10}
      />
    )
    const tool = container.querySelector('path.cursor-move')
    expect(tool).not.toBeNull()
    fireEvent.mouseDown(tool!)
    fireEvent.mouseUp(window)
    expect(screen.getByRole('button', { name: /remove/i })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Delete' })
    expect(onPlacedToolsChange).toHaveBeenCalledWith([])
  })
})
