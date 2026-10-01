import { describe, it, expect } from 'vitest'
import type { Polygon } from '@/types'
import { STALE_TRACE_MESSAGE, applyMergeResult, applySplitResults, createTraceGeneration, erasePoints, keepCurrentLabels, labelAnchor, nextToolNumber, pointInRing, snapAngle } from './outlineEdit'

// a 100x40 bar whose top edge was traced wobbly: 0 and 4 are its corners
const wobblyBar = [
  { x: 0, y: 0 },
  { x: 25, y: 2 },
  { x: 50, y: -1 },
  { x: 75, y: 1 },
  { x: 100, y: 0 },
  { x: 100, y: 40 },
  { x: 0, y: 40 },
]

describe('labelAnchor', () => {
  it('lands inside an L-shaped outline whose centroid does not', () => {
    const ell = [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 80 },
      { x: 100, y: 80 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ]
    const centroid = { x: 40, y: 60 }
    expect(pointInRing(centroid, ell)).toBe(false)
    expect(pointInRing(labelAnchor(ell), ell)).toBe(true)
  })

  it('stays inside a U too thin for any grid sample', () => {
    const u = [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 98 }, { x: 98, y: 98 },
      { x: 98, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ]
    expect(pointInRing(labelAnchor(u), u)).toBe(true)
  })

  it('avoids a hole in the middle', () => {
    const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    const hole = [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }]
    expect(pointInRing(labelAnchor(square, [hole]), hole)).toBe(false)
  })
})

describe('snapAngle', () => {
  it('snaps a near-horizontal segment flat and keeps its length', () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 100, y: 6 })
    expect(p.y).toBeCloseTo(0)
    expect(p.x).toBeCloseTo(Math.hypot(100, 6))
  })

  it('snaps to the diagonal', () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 50, y: 45 })
    expect(p.x).toBeCloseTo(p.y)
  })
})

describe('nextToolNumber', () => {
  it('continues after the highest fallback name', () => {
    expect(nextToolNumber(['tool 1', 'pliers', 'Tool 7'])).toBe(8)
  })

  it('counts named tools so numbers do not repeat', () => {
    expect(nextToolNumber(['pliers', 'wrench'])).toBe(3)
  })
})

describe('keepCurrentLabels', () => {
  it('keeps names given since the snapshot and restores removed tools as they were', () => {
    const restored = [{ id: 'a', label: 'tool 1' }, { id: 'b', label: 'tool 2' }]
    const current = [{ id: 'a', label: 'pliers' }]
    expect(keepCurrentLabels(restored, current)).toEqual([
      { id: 'a', label: 'pliers' },
      { id: 'b', label: 'tool 2' },
    ])
  })
})

function outline(id: string, label = id): Polygon {
  return { id, label, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], finger_holes: [], interior_rings: [] }
}

describe('applying async outline results', () => {
  it('splits an unchanged outline and keeps a name given meanwhile', () => {
    const a = outline('a'), b = outline('b')
    const renamed = { ...a, label: 'pliers' }
    const pieces = [outline('a', 'tool 1'), outline('c', 'tool 3')]
    const { polygons, applied } = applySplitResults([renamed, b], [a], new Map([['a', pieces]]))
    expect(applied).toEqual(['a'])
    expect(polygons.map(p => `${p.id}:${p.label}`)).toEqual(['a:pliers', 'c:tool 3', 'b:b'])
  })

  it('leaves an outline alone if its shape was edited during the split', () => {
    const a = outline('a')
    const moved = { ...a, points: [{ x: 5, y: 5 }, ...a.points.slice(1)] }
    const { polygons, applied } = applySplitResults([moved], [a], new Map([['a', [outline('a'), outline('c')]]]))
    expect(applied).toEqual([])
    expect(polygons).toEqual([moved])
  })

  it('merges unchanged outlines into the source', () => {
    const a = outline('a', 'saw'), b = outline('b')
    const merged = { ...outline('a', 'tool 1'), points: [{ x: 9, y: 9 }, { x: 10, y: 9 }, { x: 9, y: 10 }] }
    expect(applyMergeResult([a, b], a, b, merged)).toEqual([{ ...merged, label: 'saw' }])
  })

  it('drops a merge when either outline was edited or removed meanwhile', () => {
    const a = outline('a'), b = outline('b')
    const moved = { ...b, points: [...b.points] }
    expect(applyMergeResult([a, moved], a, b, outline('a'))).toBeNull()
    expect(applyMergeResult([a], a, b, outline('a'))).toBeNull()
  })
})

describe('createTraceGeneration', () => {
  it('passes a box trace through when nothing re-traced meanwhile', async () => {
    const gen = createTraceGeneration()
    await expect(gen.guard(async () => 'outline')).resolves.toBe('outline')
  })

  it('rejects a box trace that finishes after a whole-photo re-trace', async () => {
    const gen = createTraceGeneration()
    let finish: (v: string) => void = () => {}
    const pending = gen.guard(() => new Promise<string>(resolve => { finish = resolve }))
    gen.bump()
    finish('outline')
    await expect(pending).rejects.toThrow(STALE_TRACE_MESSAGE)
  })
})

describe('erasePoints', () => {
  const bar: Polygon = { id: 'bar', label: 'bar', points: wobblyBar, finger_holes: [], interior_rings: [] }

  it('erases the wobble along an edge so the corners join straight', () => {
    // brush swept along the top edge, clear of the corners
    const [after] = erasePoints([bar], { x: 20, y: 0 }, { x: 80, y: 0 }, 6)
    expect(after.points).toEqual([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 0, y: 40 },
    ])
  })

  it('catches points between two brush samples on a fast drag', () => {
    const [after] = erasePoints([bar], { x: 10, y: 1 }, { x: 90, y: 1 }, 3)
    expect(after.points).toHaveLength(4)
  })

  it('leaves untouched outlines and the list itself alone', () => {
    const other: Polygon = { ...bar, id: 'other' }
    const list = [bar, other]
    expect(erasePoints(list, { x: 500, y: 500 }, { x: 500, y: 500 }, 10)).toBe(list)
    const next = erasePoints(list, { x: 50, y: -1 }, { x: 50, y: -1 }, 3)
    expect(next).not.toBe(list)
    expect(next[0].points).not.toContainEqual({ x: 50, y: -1 })
  })

  it('never cuts an outline below three points', () => {
    const [after] = erasePoints([bar], { x: 0, y: 20 }, { x: 100, y: 20 }, 100)
    expect(after).toBe(bar)
  })

  it('removes a hole the brush wipes out', () => {
    const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    const hole = [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }]
    const withHole: Polygon = { ...bar, points: square, interior_rings: [hole] }
    const [after] = erasePoints([withHole], { x: 50, y: 50 }, { x: 50, y: 50 }, 20)
    expect(after.interior_rings).toEqual([])
    expect(after.points).toBe(square)
  })
})
