'use client'

import { MousePointer2, Trash2, Magnet, Type, Maximize2 } from 'lucide-react'
import type { CutoutShape, TextLabel } from '@/types'
import { SNAP_GRID_MIN, SNAP_GRID_MAX } from '@/lib/constants'
import { NumericInput } from '@/components/NumericInput'

type Tool = 'select' | 'text' | 'choose-cutout-tool' | 'cutout'

interface Props {
  activeTool: Tool
  setActiveTool: (tool: Tool) => void
  onStartCutout: () => void
  snapEnabled: boolean
  setSnapEnabled: (enabled: boolean) => void
  snapGrid: number
  setSnapGrid: (grid: number) => void
  handleRecenter: () => void
  selectedLabel: TextLabel | null
  onRemoveLabel: () => void
  onUpdateLabel: (updates: Partial<TextLabel>) => void
  cutoutShape: CutoutShape
  onCutoutShapeChange: (shape: CutoutShape) => void
}

const tbBtn = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap'
const tbActive = 'bg-accent-muted text-accent'
const tbInactive = 'text-text-muted hover:text-text-secondary hover:bg-[rgba(255,255,255,0.03)]'

export function BinEditorToolbar({
  activeTool,
  setActiveTool,
  onStartCutout,
  snapEnabled,
  setSnapEnabled,
  snapGrid,
  setSnapGrid,
  handleRecenter,
  selectedLabel,
  onRemoveLabel,
  onUpdateLabel,
  cutoutShape,
  onCutoutShapeChange,
}: Props) {
  return (
    <>
      <button
        onClick={() => setActiveTool('select')}
        className={`${tbBtn} ${activeTool === 'select' ? tbActive : tbInactive}`}
        title="Select & move tools"
      >
        <MousePointer2 className="w-3.5 h-3.5" />
        Select
      </button>
      <button
        onClick={() => setActiveTool('text')}
        className={`${tbBtn} ${activeTool === 'text' ? tbActive : tbInactive}`}
        title="Place text label"
      >
        <Type className="w-3.5 h-3.5" />
        Text
      </button>
      <label className="text-[11px] text-text-muted flex items-center gap-1">
        <button onClick={onStartCutout} className={`${tbBtn} ${activeTool === 'cutout' || activeTool === 'choose-cutout-tool' ? tbActive : tbInactive}`} title="Add cutout to a tool">Add cutout</button>
        <select aria-label="Cutout shape" value={cutoutShape} onChange={e => onCutoutShapeChange(e.target.value as CutoutShape)} className="bg-elevated text-text-primary rounded px-1 py-1">
          <option value="scoop">Finger scoop</option><option value="circle">Sphere</option><option value="cylinder">Cylinder</option><option value="square">Square</option><option value="rectangle">Rectangle</option><option value="filleted_rectangle">Filleted rectangle</option>
        </select>
      </label>

      <div className="w-px h-4 bg-glass-border mx-1 flex-shrink-0" />

      <button
        onClick={() => setSnapEnabled(!snapEnabled)}
        className={`${tbBtn} ${snapEnabled ? 'text-accent' : tbInactive}`}
        title={`Snap to ${snapGrid}mm grid${snapEnabled ? ' (on)' : ' (off)'}`}
      >
        <Magnet className="w-3.5 h-3.5" />
        Snap
      </button>
      {snapEnabled && (
        <NumericInput
          value={snapGrid}
          onChange={setSnapGrid}
          min={SNAP_GRID_MIN}
          max={SNAP_GRID_MAX}
          step={0.5}
          title="Snap distance (mm) — how far apart the snap grid points are"
          className="w-12 px-1 py-1 bg-elevated border border-border-subtle rounded-[6px] text-text-primary text-[10px] text-center outline-none focus:border-accent"
        />
      )}
      <button
        onClick={handleRecenter}
        className={`${tbBtn} ${tbInactive}`}
        title="Recenter view"
      >
        <Maximize2 className="w-3.5 h-3.5" />
        Recenter
      </button>

      {selectedLabel && (
        <>
          <div className="w-px h-4 bg-glass-border mx-1 flex-shrink-0" />
          <input
            type="text"
            value={selectedLabel.text}
            onChange={e => onUpdateLabel({ text: e.target.value })}
            className="w-24 px-2 py-1 bg-elevated border border-border-subtle rounded-[6px] text-text-primary text-[11px] outline-none focus:border-accent"
            placeholder="Label text"
          />
          <div className="flex items-center gap-0.5 text-[10px] text-text-muted" title="Text size">
            <span>Size</span>
            <NumericInput
              value={selectedLabel.font_size}
              onChange={v => onUpdateLabel({ font_size: v })}
              className="w-10 px-1 py-1 bg-elevated border border-border-subtle rounded-[6px] text-text-primary text-[10px] text-center outline-none focus:border-accent"
              min={1} max={50} step={0.5}
            />
          </div>
          <div className="flex items-center gap-0.5 text-[10px] text-text-muted" title="Depth into surface">
            <span>Depth</span>
            <NumericInput
              value={selectedLabel.depth}
              onChange={v => onUpdateLabel({ depth: v })}
              className="w-10 px-1 py-1 bg-elevated border border-border-subtle rounded-[6px] text-text-primary text-[10px] text-center outline-none focus:border-accent"
              min={0.1} max={5} step={0.1}
            />
          </div>
          <div className="flex items-center rounded-[6px] overflow-hidden border border-glass-border">
            <button
              onClick={() => onUpdateLabel({ emboss: true })}
              className={`px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                selectedLabel.emboss ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Emboss
            </button>
            <button
              onClick={() => onUpdateLabel({ emboss: false })}
              className={`px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                !selectedLabel.emboss ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Recess
            </button>
          </div>
          <button onClick={onRemoveLabel} data-delete-shortcut aria-label="Remove label" className={`${tbBtn} text-red-400 hover:bg-red-900/20`}>
            <Trash2 className="w-3 h-3" />
          </button>
        </>
      )}

    </>
  )
}
