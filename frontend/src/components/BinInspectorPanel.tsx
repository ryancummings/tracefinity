'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const COLLAPSE_KEY = 'tracefinity.binInspector.collapsed'

function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

interface Props {
  label: string
  title: React.ReactNode
  children: React.ReactNode
}

/**
 * Floating settings pane on the right of the bin editor. Collapsing it
 * leaves a small tab with the title, and the choice is remembered across
 * selections and visits so it stays out of the way while arranging.
 */
export function BinInspectorPanel({ label, title, children }: Props) {
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  const toggle = (next: boolean) => {
    setCollapsed(next)
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      // storage can be unavailable; the pane still toggles for this visit
    }
  }

  if (collapsed) {
    return (
      <aside aria-label={label} className="absolute right-3 top-16 z-20 max-w-60 rounded-xl border border-border bg-surface shadow-xl text-text-primary">
        <button
          type="button"
          onClick={() => toggle(false)}
          aria-expanded={false}
          title="Show settings"
          className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold"
        >
          <ChevronLeft className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
          <span className="truncate">{title}</span>
        </button>
      </aside>
    )
  }

  return (
    <aside aria-label={label} className="absolute right-3 top-16 z-20 w-60 max-h-[calc(100%-5rem)] overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-xl text-text-primary">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold min-w-0 break-words">{title}</h3>
        <button
          type="button"
          onClick={() => toggle(true)}
          aria-expanded={true}
          aria-label="Collapse settings"
          title="Collapse settings"
          className="-mr-1 -mt-0.5 p-1 rounded text-text-muted hover:text-text-primary hover:bg-elevated flex-shrink-0"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      {children}
    </aside>
  )
}
