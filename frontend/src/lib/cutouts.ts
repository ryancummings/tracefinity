import type { CutoutShape, FingerHole, Point } from '@/types'
import { pointInRing } from '@/lib/outlineEdit'

// floor for cutout dimensions in mm; keeps geometry non-degenerate and
// shapes grabbable in the editor while allowing narrow slots (issue #114)
export const MIN_CUTOUT_SIZE_MM = 1

const CUTOUT_SHAPE_LABELS: Record<CutoutShape, string> = {
  circle: 'circle',
  cylinder: 'cylinder',
  scoop: 'finger scoop',
  square: 'square',
  rectangle: 'rectangle',
  filleted_rectangle: 'filleted rectangle',
}

export function isRectangularCutout(shape?: CutoutShape): boolean {
  return shape === 'rectangle' || shape === 'filleted_rectangle'
}

export function isFilletedRectangleCutout(shape?: CutoutShape): boolean {
  return shape === 'filleted_rectangle'
}

export function filletedRectangleRadius(width: number, cutoutDepth: number): number {
  return Math.max(0, Math.min(width / 3, cutoutDepth / 2))
}

export function scoopFloorRadius(radius: number, depth: number): number {
  return radius - Math.min(radius * 0.3, depth * 0.45)
}

export function cutoutShapeLabel(shape?: CutoutShape): string {
  return shape ? CUTOUT_SHAPE_LABELS[shape] : CUTOUT_SHAPE_LABELS.circle
}

// pinned-corner resize: dragged corner follows the mouse, dims measured in
// the rectangle's local (rotated) space and floored at MIN_CUTOUT_SIZE_MM.
// centre is always the anchor-mouse midpoint, so when the floor clamps the
// anchored corner drifts slightly rather than staying fixed
export function resizeRectCutout(
  anchorX: number,
  anchorY: number,
  mouseX: number,
  mouseY: number,
  rotationDeg: number,
): { x: number; y: number; width: number; height: number } {
  const rot = rotationDeg * Math.PI / 180
  const cosR = Math.cos(rot)
  const sinR = Math.sin(rot)
  const gdx = mouseX - anchorX
  const gdy = mouseY - anchorY
  const localW = gdx * cosR + gdy * sinR
  const localH = -gdx * sinR + gdy * cosR
  return {
    x: (anchorX + mouseX) / 2,
    y: (anchorY + mouseY) / 2,
    width: Math.max(MIN_CUTOUT_SIZE_MM, Math.abs(localW)),
    height: Math.max(MIN_CUTOUT_SIZE_MM, Math.abs(localH)),
  }
}

// circle/square resize: radius is the centre-to-mouse distance, floored at
// half MIN_CUTOUT_SIZE_MM (1mm diameter / side)
export function resizeRoundCutout(
  centerX: number,
  centerY: number,
  mouseX: number,
  mouseY: number,
): number {
  const dx = mouseX - centerX
  const dy = mouseY - centerY
  return Math.max(MIN_CUTOUT_SIZE_MM / 2, Math.sqrt(dx * dx + dy * dy))
}

// points around a cutout's opening, in the cutout's own coordinate space
export function cutoutFootprint(hole: FingerHole, samplesPerSide = 6): Point[] {
  const shape = hole.shape ?? 'circle'
  if (shape === 'square' || isRectangularCutout(shape)) {
    const hw = (isRectangularCutout(shape) && hole.width ? hole.width : hole.radius * 2) / 2
    const hh = (isRectangularCutout(shape) && hole.height ? hole.height : hole.radius * 2) / 2
    const rot = (hole.rotation ?? 0) * Math.PI / 180
    const cos = Math.cos(rot), sin = Math.sin(rot)
    const corners = [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }]
    return corners.flatMap((a, i) => {
      const b = corners[(i + 1) % 4]
      return Array.from({ length: samplesPerSide }, (_, k) => {
        const t = k / samplesPerSide
        const lx = a.x + (b.x - a.x) * t, ly = a.y + (b.y - a.y) * t
        return { x: hole.x + lx * cos - ly * sin, y: hole.y + lx * sin + ly * cos }
      })
    })
  }
  const n = samplesPerSide * 4
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * 2 * Math.PI
    return { x: hole.x + hole.radius * Math.cos(a), y: hole.y + hole.radius * Math.sin(a) }
  })
}

// whether a cutout's opening reaches into a tool's pocket; the tool's
// interior rings are islands of material, not pocket
export function cutoutOverlapsOutline(hole: FingerHole, points: Point[], interiorRings: Point[][] = []): boolean {
  if (points.length < 3) return false
  const inPocket = (p: Point) => pointInRing(p, points) && !interiorRings.some(ring => pointInRing(p, ring))
  const footprint = cutoutFootprint(hole)
  if (inPocket({ x: hole.x, y: hole.y }) || footprint.some(inPocket)) return true
  // a cutout can be wide enough to swallow a thin part of the outline whole
  return points.some(p => pointInRing(p, footprint))
}
