'use client'

import type { PlacedTool } from '@/types'
import { NumericInput } from '@/components/NumericInput'

interface Props {
  tool: PlacedTool
  binDepth: number
  maxDepth: number
  smoothed: boolean
  smoothLevel: number
  onToggleSmoothed?: (toolId: string, smoothed: boolean) => void
  onSmoothLevelChange?: (toolId: string, level: number) => void
  onDepthChange: (depth: number | null) => void
  onEdit?: (toolId: string) => void
  onRemove: () => void
}

export function BinToolInspector({ tool, binDepth, maxDepth, smoothed, smoothLevel, onToggleSmoothed, onSmoothLevelChange, onDepthChange, onEdit, onRemove }: Props) {
  const clampDepth = (value: number) => Math.min(maxDepth, Math.max(Math.min(5, maxDepth), value))
  const defaultDepth = clampDepth(binDepth)
  const effectiveDepth = clampDepth(tool.depth_override ?? binDepth)

  return (
    <aside aria-label="Tool settings" className="absolute right-3 top-16 z-20 w-60 max-h-[calc(100%-5rem)] overflow-y-auto glass rounded-xl p-3 shadow-xl text-text-primary">
      <h3 className="text-sm font-semibold mb-1">{tool.name}</h3>
      <p className="text-[11px] text-text-muted mb-3">Settings for this tool in this bin.</p>
      <label className="flex items-center justify-between text-xs gap-2">Tool pocket depth (mm)
        <NumericInput value={effectiveDepth} min={Math.min(5, maxDepth)} max={maxDepth} step={0.25}
          onChange={onDepthChange} className="w-16 rounded bg-elevated px-2 py-1 text-right text-xs text-text-primary border border-border-subtle" />
      </label>
      <p className="text-[11px] text-text-muted mt-1">The pocket under this tool. Bin default: {defaultDepth.toFixed(2)} mm.</p>
      {tool.depth_override != null && <button className="mt-1 text-xs text-accent" onClick={() => onDepthChange(null)}>Use bin default</button>}
      {tool.depth_override != null && tool.depth_override > maxDepth && <p className="text-[11px] text-text-muted">Limited by bin depth to {effectiveDepth.toFixed(2)} mm.</p>}
      {onToggleSmoothed && (
        <div className="mt-4">
          <span className="text-xs text-text-muted">Outline</span>
          <div className="mt-1 flex rounded border border-glass-border overflow-hidden">
            <button onClick={() => onToggleSmoothed(tool.tool_id, false)} className={`flex-1 px-2 py-1 text-xs ${!smoothed ? 'bg-accent text-white' : 'text-text-muted'}`}>Accurate</button>
            <button onClick={() => onToggleSmoothed(tool.tool_id, true)} className={`flex-1 px-2 py-1 text-xs ${smoothed ? 'bg-accent text-white' : 'text-text-muted'}`}>Smooth</button>
          </div>
          {smoothed && onSmoothLevelChange && <input aria-label="Smooth level" type="range" min={0} max={1} step={0.05} value={smoothLevel}
            onChange={e => onSmoothLevelChange(tool.tool_id, parseFloat(e.target.value))} className="mt-2 w-full accent-accent" />}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {onEdit && <button onClick={() => onEdit(tool.tool_id)} className="flex-1 rounded border border-border-subtle px-2 py-1.5 text-xs text-accent">Edit source</button>}
        <button onClick={onRemove} data-delete-shortcut aria-label="Remove tool" className="flex-1 rounded border border-red-800 px-2 py-1.5 text-xs text-red-400">Remove</button>
      </div>
    </aside>
  )
}
