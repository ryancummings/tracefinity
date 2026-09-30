'use client'

import { useMemo, useState } from 'react'
import type { Polygon } from '@/types'
import { labelAnchor } from '@/lib/outlineEdit'

interface Props {
  polygons: Polygon[]
  viewBox: { x: number; y: number; w: number; h: number }
  onLabelChange: (id: string, label: string) => void
  included?: (id: string) => boolean
  hovered?: string | null
  onHoveredChange?: (id: string | null) => void
  // chips stay visible but let drawing gestures pass through
  interactive: boolean
}

/** Tool names drawn over each outline; click one to rename it in place. */
export function OutlineLabels({ polygons, viewBox, onLabelChange, included, hovered, onHoveredChange, interactive }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const anchors = useMemo(
    () => new Map(polygons.map(p => [p.id, labelAnchor(p.points, p.interior_rings)])),
    [polygons],
  )

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {polygons.map((poly, index) => {
        const anchor = anchors.get(poly.id)
        if (!anchor) return null
        const left = ((anchor.x - viewBox.x) / viewBox.w) * 100
        const top = ((anchor.y - viewBox.y) / viewBox.h) * 100
        const name = poly.label.trim() || `tool ${index + 1}`
        const active = included?.(poly.id) || hovered === poly.id
        const editing = editingId === poly.id
        return (
          <div
            key={poly.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 ${interactive || editing ? 'pointer-events-auto' : ''}`}
            style={{ left: `${left}%`, top: `${top}%` }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onMouseEnter={() => onHoveredChange?.(poly.id)}
            onMouseLeave={() => onHoveredChange?.(null)}
          >
            {editing ? (
              <input
                type="text"
                defaultValue={poly.label}
                aria-label={`Rename ${name}`}
                autoFocus
                onFocus={e => e.currentTarget.select()}
                onBlur={e => {
                  onLabelChange(poly.id, e.currentTarget.value)
                  setEditingId(null)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') {
                    e.currentTarget.value = poly.label
                    e.currentTarget.blur()
                  }
                }}
                size={Math.max(6, name.length + 1)}
                className="px-2 py-0.5 rounded-md text-xs font-medium bg-surface text-text-primary border border-accent shadow-lg outline-none"
              />
            ) : (
              <button
                type="button"
                title="Click to rename"
                aria-label={`Rename ${name}`}
                onClick={() => setEditingId(poly.id)}
                className={`max-w-[160px] truncate px-2 py-0.5 rounded-md text-xs font-medium shadow-md backdrop-blur-sm transition-colors cursor-text ${
                  active
                    ? 'bg-accent text-white'
                    : 'bg-slate-950/70 text-white hover:bg-slate-950/85'
                }`}
              >
                {name}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
