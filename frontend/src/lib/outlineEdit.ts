import type { Point, Polygon } from '@/types'

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

// indices strictly between from and to walking forward around a closed ring
function forwardBetween(n: number, from: number, to: number): number[] {
  const out: number[] = []
  for (let i = (from + 1) % n; i !== to; i = (i + 1) % n) out.push(i)
  return out
}

function arcLength(points: Point[], from: number, to: number): number {
  const n = points.length
  let len = 0
  for (let i = from; i !== to; i = (i + 1) % n) len += dist(points[i], points[(i + 1) % n])
  return len
}

/**
 * Vertices that straightening between a and b would remove. The ring has two
 * paths between them; the shorter one (by length) is replaced by a straight
 * edge, or the longer one when `longWay` is set. Never removes so much that
 * fewer than three vertices remain.
 */
export function straightenRemoval(points: Point[], a: number, b: number, longWay = false): number[] {
  const n = points.length
  if (a === b || a < 0 || b < 0 || a >= n || b >= n) return []
  const forwardIsShorter = arcLength(points, a, b) <= arcLength(points, b, a)
  const removed = forwardIsShorter !== longWay ? forwardBetween(n, a, b) : forwardBetween(n, b, a)
  return n - removed.length >= 3 ? removed : []
}

export function straighten(points: Point[], a: number, b: number, longWay = false): Point[] {
  const removed = new Set(straightenRemoval(points, a, b, longWay))
  return points.filter((_, i) => !removed.has(i))
}

export function pointInRing(p: Point, ring: Point[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function distToRings(p: Point, rings: Point[][]): number {
  let best = Infinity
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      best = Math.min(best, distToSegment(p, ring[i], ring[(i + 1) % ring.length]))
    }
  }
  return best
}

/**
 * Midpoint of the widest inside span on a few horizontal lines. Always
 * inside, so it backs up the grid search for outlines too thin for any
 * grid sample to land in.
 */
function scanlineInterior(rings: Point[][], minY: number, maxY: number, lines: number): Point | null {
  let best: Point | null = null
  let bestWidth = 0
  for (let k = 0; k < lines; k++) {
    const y = minY + ((k + 0.5) / lines) * (maxY - minY)
    const xs: number[] = []
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length]
        if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
    }
    xs.sort((p, q) => p - q)
    // even-odd: pairs of crossings bound the inside spans
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > bestWidth) {
        bestWidth = xs[i + 1] - xs[i]
        best = { x: (xs[i] + xs[i + 1]) / 2, y }
      }
    }
  }
  return best
}

/**
 * A point well inside the outline for placing its name: the grid sample
 * furthest from any edge. The centroid can fall outside a C- or L-shaped
 * tool, which would put the name over empty paper.
 */
export function labelAnchor(points: Point[], holes: Point[][] = [], samples = 14): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const rings = [points, ...holes]
  let best: Point = scanlineInterior(rings, minY, maxY, samples) ?? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  let bestDist = -1
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const p = {
        x: minX + ((i + 0.5) / samples) * (maxX - minX),
        y: minY + ((j + 0.5) / samples) * (maxY - minY),
      }
      if (!pointInRing(p, points) || holes.some(h => pointInRing(p, h))) continue
      const d = distToRings(p, rings)
      if (d > bestDist) {
        bestDist = d
        best = p
      }
    }
  }
  return best
}

/** Snap b so the segment a-b runs at a multiple of 45 degrees. */
export function snapAngle(a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  return { x: a.x + len * Math.cos(angle), y: a.y + len * Math.sin(angle) }
}

/** Next unused "tool N" number, so new outlines do not repeat a fallback name. */
export function nextToolNumber(labels: string[]): number {
  let max = labels.length
  for (const label of labels) {
    const m = /^tool\s+(\d+)$/i.exec(label.trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

/**
 * Outlines from history with each surviving tool's current name, so undo
 * reverts geometry without reverting a rename made since.
 */
export function keepCurrentLabels<T extends { id: string; label: string }>(restored: T[], current: T[]): T[] {
  const names = new Map(current.map(p => [p.id, p.label]))
  return restored.map(p => (names.has(p.id) ? { ...p, label: names.get(p.id)! } : p))
}

// edits replace these arrays, so identity shows whether the shape changed
function sameShape(before: Polygon, now: Polygon | undefined): now is Polygon {
  return !!now && before.points === now.points && before.interior_rings === now.interior_rings
    && before.finger_holes === now.finger_holes
}

/**
 * Swap in split pieces computed from `sources`. A source edited or removed
 * while the request ran is left alone, so the edit is not lost. The first
 * piece keeps the source's current name in case it was renamed meanwhile.
 */
export function applySplitResults(
  current: Polygon[],
  sources: Polygon[],
  results: Map<string, Polygon[]>,
): { polygons: Polygon[]; applied: string[] } {
  const byId = new Map(current.map(p => [p.id, p]))
  const fresh = new Map<string, Polygon[]>()
  for (const source of sources) {
    const pieces = results.get(source.id)
    const now = byId.get(source.id)
    if (pieces && pieces.length > 1 && sameShape(source, now)) {
      fresh.set(source.id, [{ ...pieces[0], label: now.label }, ...pieces.slice(1)])
    }
  }
  return {
    polygons: current.flatMap(p => fresh.get(p.id) ?? [p]),
    applied: [...fresh.keys()],
  }
}

/**
 * Replace source with the merged outline and drop target, or null when
 * either was edited or removed while the request ran.
 */
export function applyMergeResult(current: Polygon[], source: Polygon, target: Polygon, merged: Polygon): Polygon[] | null {
  const nowSource = current.find(p => p.id === source.id)
  const nowTarget = current.find(p => p.id === target.id)
  if (!sameShape(source, nowSource) || !sameShape(target, nowTarget)) return null
  return current
    .filter(p => p.id !== target.id)
    .map(p => (p.id === source.id ? { ...merged, label: nowSource.label } : p))
}

export const STALE_TRACE_MESSAGE = 'The photo was re-traced meanwhile; box the object again'

/**
 * Counts whole-photo traces. A box trace that finishes after a newer
 * whole-photo trace would add an outline to a set it never belonged to,
 * so guard() rejects it instead.
 */
export function createTraceGeneration() {
  let generation = 0
  return {
    bump() {
      generation += 1
    },
    async guard<T>(run: () => Promise<T>): Promise<T> {
      const started = generation
      const result = await run()
      if (generation !== started) throw new Error(STALE_TRACE_MESSAGE)
      return result
    },
  }
}
