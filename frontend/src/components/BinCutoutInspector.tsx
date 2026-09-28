'use client'

import type { CutoutShape, FingerHole, PlacedTool } from '@/types'
import { NumericInput } from '@/components/NumericInput'
import { isRectangularCutout } from '@/lib/cutouts'

interface Props {
  hole: FingerHole
  tool: PlacedTool
  binDepth: number
  maxDepth: number
  onUpdate: (updates: Partial<FingerHole>) => void
  onDepthChange: (depth: number | null) => void
  onRemove: () => void
}

const inputClass = 'w-16 rounded bg-elevated px-2 py-1 text-right text-xs text-text-primary border border-border-subtle'

export function BinCutoutInspector({ hole, tool, binDepth, maxDepth, onUpdate, onDepthChange, onRemove }: Props) {
  const shape = hole.shape ?? 'circle'
  const isRect = isRectangularCutout(shape)
  const inheritedDepth = Math.min(maxDepth, Math.max(5, tool.depth_override ?? binDepth))
  const effectiveDepth = Math.min(maxDepth, Math.max(Math.min(5, maxDepth), hole.depth_override ?? inheritedDepth))
  const displayRotation = ((hole.rotation ?? 0) % 360 + 540) % 360 - 180
  const changeShape = (next: CutoutShape) => {
    const updates: Partial<FingerHole> = { shape: next }
    if (isRectangularCutout(next) && !isRect) {
      updates.width = hole.radius * 2
      updates.height = hole.radius * 2
    } else if (!isRectangularCutout(next) && isRect) {
      updates.radius = Math.max(hole.width ?? 0, hole.height ?? 0) / 2 || hole.radius
    }
    onUpdate(updates)
  }

  return (
    <aside aria-label="Cutout settings" className="absolute right-3 top-16 z-20 w-60 max-h-[calc(100%-5rem)] overflow-y-auto glass rounded-xl p-3 shadow-xl text-text-primary">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Cutout for {tool.name}</h3>
        <p className="text-[11px] text-text-muted">Drag the cutout to move it. Drag its edge handle to resize round cutouts.</p>
      </div>
      <label className="block text-xs text-text-muted mb-3">Shape
        <select aria-label="Selected cutout shape" value={shape} onChange={e => changeShape(e.target.value as CutoutShape)} className="mt-1 w-full rounded bg-elevated px-2 py-1.5 text-xs text-text-primary border border-border-subtle">
          <option value="scoop">Finger scoop</option><option value="circle">Sphere</option><option value="cylinder">Cylinder</option><option value="square">Square</option><option value="rectangle">Rectangle</option><option value="filleted_rectangle">Filleted rectangle</option>
        </select>
      </label>
      <div className="space-y-2">
        {isRect ? (['width', 'height'] as const).map(dim => (
          <label key={dim} className="flex items-center justify-between text-xs capitalize">{dim} (mm)
            <NumericInput value={hole[dim] ?? hole.radius * 2} min={1} max={200} step={0.5} onChange={v => onUpdate({ [dim]: v })} className={inputClass} />
          </label>
        )) : (
          <label className="flex items-center justify-between text-xs">{shape === 'square' ? 'Side' : 'Diameter'} (mm)
            <NumericInput value={hole.radius * 2} min={1} max={200} step={0.5} onChange={v => onUpdate({ radius: v / 2 })} className={inputClass} />
          </label>
        )}
        <label className="flex items-center justify-between text-xs">X (mm)
          <NumericInput value={hole.x} min={0} max={1000} step={0.5} onChange={v => onUpdate({ x: v })} className={inputClass} />
        </label>
        <label className="flex items-center justify-between text-xs">Y (mm)
          <NumericInput value={hole.y} min={0} max={1000} step={0.5} onChange={v => onUpdate({ y: v })} className={inputClass} />
        </label>
        {(shape === 'square' || isRect) && (
          <label className="flex items-center justify-between text-xs">Rotation (°)
            <NumericInput value={displayRotation} min={-180} max={180} step={1} onChange={v => onUpdate({ rotation: v })} className={inputClass} />
          </label>
        )}
        <label className="flex items-center justify-between text-xs">Depth (mm)
          <NumericInput value={effectiveDepth} min={Math.min(5, maxDepth)} max={maxDepth} step={0.25} onChange={onDepthChange} className={inputClass} />
        </label>
        {hole.depth_override != null && hole.depth_override > maxDepth && <p className="text-[11px] text-text-muted">Limited by bin depth to {effectiveDepth.toFixed(2)} mm.</p>}
        {hole.depth_override != null && <button className="text-xs text-accent" onClick={() => onDepthChange(null)}>Use inherited depth ({inheritedDepth.toFixed(2)} mm)</button>}
      </div>
      <button onClick={onRemove} data-delete-shortcut aria-label="Remove cutout" className="mt-4 w-full rounded border border-red-800 px-2 py-1.5 text-xs text-red-400 hover:bg-red-900/20">Remove cutout</button>
    </aside>
  )
}
