'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { CutoutShape, FingerHole, PlacedTool, TextLabel } from '@/types'
import { snapToGrid as snapToGridUtil } from '@/lib/svg'
import { GRID_UNIT, DISPLAY_SCALE, SNAP_GRID } from '@/lib/constants'
import { BinEditorToolbar } from '@/components/BinEditorToolbar'
import { BinEditorCanvas } from '@/components/BinEditorCanvas'
import { useDeleteShortcut } from '@/hooks/useDeleteShortcut'
import { getCutoutDefaults, getSettings } from '@/lib/settings'
import { BinCutoutInspector } from '@/components/BinCutoutInspector'
import { BinToolInspector } from '@/components/BinToolInspector'
import { cutoutShapeLabel, resizeRoundCutout } from '@/lib/cutouts'

interface Props {
  placedTools: PlacedTool[]
  oversizedToolIds?: Set<string>
  onPlacedToolsChange: (tools: PlacedTool[]) => void
  textLabels: TextLabel[]
  onTextLabelsChange: (labels: TextLabel[]) => void
  gridX: number
  gridY: number
  partialBins: boolean
  partialBinsValues: boolean[]
  wallThickness: number
  defaultCutoutDepth: number
  maxCutoutDepth: number
  insertAllowance?: number
  halfGridBase?: boolean
  onEditTool?: (toolId: string) => void
  smoothedToolIds?: Set<string>
  onToggleSmoothed?: (toolId: string, smoothed: boolean) => void
  smoothLevels?: Map<string, number>
  onSmoothLevelChange?: (toolId: string, level: number) => void
  onDraggingChange?: (dragging: boolean) => void
}

type Tool = 'select' | 'text' | 'choose-cutout-tool' | 'cutout'

type Selection =
  | { type: 'tool'; toolId: string }
  | { type: 'hole'; toolId: string; holeId: string }
  | { type: 'label'; labelId: string }
  | null

type DragState =
  | { type: 'tool'; toolId: string; startX: number; startY: number; origPoints: { x: number; y: number }[]; origHoles: { id: string; x: number; y: number }[]; origInteriorRings: { x: number; y: number }[][] }
  | { type: 'rotate'; toolId: string; centerX: number; centerY: number; startAngle: number; origRotation: number; origPoints: { x: number; y: number }[]; origHoles: { id: string; x: number; y: number; rotation: number }[]; origInteriorRings: { x: number; y: number }[][] }
  | { type: 'label'; labelId: string; startX: number; startY: number; origX: number; origY: number }
  | { type: 'rotate-label'; labelId: string; centerX: number; centerY: number; startAngle: number; origRotation: number }
  | { type: 'hole'; toolId: string; holeId: string; startX: number; startY: number; origX: number; origY: number }
  | { type: 'resize-hole'; toolId: string; holeId: string; centerX: number; centerY: number }
  | null

export function BinEditor({
  placedTools,
  oversizedToolIds,
  onPlacedToolsChange,
  textLabels,
  onTextLabelsChange,
  gridX,
  gridY,
  partialBins,
  partialBinsValues,
  wallThickness,
  defaultCutoutDepth,
  maxCutoutDepth,
  insertAllowance = 0,
  halfGridBase,
  onEditTool,
  smoothedToolIds,
  onToggleSmoothed,
  smoothLevels,
  onSmoothLevelChange,
  onDraggingChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [cutoutShape, setCutoutShape] = useState<CutoutShape>('scoop')
  const [cutoutToolId, setCutoutToolId] = useState<string | null>(null)
  const [cutoutHover, setCutoutHover] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState<DragState>(null)
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [snapGrid, setSnapGrid] = useState(SNAP_GRID)
  const [pendingLabel, setPendingLabel] = useState<{ x: number; y: number } | null>(null)
  const [pendingText, setPendingText] = useState('')
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const pendingInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const rafRef = useRef<number | null>(null)

  const toolsRef = useRef(placedTools)
  const onChangeRef = useRef(onPlacedToolsChange)
  const textLabelsRef = useRef(textLabels)
  const onTextLabelsChangeRef = useRef(onTextLabelsChange)
  useEffect(() => { toolsRef.current = placedTools }, [placedTools])
  useEffect(() => { onChangeRef.current = onPlacedToolsChange }, [onPlacedToolsChange])
  useEffect(() => { textLabelsRef.current = textLabels }, [textLabels])
  useEffect(() => { onTextLabelsChangeRef.current = onTextLabelsChange }, [onTextLabelsChange])

  useEffect(() => { onDraggingChange?.(dragging !== null) }, [dragging, onDraggingChange])

  const binWidthMm = gridX * GRID_UNIT
  const binHeightMm = gridY * GRID_UNIT
  const displayWidth = binWidthMm * DISPLAY_SCALE
  const displayHeight = binHeightMm * DISPLAY_SCALE

  const viewBoxShort = Math.min(displayWidth, displayHeight) + 30
  const handleR = Math.max(14, Math.min(28, viewBoxShort * 0.04))
  const handleOffset = handleR * 2.5
  const handleStroke = Math.max(1.5, handleR * 0.1)

  const getAllBounds = useCallback(() => {
    if (placedTools.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const tool of placedTools) {
      for (const p of tool.points) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    }
    return { minX, minY, maxX, maxY }
  }, [placedTools])

  const handleRecenter = useCallback(() => {
    const bounds = getAllBounds()
    const targetCenterX = binWidthMm / 2
    const targetCenterY = binHeightMm / 2
    const currentCenterX = (bounds.minX + bounds.maxX) / 2
    const currentCenterY = (bounds.minY + bounds.maxY) / 2
    const dx = targetCenterX - currentCenterX
    const dy = targetCenterY - currentCenterY

    const updated = placedTools.map(tool => ({
      ...tool,
      points: tool.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
      finger_holes: tool.finger_holes.map(fh => ({ ...fh, x: fh.x + dx, y: fh.y + dy })),
      interior_rings: (tool.interior_rings ?? []).map(ring =>
        ring.map(p => ({ x: p.x + dx, y: p.y + dy }))
      ),
    }))
    onPlacedToolsChange(updated)
  }, [getAllBounds, binWidthMm, binHeightMm, placedTools, onPlacedToolsChange])

  const screenToMm = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 }
    const rect = svgRef.current.getBoundingClientRect()
    const viewBoxWidth = displayWidth + 70
    const viewBoxHeight = displayHeight + 30
    const scaleX = viewBoxWidth / rect.width
    const scaleY = viewBoxHeight / rect.height
    const scale = Math.max(scaleX, scaleY)
    const offsetX = (rect.width * scale - viewBoxWidth) / 2
    const offsetY = (rect.height * scale - viewBoxHeight) / 2
    const svgX = (clientX - rect.left) * scale - offsetX - 10
    const svgY = (clientY - rect.top) * scale - offsetY - 10
    return { x: svgX / DISPLAY_SCALE, y: svgY / DISPLAY_SCALE }
  }, [displayWidth, displayHeight])

  const snapToGrid = useCallback((v: number) => {
    if (!snapEnabled) return v
    return snapToGridUtil(v, snapGrid)
  }, [snapEnabled, snapGrid])

  const handleToolMouseDown = (toolId: string) => (e: React.MouseEvent) => {
    if (activeTool === 'choose-cutout-tool') return
    if (activeTool !== 'select') return
    e.stopPropagation()
    const tool = placedTools.find(t => t.id === toolId)
    if (!tool) return

    setSelection({ type: 'tool', toolId })
    const pos = screenToMm(e.clientX, e.clientY)
    setDragging({
      type: 'tool',
      toolId,
      startX: pos.x,
      startY: pos.y,
      origPoints: tool.points.map(p => ({ x: p.x, y: p.y })),
      origHoles: tool.finger_holes.map(fh => ({ id: fh.id, x: fh.x, y: fh.y, rotation: fh.rotation ?? 0 })),
      origInteriorRings: (tool.interior_rings ?? []).map(ring => ring.map(p => ({ x: p.x, y: p.y }))),
    })
  }

  const handleChooseCutoutTool = (toolId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelection({ type: 'tool', toolId })
    setCutoutToolId(toolId)
    setActiveTool('cutout')
  }

  const stopClick = (e: React.MouseEvent) => e.stopPropagation()
  const stopClickUnlessText = (e: React.MouseEvent) => { if (activeTool === 'select' || activeTool === 'choose-cutout-tool') e.stopPropagation() }

  const startCutout = () => {
    const ownerId = selection?.type === 'tool' || selection?.type === 'hole' ? selection.toolId : null
    setCutoutToolId(ownerId)
    setCutoutHover(null)
    setActiveTool(ownerId ? 'cutout' : 'choose-cutout-tool')
  }

  const changeActiveTool = (next: Tool) => {
    setActiveTool(next)
    if (next !== 'cutout') { setCutoutToolId(null); setCutoutHover(null) }
  }

  const handleRotateMouseDown = (toolId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    const tool = placedTools.find(t => t.id === toolId)
    if (!tool) return

    const pos = screenToMm(e.clientX, e.clientY)
    const centerX = tool.points.reduce((sum, p) => sum + p.x, 0) / tool.points.length
    const centerY = tool.points.reduce((sum, p) => sum + p.y, 0) / tool.points.length
    const startAngle = Math.atan2(pos.y - centerY, pos.x - centerX)

    setDragging({
      type: 'rotate', toolId,
      centerX, centerY, startAngle,
      origRotation: tool.rotation || 0,
      origPoints: tool.points.map(p => ({ x: p.x, y: p.y })),
      origHoles: tool.finger_holes.map(fh => ({ id: fh.id, x: fh.x, y: fh.y, rotation: fh.rotation ?? 0 })),
      origInteriorRings: (tool.interior_rings ?? []).map(ring => ring.map(p => ({ x: p.x, y: p.y }))),
    })
  }

  const handleLabelMouseDown = (labelId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    const label = textLabels.find(l => l.id === labelId)
    if (!label) return

    setSelection({ type: 'label', labelId })
    const pos = screenToMm(e.clientX, e.clientY)
    setDragging({
      type: 'label', labelId,
      startX: pos.x, startY: pos.y,
      origX: label.x, origY: label.y,
    })
  }

  const handleLabelRotateMouseDown = (labelId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    const label = textLabels.find(l => l.id === labelId)
    if (!label) return

    const pos = screenToMm(e.clientX, e.clientY)
    const startAngle = Math.atan2(pos.y - label.y, pos.x - label.x)
    setDragging({
      type: 'rotate-label', labelId,
      centerX: label.x, centerY: label.y,
      startAngle, origRotation: label.rotation,
    })
  }

  const handleLabelDoubleClick = (labelId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    const label = textLabels.find(l => l.id === labelId)
    if (!label) return
    setEditingLabelId(labelId)
    setEditingText(label.text)
    setSelection({ type: 'label', labelId })
  }

  const commitEditingLabel = useCallback(() => {
    if (!editingLabelId) return
    const trimmed = editingText.trim()
    if (trimmed) {
      onTextLabelsChange(textLabels.map(l =>
        l.id === editingLabelId ? { ...l, text: trimmed } : l
      ))
    } else {
      onTextLabelsChange(textLabels.filter(l => l.id !== editingLabelId))
      setSelection(null)
    }
    setEditingLabelId(null)
    setEditingText('')
  }, [editingLabelId, editingText, textLabels, onTextLabelsChange])

  useEffect(() => {
    if (editingLabelId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingLabelId])

  const pointInRing = useCallback((px: number, py: number, ring: { x: number; y: number }[]) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x, yi = ring[i].y
      const xj = ring[j].x, yj = ring[j].y
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
        inside = !inside
      }
    }
    return inside
  }, [])

  const isInsideCutout = useCallback((px: number, py: number) => {
    for (const tool of toolsRef.current) {
      if (!pointInRing(px, py, tool.points)) continue
      let inIsland = false
      for (const ring of (tool.interior_rings ?? [])) {
        if (pointInRing(px, py, ring)) { inIsland = true; break }
      }
      if (!inIsland) return true
    }
    return false
  }, [pointInRing])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return
    const clientX = e.clientX
    const clientY = e.clientY

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const pos = screenToMm(clientX, clientY)
      const currentTools = toolsRef.current
      const onChange = onChangeRef.current
      const currentLabels = textLabelsRef.current
      const onLabelsChange = onTextLabelsChangeRef.current

      if (dragging.type === 'tool') {
        const origCenterX = dragging.origPoints.reduce((sum, p) => sum + p.x, 0) / dragging.origPoints.length
        const origCenterY = dragging.origPoints.reduce((sum, p) => sum + p.y, 0) / dragging.origPoints.length
        const rawDx = pos.x - dragging.startX
        const rawDy = pos.y - dragging.startY
        const newCenterX = snapToGrid(origCenterX + rawDx)
        const newCenterY = snapToGrid(origCenterY + rawDy)
        const dx = newCenterX - origCenterX
        const dy = newCenterY - origCenterY
        const updated = currentTools.map(tool => {
          if (tool.id !== dragging.toolId) return tool
          return {
            ...tool,
            points: dragging.origPoints.map(p => ({ x: p.x + dx, y: p.y + dy })),
            finger_holes: tool.finger_holes.map(fh => {
              const orig = dragging.origHoles.find(h => h.id === fh.id)
              if (!orig) return fh
              return { ...fh, x: orig.x + dx, y: orig.y + dy }
            }),
            interior_rings: dragging.origInteriorRings.map(ring =>
              ring.map(p => ({ x: p.x + dx, y: p.y + dy }))
            ),
          }
        })
        onChange(updated)
      } else if (dragging.type === 'rotate') {
        const currentAngle = Math.atan2(pos.y - dragging.centerY, pos.x - dragging.centerX)
        const deltaAngle = currentAngle - dragging.startAngle
        const cos = Math.cos(deltaAngle)
        const sin = Math.sin(deltaAngle)
        const cx = dragging.centerX
        const cy = dragging.centerY

        const deltaDeg = deltaAngle * (180 / Math.PI)
        const updated = currentTools.map(tool => {
          if (tool.id !== dragging.toolId) return tool
          return {
            ...tool,
            rotation: (dragging.origRotation + deltaDeg) % 360,
            points: dragging.origPoints.map(p => {
              const pdx = p.x - cx
              const pdy = p.y - cy
              return { x: cx + pdx * cos - pdy * sin, y: cy + pdx * sin + pdy * cos }
            }),
            finger_holes: tool.finger_holes.map(fh => {
              const orig = dragging.origHoles.find(h => h.id === fh.id)
              if (!orig) return fh
              const fdx = orig.x - cx
              const fdy = orig.y - cy
              return { ...fh, x: cx + fdx * cos - fdy * sin, y: cy + fdx * sin + fdy * cos, rotation: (orig.rotation + deltaDeg) % 360 }
            }),
            interior_rings: dragging.origInteriorRings.map(ring =>
              ring.map(p => {
                const pdx = p.x - cx
                const pdy = p.y - cy
                return { x: cx + pdx * cos - pdy * sin, y: cy + pdx * sin + pdy * cos }
              })
            ),
          }
        })
        onChange(updated)
      } else if (dragging.type === 'hole') {
        const x = snapToGrid(dragging.origX + pos.x - dragging.startX)
        const y = snapToGrid(dragging.origY + pos.y - dragging.startY)
        onChange(currentTools.map(t => t.id === dragging.toolId ? {
          ...t, finger_holes: t.finger_holes.map(fh => fh.id === dragging.holeId ? { ...fh, x, y, bin_override: true } : fh),
        } : t))
      } else if (dragging.type === 'resize-hole') {
        const radius = resizeRoundCutout(dragging.centerX, dragging.centerY, pos.x, pos.y)
        onChange(currentTools.map(t => t.id === dragging.toolId ? {
          ...t, finger_holes: t.finger_holes.map(fh => fh.id === dragging.holeId ? { ...fh, radius, bin_override: true } : fh),
        } : t))
      } else if (dragging.type === 'label') {
        const dx = pos.x - dragging.startX
        const dy = pos.y - dragging.startY
        const newX = snapToGrid(dragging.origX + dx)
        const newY = snapToGrid(dragging.origY + dy)
        // prevent straddling: label must stay in the same zone it started in
        const wasInCutout = isInsideCutout(dragging.origX, dragging.origY)
        const nowInCutout = isInsideCutout(newX, newY)
        if (wasInCutout !== nowInCutout) return
        const updated = currentLabels.map(l => {
          if (l.id !== dragging.labelId) return l
          return { ...l, x: newX, y: newY }
        })
        onLabelsChange(updated)
      } else if (dragging.type === 'rotate-label') {
        const currentAngle = Math.atan2(pos.y - dragging.centerY, pos.x - dragging.centerX)
        const deltaAngle = (currentAngle - dragging.startAngle) * (180 / Math.PI)
        const updated = currentLabels.map(l => {
          if (l.id !== dragging.labelId) return l
          return { ...l, rotation: (dragging.origRotation + deltaAngle) % 360 }
        })
        onLabelsChange(updated)
      }
    })
  }, [dragging, screenToMm, snapToGrid, isInsideCutout])

  const handleMouseUp = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setDragging(null)
  }, [])

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragging, handleMouseMove, handleMouseUp])

  const handleDeleteTool = () => {
    if (selection?.type !== 'tool') return
    onPlacedToolsChange(placedTools.filter(t => t.id !== selection.toolId))
    setSelection(null)
  }

  const handleDeleteLabel = () => {
    if (selection?.type !== 'label') return
    onTextLabelsChange(textLabels.filter(l => l.id !== selection.labelId))
    setSelection(null)
  }

  const commitPendingLabel = useCallback(() => {
    if (!pendingLabel || !pendingText.trim()) {
      setPendingLabel(null)
      setPendingText('')
      return
    }
    const newLabel: TextLabel = {
      id: `tl-${Date.now()}`,
      text: pendingText.trim(),
      x: pendingLabel.x,
      y: pendingLabel.y,
      font_size: getSettings().textSize ?? 5,
      rotation: 0,
      emboss: true,
      depth: 0.5,
    }
    onTextLabelsChange([...textLabels, newLabel])
    setSelection({ type: 'label', labelId: newLabel.id })
    setPendingLabel(null)
    setPendingText('')
  }, [pendingLabel, pendingText, textLabels, onTextLabelsChange])

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (activeTool === 'cutout') {
      const pos = screenToMm(e.clientX, e.clientY)
      if (pos.x < 0 || pos.x > binWidthMm || pos.y < 0 || pos.y > binHeightMm) return
      const tool = placedTools.find(t => t.id === cutoutToolId)
      if (!tool) return
      const hole: FingerHole = {
        id: `bin-fh-${crypto.randomUUID()}`,
        x: snapToGrid(pos.x), y: snapToGrid(pos.y), rotation: 0,
        ...getCutoutDefaults(cutoutShape), shape: cutoutShape, bin_override: true,
      }
      onPlacedToolsChange(placedTools.map(t => t.id === tool.id ? { ...t, finger_holes: [...t.finger_holes, hole] } : t))
      setSelection({ type: 'hole', toolId: tool.id, holeId: hole.id })
      changeActiveTool('select')
      return
    }
    if (activeTool === 'choose-cutout-tool') return
    if (activeTool === 'text') {
      if (pendingLabel) {
        commitPendingLabel()
        return
      }
      const pos = screenToMm(e.clientX, e.clientY)
      if (pos.x >= 0 && pos.x <= binWidthMm && pos.y >= 0 && pos.y <= binHeightMm) {
        setPendingLabel({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) })
        setPendingText('')
      }
      return
    }

    setSelection(null)
  }

  useEffect(() => {
    if (pendingLabel && pendingInputRef.current) {
      pendingInputRef.current.focus()
    }
  }, [pendingLabel])

  const selectedLabel = selection?.type === 'label'
    ? textLabels.find(l => l.id === selection.labelId)
    : null

  const selectedTool = selection?.type === 'tool'
    ? placedTools.find(t => t.id === selection.toolId)
    : null

  const selectedHole = selection?.type === 'hole'
    ? placedTools
        .find(t => t.id === selection.toolId)
        ?.finger_holes.find(fh => fh.id === selection.holeId)
    : null
  const selectedHoleTool = selection?.type === 'hole' ? placedTools.find(t => t.id === selection.toolId) : null
  const cutoutTool = cutoutToolId ? placedTools.find(t => t.id === cutoutToolId) : null

  const updateSelectedLabel = (updates: Partial<TextLabel>) => {
    if (selection?.type !== 'label') return
    onTextLabelsChange(textLabels.map(l => {
      if (l.id !== selection.labelId) return l
      return { ...l, ...updates }
    }))
  }

  const setCutoutDepthOverride = (toolId: string, depth: number | null) => {
    onPlacedToolsChange(placedTools.map(t =>
      t.id === toolId ? { ...t, depth_override: depth } : t
    ))
  }

  const setHoleDepthOverride = (toolId: string, holeId: string, depth: number | null) => {
    onPlacedToolsChange(placedTools.map(t => {
      if (t.id !== toolId) return t
      return {
        ...t,
        finger_holes: t.finger_holes.map(fh =>
          fh.id === holeId ? { ...fh, depth_override: depth } : fh
        ),
      }
    }))
  }

  const updateSelectedHole = (updates: Partial<FingerHole>) => {
    if (selection?.type !== 'hole') return
    onPlacedToolsChange(placedTools.map(t => t.id === selection.toolId ? {
      ...t, finger_holes: t.finger_holes.map(fh => fh.id === selection.holeId ? { ...fh, ...updates, bin_override: true } : fh),
    } : t))
  }

  const removeSelectedHole = () => {
    if (selection?.type !== 'hole') return
    onPlacedToolsChange(placedTools.map(t => t.id === selection.toolId ? {
      ...t, finger_holes: t.finger_holes.filter(fh => fh.id !== selection.holeId || !fh.bin_override || !fh.id.startsWith('bin-fh-')).map(fh =>
        fh.id === selection.holeId ? { ...fh, disabled: true, bin_override: true } : fh),
    } : t))
    setSelection(null)
  }

  useDeleteShortcut(
    () => {
      if (selection?.type === 'tool') handleDeleteTool()
      if (selection?.type === 'label') handleDeleteLabel()
      if (selection?.type === 'hole') removeSelectedHole()
    },
    selection?.type === 'tool' || selection?.type === 'label' || selection?.type === 'hole',
  )

  const handleHoleClick = (toolId: string, holeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelection({ type: 'hole', toolId, holeId })
    if (activeTool !== 'select') return
    const hole = placedTools.find(t => t.id === toolId)?.finger_holes.find(fh => fh.id === holeId)
    if (!hole) return
    const pos = screenToMm(e.clientX, e.clientY)
    setDragging({ type: 'hole', toolId, holeId, startX: pos.x, startY: pos.y, origX: hole.x, origY: hole.y })
  }

  const handleHoleResizeMouseDown = (toolId: string, holeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const hole = placedTools.find(t => t.id === toolId)?.finger_holes.find(fh => fh.id === holeId)
    if (!hole) return
    setDragging({ type: 'resize-hole', toolId, holeId, centerX: hole.x, centerY: hole.y })
  }

  const handleEditingLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEditingLabel()
    if (e.key === 'Escape') { setEditingLabelId(null); setEditingText('') }
  }

  const handlePendingLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitPendingLabel()
    if (e.key === 'Escape') { setPendingLabel(null); setPendingText('') }
  }

  return (
    <div className="h-full w-full relative">
      {/* floating toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 glass-toolbar px-1.5 py-1 flex items-center gap-0.5">
        <BinEditorToolbar
          activeTool={activeTool}
          setActiveTool={changeActiveTool}
          onStartCutout={startCutout}
          snapEnabled={snapEnabled}
          setSnapEnabled={setSnapEnabled}
          snapGrid={snapGrid}
          setSnapGrid={setSnapGrid}
          handleRecenter={handleRecenter}
          selectedLabel={selectedLabel ?? null}
          onRemoveLabel={handleDeleteLabel}
          onUpdateLabel={updateSelectedLabel}
          cutoutShape={cutoutShape}
          onCutoutShapeChange={setCutoutShape}
        />
      </div>
      {(activeTool === 'choose-cutout-tool' || activeTool === 'cutout') && (
        <div role="status" className="absolute top-16 left-1/2 -translate-x-1/2 z-20 glass rounded-lg px-3 py-2 text-xs text-text-primary shadow-lg">
          {cutoutTool ? <>Placing {cutoutShapeLabel(cutoutShape)} for <strong>{cutoutTool.name}</strong>. Click anywhere in the bin, including beside its outline. Press Select to cancel.</> : 'Click a tool to choose which tool owns the cutout.'}
        </div>
      )}
      {selectedHole && selectedHoleTool && activeTool === 'select' && (
        <BinCutoutInspector
          hole={selectedHole} tool={selectedHoleTool} binDepth={defaultCutoutDepth} maxDepth={maxCutoutDepth}
          onUpdate={updateSelectedHole} onDepthChange={d => setHoleDepthOverride(selectedHoleTool.id, selectedHole.id, d)} onRemove={removeSelectedHole}
        />
      )}
      {selectedTool && activeTool === 'select' && (
        <BinToolInspector
          key={selectedTool.id} tool={selectedTool} binDepth={defaultCutoutDepth} maxDepth={maxCutoutDepth}
          smoothed={smoothedToolIds?.has(selectedTool.tool_id) ?? false} smoothLevel={smoothLevels?.get(selectedTool.tool_id) ?? 0.5}
          onToggleSmoothed={onToggleSmoothed} onSmoothLevelChange={onSmoothLevelChange}
          onDepthChange={d => setCutoutDepthOverride(selectedTool.id, d)} onEdit={onEditTool} onRemove={handleDeleteTool}
        />
      )}
      <BinEditorCanvas
        svgRef={svgRef}
        displayWidth={displayWidth}
        displayHeight={displayHeight}
        gridX={gridX}
        gridY={gridY}
        partialBins={partialBins}
        partialBinsValues={partialBinsValues}
        wallThickness={wallThickness}
        placedTools={placedTools}
        oversizedToolIds={oversizedToolIds}
        selection={selection}
        onHoleClick={handleHoleClick}
        textLabels={textLabels}
        editingLabelId={editingLabelId}
        editingText={editingText}
        pendingLabel={pendingLabel}
        pendingLabelText={pendingText}
        smoothedToolIds={smoothedToolIds}
        smoothLevels={smoothLevels}
        activeTool={activeTool}
        cutoutToolId={cutoutToolId}
        cutoutHover={cutoutHover}
        cutoutShape={cutoutShape}
        onCutoutHover={e => setCutoutHover(e ? screenToMm(e.clientX, e.clientY) : null)}
        onHoleResizeMouseDown={handleHoleResizeMouseDown}
        binWidthMm={binWidthMm}
        binHeightMm={binHeightMm}
        defaultCutoutDepth={defaultCutoutDepth}
        maxCutoutDepth={maxCutoutDepth}
        insertAllowance={insertAllowance}
        halfGridBase={halfGridBase}
        handleR={handleR}
        handleStroke={handleStroke}
        handleOffset={handleOffset}
        pendingInputRef={pendingInputRef}
        editInputRef={editInputRef}
        handleToolMouseDown={handleToolMouseDown}
        onChooseCutoutTool={handleChooseCutoutTool}
        handleRotateMouseDown={handleRotateMouseDown}
        handleLabelMouseDown={handleLabelMouseDown}
        handleLabelRotateMouseDown={handleLabelRotateMouseDown}
        handleLabelDoubleClick={handleLabelDoubleClick}
        handleBackgroundClick={handleBackgroundClick}
        stopClick={stopClick}
        stopClickUnlessText={stopClickUnlessText}
        onEditingTextChange={setEditingText}
        onEditingLabelKeyDown={handleEditingLabelKeyDown}
        onEditingLabelBlur={commitEditingLabel}
        onPendingTextChange={setPendingText}
        onPendingLabelKeyDown={handlePendingLabelKeyDown}
        onPendingLabelBlur={commitPendingLabel}
      />
    </div>
  )
}
