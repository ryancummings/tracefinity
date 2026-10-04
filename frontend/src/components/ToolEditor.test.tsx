// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ToolEditor } from './ToolEditor'

const points = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 20 },
  { x: 0, y: 20 },
]

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  })
})

function renderEditor(outputSmoothed = true) {
  const onSmoothedChange = vi.fn()
  const result = render(
    <ToolEditor
      points={points}
      fingerHoles={[]}
      smoothed={outputSmoothed}
      smoothLevel={0.5}
      onPointsChange={() => {}}
      onFingerHolesChange={() => {}}
      onSmoothedChange={onSmoothedChange}
      onSmoothLevelChange={() => {}}
    />
  )
  return { ...result, onSmoothedChange }
}

describe('ToolEditor outline view', () => {
  afterEach(cleanup)

  it('opens in the accurate editable view without changing the smooth output preference', () => {
    const { container, onSmoothedChange } = renderEditor(true)

    expect(screen.getByRole('button', { name: 'Accurate' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Output: Smooth' }).getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelectorAll('circle.cursor-move')).toHaveLength(points.length)
    expect(onSmoothedChange).not.toHaveBeenCalled()
  })

  it('previews smoothing independently from the saved output preference', () => {
    const { container, onSmoothedChange } = renderEditor(false)

    fireEvent.click(screen.getByRole('button', { name: 'Smooth' }))

    expect(screen.getByRole('button', { name: 'Smooth' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Output: Accurate' }).getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelectorAll('circle.cursor-move')).toHaveLength(0)
    expect(onSmoothedChange).not.toHaveBeenCalled()
  })

  it('changes the saved output preference only through the output control', () => {
    const { onSmoothedChange } = renderEditor(true)

    fireEvent.click(screen.getByRole('button', { name: 'Output: Smooth' }))

    expect(onSmoothedChange).toHaveBeenCalledWith(false)
  })

  it('uses Delete to remove a selected finger hole', () => {
    const onFingerHolesChange = vi.fn()
    const { container } = render(
      <ToolEditor
        points={points}
        fingerHoles={[{ id: 'hole', x: 10, y: 10, radius: 2 }]}
        smoothed={false} smoothLevel={0.5}
        onPointsChange={vi.fn()} onFingerHolesChange={onFingerHolesChange}
        onSmoothedChange={vi.fn()} onSmoothLevelChange={vi.fn()}
      />
    )
    const hole = container.querySelector('circle.cursor-move[cx="80"][cy="80"][r="16"]')
    expect(hole).not.toBeNull()
    fireEvent.mouseDown(hole!)
    fireEvent.mouseUp(window)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Delete' })
    expect(onFingerHolesChange).toHaveBeenCalledWith([])
  })
})

describe('ToolEditor point eraser', () => {
  afterEach(cleanup)

  // a wobbly top edge: the brush along it should leave only the corners
  const wobbly = [
    { x: 0, y: 0 }, { x: 5, y: 0.5 }, { x: 10, y: 0 }, { x: 15, y: 0.5 }, { x: 20, y: 0 },
    { x: 20, y: 20 }, { x: 0, y: 20 },
  ]

  // the view spans -20..40mm at 8 svg units per mm; a 480px canvas maps one
  // pixel to one svg unit, so client = 160 + 8 * mm and the 16px default
  // brush is 2mm
  const at = (x: number, y: number) => ({ clientX: 160 + 8 * x, clientY: 160 + 8 * y, button: 0, isPrimary: true })

  function renderEraser(overrides: Partial<React.ComponentProps<typeof ToolEditor>> = {}) {
    const onPointsChange = vi.fn()
    const onInteriorRingsChange = vi.fn()
    const result = render(
      <ToolEditor
        points={wobbly}
        fingerHoles={[]}
        smoothed={false} smoothLevel={0.5}
        onPointsChange={onPointsChange} onFingerHolesChange={vi.fn()}
        onSmoothedChange={vi.fn()} onSmoothLevelChange={vi.fn()}
        onInteriorRingsChange={onInteriorRingsChange}
        {...overrides}
      />
    )
    const canvas = result.container.querySelector('svg[preserveAspectRatio="xMidYMid meet"]') as SVGSVGElement
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 480, height: 480 } as DOMRect)
    return { ...result, canvas, onPointsChange, onInteriorRingsChange }
  }

  it('erases the points under one drag and records it as a single change', () => {
    const { canvas, onPointsChange } = renderEraser()
    fireEvent.click(screen.getByRole('button', { name: 'Erase' }))

    fireEvent.pointerDown(canvas, at(4, 0))
    fireEvent.pointerMove(window, at(10, 0))
    // the outline previews the stroke without committing it
    expect(onPointsChange).not.toHaveBeenCalled()
    fireEvent.pointerUp(window, at(16, 0))

    expect(onPointsChange).toHaveBeenCalledTimes(1)
    expect(onPointsChange).toHaveBeenCalledWith([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }])
  })

  it('undoes a whole stroke in one step', () => {
    const { canvas, onPointsChange } = renderEraser()
    fireEvent.click(screen.getByRole('button', { name: 'Erase' }))
    fireEvent.pointerDown(canvas, at(4, 0))
    fireEvent.pointerUp(window, at(16, 0))

    fireEvent.click(screen.getByTitle('Undo (Ctrl+Z)'))

    expect(onPointsChange).toHaveBeenLastCalledWith(wobbly)
  })

  it('removes an interior hole the brush wipes out and leaves the outline alone', () => {
    const ring = [{ x: 9, y: 9 }, { x: 11, y: 9 }, { x: 11, y: 11 }, { x: 9, y: 11 }]
    const { canvas, onPointsChange, onInteriorRingsChange } = renderEraser({ interiorRings: [ring] })
    fireEvent.click(screen.getByRole('button', { name: 'Erase' }))
    fireEvent.pointerDown(canvas, at(10, 10))
    fireEvent.pointerUp(window, at(10, 10))

    expect(onInteriorRingsChange).toHaveBeenCalledWith([])
    expect(onPointsChange).not.toHaveBeenCalled()
  })

  it('is unavailable in the smoothed preview, where the drawn points are not the saved ones', () => {
    renderEraser()
    fireEvent.click(screen.getByRole('button', { name: 'Smooth' }))

    expect(screen.getByRole('button', { name: 'Erase' }).hasAttribute('disabled')).toBe(true)
  })

  it('resizes the brush with [ and ]', () => {
    renderEraser()
    fireEvent.click(screen.getByRole('button', { name: 'Erase' }))
    const size = () => Number((screen.getByLabelText('Eraser size') as HTMLInputElement).value)
    const before = size()

    fireEvent.keyDown(window, { key: ']' })
    expect(size()).toBe(before + 4)
    fireEvent.keyDown(window, { key: '[' })
    fireEvent.keyDown(window, { key: '[' })
    expect(size()).toBe(before - 4)
  })
})
