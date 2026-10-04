'use client'

import { useEffect, useRef, useState } from 'react'
import type { Point } from '@/types'
import { erasePoints } from '@/lib/outlineEdit'
import { ERASER_DEFAULT, ERASER_MAX, ERASER_MIN } from '@/lib/constants'

export interface EraserOutline {
  points: Point[]
  interior_rings: Point[][]
}

export interface EraserBrush {
  x: number
  y: number
  // radius in outline units
  r: number
  pressed: boolean
}

interface Options {
  active: boolean
  // client pixels to outline units; read at event time, so a zoom mid-stroke keeps the stroke going
  toOutline: (clientX: number, clientY: number) => Point
  unitsPerPixel: () => number
  current: () => EraserOutline
  // the stroke so far, shown without touching history
  onPreview: (outline: EraserOutline) => void
  // one call per stroke that erased something
  onCommit: (outline: EraserOutline, start: EraserOutline) => void
  // a held pan key leaves the pointer to the canvas
  blocked?: () => boolean
}

/**
 * Point-eraser brush for a single outline: drag deletes the vertices under a
 * round brush sized in screen pixels. A stroke previews as it goes and
 * commits once when it ends, however it ends.
 */
export function useOutlineEraser(options: Options) {
  const [size, setSize] = useState(ERASER_DEFAULT)
  // the brush position, with the outline units per pixel when it was sampled
  const [brush, setBrush] = useState<{ x: number; y: number; unitsPerPixel: number; pressed: boolean } | null>(null)
  const optionsRef = useRef(options)
  const sizeRef = useRef(size)
  useEffect(() => { optionsRef.current = options })
  useEffect(() => { sizeRef.current = size }, [size])
  const strokeRef = useRef<{ start: EraserOutline; outline: EraserOutline; last: Point } | null>(null)

  const sample = (e: { clientX: number; clientY: number }) => {
    const o = optionsRef.current
    const unitsPerPixel = o.unitsPerPixel()
    return { p: o.toOutline(e.clientX, e.clientY), r: sizeRef.current * unitsPerPixel, unitsPerPixel }
  }

  // sweep from the last sample so a fast drag misses nothing in between
  const sweep = (to: Point, r: number) => {
    const stroke = strokeRef.current
    if (!stroke) return
    const [next] = erasePoints([stroke.outline], stroke.last, to, r)
    stroke.last = to
    if (next === stroke.outline) return
    stroke.outline = next
    optionsRef.current.onPreview(next)
  }

  // pointer events so the brush works with mouse, touch and pen
  const onPointerDown = (e: React.PointerEvent) => {
    const o = optionsRef.current
    if (!o.active || e.isPrimary === false || e.button !== 0 || o.blocked?.()) return
    e.preventDefault()
    e.stopPropagation()
    const { p, r, unitsPerPixel } = sample(e)
    const start = o.current()
    strokeRef.current = { start, outline: start, last: p }
    sweep(p, r)
    setBrush({ x: p.x, y: p.y, unitsPerPixel, pressed: true })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!options.active || brush?.pressed) return
    const { p, unitsPerPixel } = sample(e)
    setBrush({ x: p.x, y: p.y, unitsPerPixel, pressed: false })
  }

  const onPointerLeave = () => {
    if (!brush?.pressed) setBrush(null)
  }

  // a drag keeps erasing past the canvas edge
  const erasing = options.active && !!brush?.pressed
  useEffect(() => {
    if (!erasing) return
    const move = (e: PointerEvent) => {
      if (e.isPrimary === false) return
      const { p, r, unitsPerPixel } = sample(e)
      sweep(p, r)
      setBrush({ x: p.x, y: p.y, unitsPerPixel, pressed: true })
    }
    const end = () => setBrush(b => (b ? { ...b, pressed: false } : b))
    // finish the sweep at the release point, which may not have had a move event
    const up = (e: PointerEvent) => {
      if (e.isPrimary === false) return
      const { p, r } = sample(e)
      sweep(p, r)
      end()
    }
    // undo or redo mid-drag would rewrite history under the stroke
    const blockHistoryKeys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keydown', blockHistoryKeys, { capture: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('keydown', blockHistoryKeys, { capture: true })
      // release, cancel, a mode switch or unmount: what the stroke erased
      // becomes one undo step rather than an unrecorded change
      const stroke = strokeRef.current
      strokeRef.current = null
      if (stroke && stroke.outline !== stroke.start) optionsRef.current.onCommit(stroke.outline, stroke.start)
    }
    // sample and sweep read everything through refs, so a new zoom or
    // history callback does not end the stroke
  }, [erasing])

  // [ and ] resize the brush
  useEffect(() => {
    if (!options.active) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === '[') setSize(s => Math.max(ERASER_MIN, s - 4))
      if (e.key === ']') setSize(s => Math.min(ERASER_MAX, s + 4))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [options.active])

  return {
    size,
    setSize,
    brush: options.active && brush
      ? { x: brush.x, y: brush.y, r: size * brush.unitsPerPixel, pressed: brush.pressed } satisfies EraserBrush
      : null,
    onPointerDown,
    onPointerMove,
    onPointerLeave,
  }
}
