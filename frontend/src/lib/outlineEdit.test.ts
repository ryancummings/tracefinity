import { describe, it, expect } from 'vitest'
import type { Polygon } from '@/types'
import { straightenClick, straightenOtherSide } from './outlineEdit'
import { STALE_TRACE_MESSAGE, applyMergeResult, createTraceGeneration, applySplitResults, keepCurrentLabels, labelAnchor, nextToolNumber, pointInRing, snapAngle, straighten, straightenRemoval } from './outlineEdit'

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

describe('straighten', () => {
  it('replaces the shorter path between two corners with one straight edge', () => {
    expect(straighten(wobblyBar, 0, 4)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 0, y: 40 },
    ])
  })

  it('picks the same path whichever corner is clicked first', () => {
    expect(straightenRemoval(wobblyBar, 4, 0)).toEqual([1, 2, 3])
  })

  it('takes the long way round on request', () => {
    expect(straightenRemoval(wobblyBar, 0, 4, true)).toEqual([5, 6])
  })

  it('refuses to collapse the outline below a triangle', () => {
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }]
    expect(straightenRemoval(tri, 0, 2)).toEqual([])
    expect(straightenRemoval(tri, 1, 1)).toEqual([])
  })
})

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

describe('straighten clicks', () => {
  it('straightens on the second click and starts afresh on the third', () => {
    let step = straightenClick(null, 'bar', wobblyBar, 0)
    expect(step.points).toBeUndefined()
    step = straightenClick(step.state, 'bar', wobblyBar, 4)
    expect(step.points).toHaveLength(4)
    // the next click begins a new pair instead of straightening from corner 4
    const next = straightenClick(step.state, 'bar', step.points!, 2)
    expect(next.points).toBeUndefined()
    expect(next.state).toEqual({ kind: 'picking', polyId: 'bar', start: 2 })
  })

  it('swaps to the other side of the original outline', () => {
    const first = straightenClick(straightenClick(null, 'bar', wobblyBar, 0).state, 'bar', wobblyBar, 4)
    const other = straightenOtherSide(first.state, first.points)
    // keeps the wobbly top edge, straightens the long way round instead
    expect(other.points).toEqual(wobblyBar.slice(0, 5))
    // and back again
    expect(straightenOtherSide(other.state, other.points).points).toEqual(first.points)
  })

  it('will not swap once the outline has been edited', () => {
    const first = straightenClick(straightenClick(null, 'bar', wobblyBar, 0).state, 'bar', wobblyBar, 4)
    const edited = first.points!.map(p => ({ ...p }))
    expect(straightenOtherSide(first.state, edited)).toEqual({ state: null })
  })

  it('ignores neighbouring corners that are already straight', () => {
    const picking = straightenClick(null, 'bar', wobblyBar, 5).state
    expect(straightenClick(picking, 'bar', wobblyBar, 6)).toEqual({ state: null })
  })
})
