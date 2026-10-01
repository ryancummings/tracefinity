'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { Point, Polygon } from '@/types'
import { Undo2, Redo2, Trash2, Plus, Minus, Move, Slash, ArrowLeftRight, Scissors, Combine, PenTool, SquareDashedMousePointer, Loader2 } from 'lucide-react'
import { polygonPathData } from '@/lib/svg'
import { applyMergeResult, applySplitResults, keepCurrentLabels, nextToolNumber, snapAngle, straightenClick, straightenOtherSide, straightenRemoval } from '@/lib/outlineEdit'
import type { StraightenState } from '@/lib/outlineEdit'
import { OutlineLabels } from '@/components/OutlineLabels'
import { ApiError } from '@/lib/api'
import { useHistory } from '@/hooks/useHistory'
import { useDeleteShortcut } from '@/hooks/useDeleteShortcut'
import { ZOOM_FACTOR } from '@/lib/constants'
import { clampZoom, zoomedViewBox, viewBoxPoint, zoomAtCursor, uiScaleFor } from '@/lib/viewbox'

interface Props {
  imageUrl: string
  polygons: Polygon[]
  onPolygonsChange: (polygons: Polygon[]) => void
  editable?: boolean
  included?: Set<string>
  onIncludedChange?: (ids: Set<string>) => void
  hovered?: string | null
  onHoveredChange?: (id: string | null) => void
  // shows each tool's name on the canvas, renamable in place
  showLabels?: boolean
  // outline operations the host resolves (the trace page calls the backend)
  onSplit?: (polygon: Polygon, cut: Point[], labelStart: number) => Promise<Polygon[]>
  onMerge?: (polygons: Polygon[]) => Promise<Polygon>
  onTraceRegion?: (rect: { x: number; y: number; width: number; height: number }, labelStart: number) => Promise<Polygon>
}
// dark halo painted under outlines so they stay legible over photographs
const HALO_STROKE = 'rgba(2, 6, 23, 0.55)'

type EditMode = 'select' | 'vertex' | 'add-vertex' | 'delete-vertex' | 'straighten' | 'split' | 'merge' | 'draw' | 'box'
// in-progress multi-step input for the outline tools
type Gesture =
  | { kind: 'straighten'; step: NonNullable<StraightenState>; hover: number | null }
  | { kind: 'stroke'; points: Point[] }
  | { kind: 'box'; start: Point; end: Point }
  | { kind: 'draw'; points: Point[]; hover: Point | null }
  | { kind: 'merge'; sourceId: string }
  | null

// modes where an overlay captures pointer input instead of the outlines
const CANVAS_MODES: EditMode[] = ['split', 'draw', 'box']
const VERTEX_MODES: EditMode[] = ['vertex', 'select', 'add-vertex', 'delete-vertex', 'straighten']

const MODE_HINTS: Record<EditMode, string> = {
  select: '',
  vertex: '',
  'add-vertex': 'Click on an edge to add a vertex',
  'delete-vertex': 'Click a vertex to remove it',
  straighten: 'Click the first corner of the edge to straighten',
  split: 'Drag a line across an outline to cut it in two. Hold Shift for a straight cut',
  merge: 'Click the outlines to join, one after another',
  draw: 'Click around the object. Click the first point or press Enter to finish; Shift snaps to 45°',
  box: 'Drag a box around a missed object to trace it',
}

function newPolygonId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `poly-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}
type DragState =
  | { type: 'vertex'; polyId: string; pointIdx: number }
  | { type: 'pan'; startClientX: number; startClientY: number; origPanX: number; origPanY: number; svgScale: number }
  | null

export function PolygonEditor({
  imageUrl,
  polygons,
  onPolygonsChange,
  editable = true,
  included,
  onIncludedChange,
  hovered,
  onHoveredChange,
  showLabels = false,
  onSplit,
  onMerge,
  onTraceRegion,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [fitted, setFitted] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const spaceHeld = useRef(false)
  const didPanRef = useRef(false)
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current = pan }, [pan])
  // fitted is the measured size of the box the viewBox paints into, so one
  // uiScale unit lands as one CSS pixel regardless of image aspect
  const uiScale = uiScaleFor(imageSize.width, fitted.width, zoom)

  // active polygon for vertex editing (internal)
  const [activeId, setActiveId] = useState<string | null>(null)
  // fallback single-select when no inclusion tracking
  const [internalSelected, setInternalSelected] = useState<string | null>(null)

  const hasInclusion = included !== undefined
  const isIncluded = useCallback((id: string) => {
    if (hasInclusion) return included!.has(id)
    return internalSelected === id
  }, [hasInclusion, included, internalSelected])

  const [editMode, setEditMode] = useState<EditMode>('select')
  const [dragging, setDragging] = useState<DragState>(null)
  const [gesture, setGesture] = useState<Gesture>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // undo and redo restore outlines but keep today's names, so renaming in
  // the sidebar or on the canvas is never lost to undoing a later edit
  const { set: pushHistory, replace: replaceHistory, undo: handleUndo, redo: handleRedo, canUndo, canRedo } = useHistory<Polygon[]>(
    polygons,
    restored => onPolygonsChange(keepCurrentLabels(restored, polygonsRef.current))
  )

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.src = imageUrl
    return () => { cancelled = true }
  }, [imageUrl])

  // fit image container to available space while preserving aspect ratio
  useEffect(() => {
    function updateSize() {
      if (!wrapperRef.current || !imageSize.width || !imageSize.height) return
      const availW = wrapperRef.current.clientWidth
      const availH = wrapperRef.current.clientHeight
      const imgAspect = imageSize.width / imageSize.height
      let w = availW
      let h = w / imgAspect
      if (h > availH) {
        h = availH
        w = h * imgAspect
      }
      setFitted({ width: Math.floor(w), height: Math.floor(h) })
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [imageSize])

  // refs for stale closure avoidance during drag
  const polygonsRef = useRef(polygons)
  const onPolygonsChangeRef = useRef(onPolygonsChange)
  useEffect(() => { polygonsRef.current = polygons }, [polygons])
  useEffect(() => { onPolygonsChangeRef.current = onPolygonsChange }, [onPolygonsChange])

  // container is aspect-fitted to the image, so client fractions map straight into the viewBox
  const vb = useMemo(
    () => zoomedViewBox(imageSize.width, imageSize.height, zoom, pan),
    [imageSize, zoom, pan]
  )

  const getScaledPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!containerRef.current) return { x: 0, y: 0 }

      const rect = containerRef.current.getBoundingClientRect()
      const point = viewBoxPoint(vb, (clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height)

      return {
        x: Math.max(0, Math.min(imageSize.width, point.x)),
        y: Math.max(0, Math.min(imageSize.height, point.y)),
      }
    },
    [imageSize, vb]
  )

  // scroll-to-zoom centred on the cursor (needs passive: false for preventDefault)
  useEffect(() => {
    const el = containerRef.current
    if (!el || !imageSize.width) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
      const oldZoom = zoomRef.current
      const newZoom = clampZoom(oldZoom * factor)
      if (newZoom === oldZoom) return
      const rect = el.getBoundingClientRect()
      const fx = (e.clientX - rect.left) / rect.width
      const fy = (e.clientY - rect.top) / rect.height
      setPan(zoomAtCursor(imageSize.width, imageSize.height, oldZoom, newZoom, panRef.current, fx, fy))
      setZoom(newZoom)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [imageSize])

  // space key for pan mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        spaceHeld.current = true
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld.current = false
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const updatePolygons = useCallback((updated: Polygon[]) => {
    pushHistory(updated)
    onPolygonsChange(updated)
  }, [pushHistory, onPolygonsChange])

  // swallow the click that follows a pan release
  const consumeDidPan = () => {
    if (didPanRef.current) {
      didPanRef.current = false
      return true
    }
    return false
  }

  const handlePolygonClick = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    if (consumeDidPan()) return
    if (!editable) return

    if (editMode === 'merge') {
      handleMergeClick(id)
    } else if (editMode !== 'select') {
      // in editing modes, set active for vertex editing
      setActiveId(activeId === id ? null : id)
    } else if (hasInclusion && onIncludedChange) {
      // toggle inclusion
      const next = new Set(included!)
      if (next.has(id)) {
        next.delete(id)
        if (activeId === id) setActiveId(null)
      } else {
        next.add(id)
        setActiveId(id)
      }
      onIncludedChange(next)
    } else {
      // fallback single-select
      const newSel = internalSelected === id ? null : id
      setInternalSelected(newSel)
      setActiveId(newSel)
    }
  }

  const handleEdgeClick = (polyId: string, edgeIdx: number) => (e: React.MouseEvent) => {
    e.stopPropagation()
    if (consumeDidPan()) return
    if (!editable || editMode !== 'add-vertex') return

    const point = getScaledPoint(e.clientX, e.clientY)
    const updated = polygons.map((poly) => {
      if (poly.id !== polyId) return poly
      const points = [...poly.points]
      points.splice(edgeIdx + 1, 0, point)
      return { ...poly, points }
    })
    updatePolygons(updated)
  }

  const handleVertexClick = (polyId: string, pointIdx: number) => (e: React.MouseEvent) => {
    e.stopPropagation()
    if (consumeDidPan()) return
    if (!editable) return

    if (editMode === 'straighten') {
      handleStraightenClick(polyId, pointIdx)
    } else if (editMode === 'delete-vertex') {
      const poly = polygons.find(p => p.id === polyId)
      if (!poly || poly.points.length <= 3) return // need at least 3 points

      const updated = polygons.map((p) => {
        if (p.id !== polyId) return p
        const points = [...p.points]
        points.splice(pointIdx, 1)
        return { ...p, points }
      })
      updatePolygons(updated)
    }
  }

  const handleVertexMouseDown = (polyId: string, pointIdx: number) => (e: React.MouseEvent) => {
    // let pan triggers bubble to the canvas handler
    if (spaceHeld.current || e.button !== 0) return
    e.stopPropagation()
    if (editable && (editMode === 'vertex' || editMode === 'select')) {
      setDragging({ type: 'vertex', polyId, pointIdx })
    }
  }

  const handleVertexTouchStart = (polyId: string, pointIdx: number) => (e: React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (editable && (editMode === 'vertex' || editMode === 'select')) {
      setDragging({ type: 'vertex', polyId, pointIdx })
    }
  }

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) return

      if (dragging.type === 'pan') {
        const dx = (e.clientX - dragging.startClientX) / dragging.svgScale
        const dy = (e.clientY - dragging.startClientY) / dragging.svgScale
        setPan({ x: dragging.origPanX - dx, y: dragging.origPanY - dy })
        didPanRef.current = true
        return
      }

      const point = getScaledPoint(e.clientX, e.clientY)

      if (dragging.type === 'vertex') {
        const updated = polygonsRef.current.map((poly) => {
          if (poly.id !== dragging.polyId) return poly
          const points = [...poly.points]
          points[dragging.pointIdx] = point
          return { ...poly, points }
        })
        onPolygonsChangeRef.current(updated) // don't push to history during drag
      }
    },
    [dragging, getScaledPoint]
  )

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!dragging) return
      e.preventDefault()
      const t = e.touches[0]
      const point = getScaledPoint(t.clientX, t.clientY)

      if (dragging.type === 'vertex') {
        const updated = polygonsRef.current.map((poly) => {
          if (poly.id !== dragging.polyId) return poly
          const points = [...poly.points]
          points[dragging.pointIdx] = point
          return { ...poly, points }
        })
        onPolygonsChangeRef.current(updated)
      }
    },
    [dragging, getScaledPoint]
  )

  const handleMouseUp = useCallback(() => {
    // pan never touches the polygons, so it never enters history
    if (dragging && dragging.type !== 'pan') {
      pushHistory(polygonsRef.current)
    }
    setDragging(null)
  }, [dragging, pushHistory])

  const handleTouchEnd = useCallback(() => {
    if (dragging && dragging.type !== 'pan') {
      pushHistory(polygonsRef.current)
    }
    setDragging(null)
  }, [dragging, pushHistory])

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('touchmove', handleTouchMove, { passive: false })
      window.addEventListener('touchend', handleTouchEnd)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('touchmove', handleTouchMove)
        window.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [dragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd])

  const handleBackgroundClick = () => {
    if (consumeDidPan()) return
    setActiveId(null)
  }

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const isPanTrigger = e.button === 1 || (e.button === 0 && spaceHeld.current)
    if (!isPanTrigger) return
    // preventDefault suppresses middle-mouse autoscroll
    e.preventDefault()
    if (!containerRef.current || !imageSize.width) return
    const rect = containerRef.current.getBoundingClientRect()
    const svgScale = rect.width / (imageSize.width / zoom)
    setDragging({
      type: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
      svgScale,
    })
  }

  const handleResetZoom = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // names sit outside undo history; see the history setup above
  const handleRename = (id: string, label: string) => {
    const poly = polygons.find(p => p.id === id)
    if (!poly || poly.label === label) return
    onPolygonsChange(polygons.map(p => (p.id === id ? { ...p, label } : p)))
  }

  const handleDeletePolygon = (id: string) => {
    updatePolygons(polygons.filter((p) => p.id !== id))
    if (activeId === id) setActiveId(null)
    if (hasInclusion && onIncludedChange) {
      const next = new Set(included!)
      next.delete(id)
      onIncludedChange(next)
    }
  }

  // --- outline tools ---

  const gestureRef = useRef(gesture)
  const busyRef = useRef(false)
  const includedRef = useRef(included)
  const onIncludedChangeRef = useRef(onIncludedChange)
  const updatePolygonsRef = useRef(updatePolygons)
  useEffect(() => { gestureRef.current = gesture }, [gesture])
  useEffect(() => { includedRef.current = included }, [included])
  useEffect(() => { onIncludedChangeRef.current = onIncludedChange }, [onIncludedChange])
  useEffect(() => { updatePolygonsRef.current = updatePolygons }, [updatePolygons])

  // new outlines join the save selection; ids read from refs because the
  // async operations finish after the render that started them
  const includeNew = (ids: string[]) => {
    const current = includedRef.current
    const change = onIncludedChangeRef.current
    if (!current || !change || ids.length === 0) return
    change(new Set([...current, ...ids]))
  }

  const firstFreeToolNumber = () => nextToolNumber(polygonsRef.current.map(p => p.label))

  // one backend operation at a time; errors become the toolbar notice
  const runOperation = async (fallback: string, op: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setNotice(null)
    try {
      await op()
    } catch (err) {
      setNotice(errorMessage(err, fallback))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const straightenStep = gesture?.kind === 'straighten' ? gesture.step : null

  const handleStraightenClick = (polyId: string, pointIdx: number) => {
    const poly = polygons.find(p => p.id === polyId)
    if (!poly) return
    const { state, points } = straightenClick(straightenStep, polyId, poly.points, pointIdx)
    if (points) updatePolygons(polygons.map(p => (p.id === polyId ? { ...p, points } : p)))
    setGesture(state ? { kind: 'straighten', step: state, hover: null } : null)
  }

  // swap the last straighten to the other side, as the same undo step
  const handleStraightenOtherSide = () => {
    if (straightenStep?.kind !== 'done') return
    const current = polygons.find(p => p.id === straightenStep.polyId)
    const { state, points } = straightenOtherSide(straightenStep, current?.points)
    if (points) {
      const next = polygons.map(p => (p.id === straightenStep.polyId ? { ...p, points } : p))
      replaceHistory(next)
      onPolygonsChange(next)
    }
    setGesture(state ? { kind: 'straighten', step: state, hover: null } : null)
  }

  const handleMergeClick = (id: string) => {
    if (gesture?.kind !== 'merge') {
      setGesture({ kind: 'merge', sourceId: id })
      return
    }
    if (gesture.sourceId === id) {
      setGesture(null)
      return
    }
    if (!onMerge) return
    const sourceId = gesture.sourceId
    void runOperation('Merge failed', async () => {
      const source = polygonsRef.current.find(p => p.id === sourceId)
      const target = polygonsRef.current.find(p => p.id === id)
      if (!source || !target) return
      const merged = await onMerge([source, target])
      const next = applyMergeResult(polygonsRef.current, source, target, merged)
      if (!next) {
        setNotice('An outline changed while merging; try again')
        setGesture(null)
        return
      }
      updatePolygonsRef.current(next)
      if (includedRef.current?.has(id)) includeNew([merged.id])
      setGesture({ kind: 'merge', sourceId: merged.id })
    })
  }

  const runSplit = (cut: Point[]) => {
    if (!onSplit || cut.length < 2) return
    const xs = cut.map(p => p.x)
    const ys = cut.map(p => p.y)
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    // only outlines whose bounds the stroke reaches; the backend decides if it truly crosses
    const candidates = polygonsRef.current.filter(poly => {
      const pxs = poly.points.map(p => p.x)
      const pys = poly.points.map(p => p.y)
      return Math.min(...pxs) <= maxX && Math.max(...pxs) >= minX && Math.min(...pys) <= maxY && Math.max(...pys) >= minY
    })
    if (candidates.length === 0) {
      setNotice('Drag the cut across an outline')
      return
    }
    void runOperation('Split failed', async () => {
      let labelStart = firstFreeToolNumber()
      let lastError: string | null = null
      let realError: string | null = null
      const replacements = new Map<string, Polygon[]>()
      for (const poly of candidates) {
        try {
          const pieces = await onSplit(poly, cut, labelStart)
          if (pieces.length < 2) continue
          replacements.set(poly.id, pieces)
          labelStart += pieces.length - 1
        } catch (err) {
          // a 400 means the stroke only grazed this outline's bounds; worth
          // saying only if nothing split. anything else is a real failure
          if (err instanceof ApiError && err.status === 400) lastError ??= errorMessage(err, 'Split failed')
          else realError ??= errorMessage(err, 'Split failed')
        }
      }
      if (replacements.size === 0) {
        setNotice(realError ?? lastError ?? 'The cut must cross an outline from one side to the other')
        return
      }
      // one history entry for the whole cut, applied to the latest outlines
      const { polygons: next, applied } = applySplitResults(polygonsRef.current, candidates, replacements)
      if (applied.length === 0) {
        setNotice('The outline changed while splitting; try again')
        return
      }
      updatePolygonsRef.current(next)
      if (realError) setNotice(`Some outlines were not split: ${realError}`)
      const selected = includedRef.current
      includeNew(applied.flatMap(id => (
        selected?.has(id) ? replacements.get(id)!.slice(1).map(p => p.id) : []
      )))
    })
  }

  const runTraceRegion = (a: Point, b: Point) => {
    const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
    if (!onTraceRegion || rect.width < uiScale * 8 || rect.height < uiScale * 8) {
      setGesture(null)
      return
    }
    void runOperation('Tracing failed', async () => {
      const poly = await onTraceRegion(rect, firstFreeToolNumber())
      updatePolygonsRef.current([...polygonsRef.current, poly])
      includeNew([poly.id])
    }).then(() => setGesture(null))
  }

  const finishDraw = (points: Point[]) => {
    // a double-click lands the last point twice
    const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > uiScale * 2)
    if (clean.length < 3) {
      setNotice('An outline needs at least three points')
      return
    }
    const poly: Polygon = {
      id: newPolygonId(),
      label: `tool ${firstFreeToolNumber()}`,
      points: clean,
      finger_holes: [],
      interior_rings: [],
    }
    updatePolygons([...polygons, poly])
    includeNew([poly.id])
    setGesture(null)
    setNotice(null)
  }

  const pointerPoint = (e: { clientX: number; clientY: number; shiftKey: boolean }, from?: Point) => {
    const p = getScaledPoint(e.clientX, e.clientY)
    return from && e.shiftKey ? snapAngle(from, p) : p
  }

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    // pan triggers bubble to the canvas handler
    if (e.button !== 0 || spaceHeld.current || busyRef.current) return
    const p = getScaledPoint(e.clientX, e.clientY)
    if (editMode === 'split') setGesture({ kind: 'stroke', points: [p] })
    if (editMode === 'box') setGesture({ kind: 'box', start: p, end: p })
  }

  const handleOverlayMouseMove = (e: React.MouseEvent) => {
    if (gesture?.kind !== 'draw') return
    setGesture({ ...gesture, hover: pointerPoint(e, gesture.points[gesture.points.length - 1]) })
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (consumeDidPan() || editMode !== 'draw') return
    const points = gesture?.kind === 'draw' ? gesture.points : []
    const p = pointerPoint(e, points[points.length - 1])
    if (points.length >= 3 && Math.hypot(p.x - points[0].x, p.y - points[0].y) < uiScale * 10) {
      finishDraw(points)
      return
    }
    setGesture({ kind: 'draw', points: [...points, p], hover: p })
  }

  const handleOverlayDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (gesture?.kind === 'draw') finishDraw(gesture.points)
  }

  // latest closures for the window listeners below
  const gestureEndRef = useRef({ runSplit, runTraceRegion, finishDraw })
  useEffect(() => { gestureEndRef.current = { runSplit, runTraceRegion, finishDraw } })

  // stroke and box drags track the pointer past the canvas edge
  const dragGesture = gesture?.kind === 'stroke' || gesture?.kind === 'box'
  useEffect(() => {
    if (!dragGesture || busy) return
    const minStep = uiScale * 2
    const move = (e: MouseEvent) => {
      const p = getScaledPoint(e.clientX, e.clientY)
      setGesture(g => {
        if (g?.kind === 'box') return { ...g, end: p }
        if (g?.kind !== 'stroke') return g
        if (e.shiftKey) return { kind: 'stroke', points: [g.points[0], snapAngle(g.points[0], p)] }
        const last = g.points[g.points.length - 1]
        return Math.hypot(p.x - last.x, p.y - last.y) < minStep ? g : { ...g, points: [...g.points, p] }
      })
    }
    const up = () => {
      const g = gestureRef.current
      if (g?.kind === 'stroke') {
        setGesture(null)
        gestureEndRef.current.runSplit(g.points)
      } else if (g?.kind === 'box') {
        gestureEndRef.current.runTraceRegion(g.start, g.end)
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [dragGesture, busy, getScaledPoint, uiScale])

  // Escape cancels, Enter finishes a drawing, Backspace takes back its last point
  useEffect(() => {
    if (!editable) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      const g = gestureRef.current
      if (!g || busyRef.current) return
      if (e.key === 'Escape') {
        setGesture(null)
        setNotice(null)
      } else if (e.key === 'Enter' && g.kind === 'draw') {
        e.preventDefault()
        gestureEndRef.current.finishDraw(g.points)
      } else if (e.key === 'Backspace' && g.kind === 'draw') {
        e.preventDefault()
        setGesture(g.points.length > 1 ? { ...g, points: g.points.slice(0, -1) } : null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable])

  useDeleteShortcut(() => { if (activeId) handleDeletePolygon(activeId) }, editable && activeId !== null)

  // auto-activate first included polygon when switching to edit modes
  const handleModeChange = (mode: EditMode) => {
    setEditMode(mode)
    setGesture(null)
    setNotice(null)
    if ((mode === 'vertex' || mode === 'add-vertex' || mode === 'delete-vertex' || mode === 'straighten') && !activeId && polygons.length > 0) {
      const first = hasInclusion
        ? polygons.find(p => included!.has(p.id))
        : polygons[0]
      if (first) setActiveId(first.id)
    }
  }

  if (!imageSize.width) {
    return <div className="bg-inset rounded-lg aspect-[4/3]" />
  }

  const activePoly = polygons.find(p => p.id === activeId)

  const modeButton = (
    mode: EditMode,
    icon: React.ReactNode,
    title: string,
    active = editMode === mode,
    extra: { disabled?: boolean; 'data-delete-shortcut'?: boolean } = {},
  ) => (
    <button
      onClick={() => handleModeChange(mode)}
      aria-pressed={active}
      aria-label={title}
      title={title}
      {...extra}
      className={`p-2 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? 'bg-accent-muted text-accent' : 'hover:bg-border text-text-secondary'
      }`}
    >
      {icon}
    </button>
  )

  let modeHint = MODE_HINTS[editMode]
  if (editMode === 'select' || editMode === 'vertex') {
    modeHint = activeId
      ? 'Drag vertices to adjust the outline'
      : showLabels ? 'Click outlines to select tools; click a name to rename it' : 'Click outlines to select tools'
  } else if (busy && editMode === 'box') {
    modeHint = 'Tracing the boxed object...'
  } else if (gesture?.kind === 'merge') {
    modeHint = 'Click another outline to join it to the highlighted one. Esc to stop'
  } else if (straightenStep?.kind === 'picking') {
    modeHint = 'Click the second corner. Red shows the points that will be removed'
  } else if (straightenStep?.kind === 'done') {
    modeHint = 'Straightened. Wrong part removed? Click Other side. Or pick two more corners'
  }
  const canvasMode = editable && CANVAS_MODES.includes(editMode)

  const toPoints = (pts: Point[]) => pts.map(p => `${p.x},${p.y}`).join(' ')

  function renderStraightenPreview(points: Point[], start: number, hover: number | null) {
    const from = points[start]
    if (!from) return null
    const to = hover !== null ? points[hover] : undefined
    const removed = hover !== null ? straightenRemoval(points, start, hover) : []
    // removal runs forward from whichever endpoint precedes it
    const path = removed.length === 0 ? [] : removed[0] === (start + 1) % points.length
      ? [start, ...removed, hover!]
      : [hover!, ...removed, start]
    return (
      <g className="pointer-events-none">
        {path.length > 0 && (
          <polyline
            points={toPoints(path.map(i => points[i]))}
            fill="none"
            stroke="rgb(239, 68, 68)"
            strokeWidth={uiScale * 3}
            strokeDasharray={`${uiScale * 4} ${uiScale * 3}`}
          />
        )}
        {to && (
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="rgb(34, 197, 94)" strokeWidth={uiScale * 2.5} />
        )}
        <circle cx={from.x} cy={from.y} r={uiScale * 12} fill="none" stroke="rgb(245, 158, 11)" strokeWidth={uiScale * 2.5} />
      </g>
    )
  }

  function renderGesturePreview() {
    if (gesture?.kind === 'stroke') {
      return (
        <polyline
          points={toPoints(gesture.points)}
          fill="none"
          stroke="rgb(239, 68, 68)"
          strokeWidth={uiScale * 2.5}
          strokeDasharray={`${uiScale * 6} ${uiScale * 4}`}
          className="pointer-events-none"
        />
      )
    }
    if (gesture?.kind === 'box') {
      const { start, end } = gesture
      return (
        <rect
          x={Math.min(start.x, end.x)}
          y={Math.min(start.y, end.y)}
          width={Math.abs(end.x - start.x)}
          height={Math.abs(end.y - start.y)}
          fill="rgba(90, 180, 222, 0.12)"
          stroke="rgb(72, 168, 214)"
          strokeWidth={uiScale * 2}
          strokeDasharray={`${uiScale * 6} ${uiScale * 4}`}
          className={`pointer-events-none ${busy ? 'animate-pulse' : ''}`}
        />
      )
    }
    if (gesture?.kind === 'draw') {
      const pts = gesture.hover ? [...gesture.points, gesture.hover] : gesture.points
      const first = gesture.points[0]
      return (
        <g className="pointer-events-none">
          <polyline points={toPoints(pts)} fill="rgba(90, 180, 222, 0.12)" stroke={HALO_STROKE} strokeWidth={uiScale * 4} />
          <polyline points={toPoints(pts)} fill="none" stroke="rgb(72, 168, 214)" strokeWidth={uiScale * 2} />
          {gesture.points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={uiScale * (i === 0 ? 9 : 5)} fill="#27272a" stroke="rgb(72, 168, 214)" strokeWidth={uiScale * 2} />
          ))}
          {first && gesture.points.length >= 3 && (
            <circle cx={first.x} cy={first.y} r={uiScale * 13} fill="none" stroke="rgb(34, 197, 94)" strokeWidth={uiScale * 2} />
          )}
        </g>
      )
    }
    return null
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* toolbar */}
      {editable && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 flex-shrink-0">
          <div className="flex gap-1 bg-elevated rounded-[10px] p-1 border border-border">
            {modeButton('vertex', <Move className="w-5 h-5" />, 'Move vertices', editMode === 'vertex' || editMode === 'select')}
            {modeButton('add-vertex', <Plus className="w-5 h-5" />, 'Add vertex')}
            {modeButton('delete-vertex', <Minus className="w-5 h-5" />, 'Delete vertex', undefined, {
              'data-delete-shortcut': true,
              disabled: activePoly && activePoly.points.length <= 3,
            })}
            {modeButton('straighten', <Slash className="w-5 h-5" />, 'Straighten between two corners')}
          </div>

          <div className="flex gap-1 bg-elevated rounded-[10px] p-1 border border-border">
            {onSplit && modeButton('split', <Scissors className="w-5 h-5" />, 'Split an outline')}
            {onMerge && modeButton('merge', <Combine className="w-5 h-5" />, 'Merge outlines')}
            {modeButton('draw', <PenTool className="w-5 h-5" />, 'Draw a missing outline')}
            {onTraceRegion && modeButton('box', <SquareDashedMousePointer className="w-5 h-5" />, 'Trace a missed object')}
          </div>

          <div className="h-6 w-px bg-border-subtle" />

          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-2 rounded hover:bg-border text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-2 rounded hover:bg-border text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-5 h-5" />
            </button>
          </div>

          <span className="text-sm text-text-muted inline-flex items-center gap-1.5" aria-live="polite">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {notice ? <span className="text-amber-500">{notice}</span> : modeHint}
          </span>

          {activeId && (
            <button
              onClick={() => handleDeletePolygon(activeId)}
              data-delete-shortcut
              className="ml-auto px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/20 rounded border border-red-800 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>
      )}

      <div ref={wrapperRef} className="flex-1 min-h-0 flex items-center justify-center">
        <div
          ref={containerRef}
          className={`relative bg-inset rounded-lg overflow-hidden ${dragging?.type === 'pan' ? 'cursor-grabbing' : ''}`}
          style={fitted.width ? { width: fitted.width, height: fitted.height } : { width: '100%', aspectRatio: `${imageSize.width} / ${imageSize.height}` }}
          onClick={handleBackgroundClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseDownCapture={() => { didPanRef.current = false }}
        >
        <svg
          className={`absolute inset-0 w-full h-full ${dragging?.type === 'pan' ? 'pointer-events-none' : ''}`}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        >
          {/* photo lives inside the svg so it zooms and pans with the polygons */}
          <image
            href={imageUrl}
            x={0}
            y={0}
            width={imageSize.width}
            height={imageSize.height}
            preserveAspectRatio="none"
            role="img"
            aria-label="Corrected"
            className="pointer-events-none select-none"
          />
          {polygons.map((poly) => {
            const isActive = activeId === poly.id
            const polyIncluded = isIncluded(poly.id)
            const isHovered = hovered === poly.id
            const pathData = polygonPathData(poly.points, poly.interior_rings)

            let fill = 'rgba(90, 180, 222, 0.08)'
            let stroke = 'rgba(90, 180, 222, 0.85)'
            let strokeW = uiScale * 1
            if (gesture?.kind === 'merge' && gesture.sourceId === poly.id) {
              fill = 'rgba(245, 158, 11, 0.25)'
              stroke = 'rgb(245, 158, 11)'
              strokeW = uiScale * 2
            } else if (isActive) {
              fill = 'rgba(90, 180, 222, 0.3)'
              stroke = 'rgb(72, 168, 214)'
              strokeW = uiScale * 2
            } else if (polyIncluded) {
              fill = 'rgba(90, 180, 222, 0.2)'
              stroke = 'rgb(72, 168, 214)'
              strokeW = uiScale * 1.5
            } else if (isHovered) {
              fill = 'rgba(90, 180, 222, 0.18)'
              stroke = 'rgb(90, 180, 222)'
              strokeW = uiScale * 1.5
            }

            return (
              <g key={poly.id}>
                <path
                  d={pathData}
                  fillRule="evenodd"
                  fill="none"
                  stroke={HALO_STROKE}
                  strokeWidth={strokeW + uiScale * 1.5}
                  className="pointer-events-none"
                />
                <path
                  d={pathData}
                  fillRule="evenodd"
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeW}
                  className="cursor-pointer transition-[fill,stroke,stroke-width] duration-150"
                  onClick={handlePolygonClick(poly.id)}
                  onMouseEnter={() => onHoveredChange?.(poly.id)}
                  onMouseLeave={() => onHoveredChange?.(null)}
                />

                {/* edge click targets for adding vertices */}
                {isActive && editable && editMode === 'add-vertex' &&
                  poly.points.map((point, idx) => {
                    const nextPoint = poly.points[(idx + 1) % poly.points.length]
                    const midX = (point.x + nextPoint.x) / 2
                    const midY = (point.y + nextPoint.y) / 2
                    return (
                      <g key={`edge-${idx}`}>
                        <line
                          x1={point.x}
                          y1={point.y}
                          x2={nextPoint.x}
                          y2={nextPoint.y}
                          stroke="transparent"
                          strokeWidth={uiScale * 20}
                          className="cursor-crosshair"
                          onClick={handleEdgeClick(poly.id, idx)}
                        />
                        <circle
                          cx={midX}
                          cy={midY}
                          r={uiScale * 5}
                          fill="rgb(34, 197, 94)"
                          stroke="#27272a"
                          strokeWidth={uiScale * 2}
                          className="cursor-crosshair pointer-events-none"
                        />
                      </g>
                    )
                  })}

                {/* vertex handles */}
                {isActive &&
                  editable &&
                  VERTEX_MODES.includes(editMode) &&
                  poly.points.map((point, idx) => (
                    <g key={idx}>
                      {/* transparent hit target -- larger for touch */}
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={uiScale * 16}
                        fill="transparent"
                        className={editMode === 'delete-vertex' || editMode === 'straighten' ? 'cursor-pointer touch-none' : 'cursor-move touch-none'}
                        onMouseEnter={straightenStep?.kind === 'picking' && straightenStep.polyId === poly.id
                          ? () => setGesture({ kind: 'straighten', step: straightenStep, hover: idx })
                          : undefined}
                        onMouseLeave={editMode === 'straighten' && gesture?.kind === 'straighten'
                          ? () => setGesture(g => (g?.kind === 'straighten' ? { ...g, hover: null } : g))
                          : undefined}
                        onMouseDown={editMode !== 'delete-vertex' ? handleVertexMouseDown(poly.id, idx) : undefined}
                        onTouchStart={editMode !== 'delete-vertex' ? handleVertexTouchStart(poly.id, idx) : undefined}
                        onClick={handleVertexClick(poly.id, idx)}
                      />
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={uiScale * 8}
                        fill={editMode === 'delete-vertex' ? 'rgb(239, 68, 68)' : '#27272a'}
                        stroke={editMode === 'delete-vertex' ? 'rgb(185, 28, 28)' : 'rgb(72, 168, 214)'}
                        strokeWidth={uiScale * 2}
                        className="pointer-events-none"
                      />
                    </g>
                  ))}

                {gesture?.kind === 'straighten' && gesture.step.kind === 'picking' && gesture.step.polyId === poly.id
                  && renderStraightenPreview(poly.points, gesture.step.start, gesture.hover)}
              </g>
            )
          })}

          {canvasMode && (
            <rect
              x={0}
              y={0}
              width={imageSize.width}
              height={imageSize.height}
              fill="transparent"
              className="cursor-crosshair"
              onMouseDown={handleOverlayMouseDown}
              onMouseMove={handleOverlayMouseMove}
              onClick={handleOverlayClick}
              onDoubleClick={handleOverlayDoubleClick}
            />
          )}
          {renderGesturePreview()}
          {straightenStep?.kind === 'done' && (() => {
            const from = straightenStep.before[straightenStep.a]
            const to = straightenStep.before[straightenStep.b]
            return (
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke="rgb(34, 197, 94)"
                strokeWidth={uiScale * 3}
                className="pointer-events-none"
              />
            )
          })()}
        </svg>

        {showLabels && (
          <OutlineLabels
            polygons={polygons}
            viewBox={vb}
            onLabelChange={handleRename}
            included={isIncluded}
            hovered={hovered}
            onHoveredChange={onHoveredChange}
            interactive={editable && (editMode === 'select' || editMode === 'vertex') && !dragging}
          />
        )}

        {straightenStep?.kind === 'done' && (() => {
          const from = straightenStep.before[straightenStep.a]
          const to = straightenStep.before[straightenStep.b]
          const left = (((from.x + to.x) / 2 - vb.x) / vb.w) * 100
          const top = (((from.y + to.y) / 2 - vb.y) / vb.h) * 100
          return (
            <div
              className="absolute -translate-x-1/2 -translate-y-[calc(100%+10px)] z-10"
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleStraightenOtherSide}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-surface text-text-primary border border-border shadow-lg hover:bg-elevated"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Other side
              </button>
            </div>
          )
        })()}

        {/* zoom controls */}
        <div
          className="absolute bottom-3.5 right-3.5 z-20 glass-toolbar px-1 py-0.5 flex items-center gap-0.5 text-[11px]"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setZoom(z => clampZoom(z / ZOOM_FACTOR))}
            className="px-2 py-1 rounded-[7px] text-text-muted hover:text-text-primary hover:bg-border/50 transition-colors"
          >
            -
          </button>
          <span className="px-1.5 text-text-secondary min-w-[36px] text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => clampZoom(z * ZOOM_FACTOR))}
            className="px-2 py-1 rounded-[7px] text-text-muted hover:text-text-primary hover:bg-border/50 transition-colors"
          >
            +
          </button>
          <div className="h-3.5 w-px bg-border-subtle mx-0.5" />
          <button
            onClick={handleResetZoom}
            className="px-2 py-1 rounded-[7px] text-text-muted hover:text-text-primary hover:bg-border/50 transition-colors"
          >
            Fit
          </button>
        </div>
        </div>
      </div>

    </div>
  )
}
