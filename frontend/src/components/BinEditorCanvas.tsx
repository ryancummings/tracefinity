'use client'

import { RefObject } from 'react'
import type { CutoutShape, FingerHole, PlacedTool, TextLabel } from '@/types'
import { polygonPathData, smoothPathData, simplifyPolygon, smoothEpsilon } from '@/lib/svg'
import { GRID_UNIT, DISPLAY_SCALE } from '@/lib/constants'
import { CutoutOverlay } from '@/components/CutoutOverlay'
import { getCutoutDefaults } from '@/lib/settings'
import { isRectangularCutout } from '@/lib/cutouts'

type Tool = 'select' | 'text' | 'choose-cutout-tool' | 'cutout'

type Selection =
  | { type: 'tool'; toolId: string }
  | { type: 'hole'; toolId: string; holeId: string }
  | { type: 'label'; labelId: string }
  | null

interface Props {
  svgRef: RefObject<SVGSVGElement | null>
  displayWidth: number
  displayHeight: number
  gridX: number
  gridY: number
  partialBins: boolean
  partialBinsValues: boolean[]
  wallThickness: number
  placedTools: PlacedTool[]
  oversizedToolIds?: Set<string>
  selection: Selection
  textLabels: TextLabel[]
  editingLabelId: string | null
  editingText: string
  pendingLabel: { x: number; y: number } | null
  pendingLabelText: string
  smoothedToolIds?: Set<string>
  smoothLevels?: Map<string, number>
  activeTool: Tool
  cutoutToolId: string | null
  cutoutHover: { x: number; y: number } | null
  cutoutShape: CutoutShape
  onCutoutHover: (e: React.MouseEvent | null) => void
  onHoleResizeMouseDown: (toolId: string, holeId: string, e: React.MouseEvent) => void
  binWidthMm: number
  binHeightMm: number
  defaultCutoutDepth: number
  maxCutoutDepth: number
  insertAllowance: number
  halfGridBase?: boolean
  // handle sizing
  handleR: number
  handleStroke: number
  handleOffset: number
  // refs for inputs
  pendingInputRef: RefObject<HTMLInputElement | null>
  editInputRef: RefObject<HTMLInputElement | null>
  // event handlers
  handleToolMouseDown: (toolId: string) => (e: React.MouseEvent) => void
  onChooseCutoutTool: (toolId: string, e: React.MouseEvent) => void
  handleRotateMouseDown: (toolId: string) => (e: React.MouseEvent) => void
  handleLabelMouseDown: (labelId: string) => (e: React.MouseEvent) => void
  handleLabelRotateMouseDown: (labelId: string) => (e: React.MouseEvent) => void
  handleLabelDoubleClick: (labelId: string) => (e: React.MouseEvent) => void
  onHoleClick: (toolId: string, holeId: string, e: React.MouseEvent) => void
  handleBackgroundClick: (e: React.MouseEvent) => void
  stopClick: (e: React.MouseEvent) => void
  stopClickUnlessText: (e: React.MouseEvent) => void
  onEditingTextChange: (text: string) => void
  onEditingLabelKeyDown: (e: React.KeyboardEvent) => void
  onEditingLabelBlur: () => void
  onPendingTextChange: (text: string) => void
  onPendingLabelKeyDown: (e: React.KeyboardEvent) => void
  onPendingLabelBlur: () => void
}

export function BinEditorCanvas({
  svgRef,
  displayWidth,
  displayHeight,
  gridX,
  gridY,
  partialBins,
  partialBinsValues,
  wallThickness,
  placedTools,
  oversizedToolIds,
  selection,
  textLabels,
  editingLabelId,
  editingText,
  pendingLabel,
  pendingLabelText,
  smoothedToolIds,
  smoothLevels,
  activeTool,
  cutoutToolId,
  cutoutHover,
  cutoutShape,
  onCutoutHover,
  onHoleResizeMouseDown,
  binWidthMm,
  binHeightMm,
  defaultCutoutDepth,
  maxCutoutDepth,
  insertAllowance,
  halfGridBase,
  handleR,
  handleStroke,
  handleOffset,
  pendingInputRef,
  editInputRef,
  handleToolMouseDown,
  onChooseCutoutTool,
  handleRotateMouseDown,
  handleLabelMouseDown,
  handleLabelRotateMouseDown,
  handleLabelDoubleClick,
  onHoleClick,
  handleBackgroundClick,
  stopClick,
  stopClickUnlessText,
  onEditingTextChange,
  onEditingLabelKeyDown,
  onEditingLabelBlur,
  onPendingTextChange,
  onPendingLabelKeyDown,
  onPendingLabelBlur,
}: Props) {
  return (
    <>
      {/* SVG area */}
      <div className="absolute inset-0 bg-inset flex items-center justify-center p-4">
        <svg
          ref={svgRef}
          data-testid="bin-canvas"
          viewBox={`-10 -10 ${displayWidth + 70} ${displayHeight + 30}`}
          preserveAspectRatio="xMidYMid meet"
          className={`rounded max-w-full max-h-full ${activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
          style={{ overflow: 'visible' }}
          onClick={handleBackgroundClick}
          onMouseMove={e => { if (activeTool === 'cutout') onCutoutHover(e) }}
          onMouseLeave={() => onCutoutHover(null)}
        >
          <rect x="0" y="0" width={displayWidth} height={displayHeight} fill="rgb(30, 41, 59)" rx="4" />
          {/* full-grid lines at every 0.5-unit step up to gridX */}
          {Array.from({ length: Math.floor(gridX * 2) + 1 }).map((_, i) => {
            const pos = i * 0.5
            const isBoundary = pos === 0 || pos === gridX
            const isFullUnit = Number.isInteger(pos)
            if (!isBoundary && !isFullUnit && !halfGridBase) return null
            return (
              <line
                key={`v${i}`}
                x1={pos * GRID_UNIT * DISPLAY_SCALE} y1={0}
                x2={pos * GRID_UNIT * DISPLAY_SCALE} y2={displayHeight}
                stroke={isFullUnit ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}
                strokeWidth={1}
                strokeDasharray={isBoundary ? undefined : '4,4'}
              />
            )
          })}
          {Array.from({ length: Math.floor(gridY * 2) + 1 }).map((_, i) => {
            const pos = i * 0.5
            const isBoundary = pos === 0 || pos === gridY
            const isFullUnit = Number.isInteger(pos)
            if (!isBoundary && !isFullUnit && !halfGridBase) return null
            return (
              <line
                key={`h${i}`}
                x1={0} y1={pos * GRID_UNIT * DISPLAY_SCALE}
                x2={displayWidth} y2={pos * GRID_UNIT * DISPLAY_SCALE}
                stroke={isFullUnit ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}
                strokeWidth={1}
                strokeDasharray={isBoundary ? undefined : '4,4'}
              />
            )
          })}

          {/* disabled partial-bin cells */}
          {partialBins && Array.from({ length: gridY }).map((_, iy) =>
              Array.from({ length: gridX }).map((_, ix) => {
                  const enabled = partialBinsValues[iy * gridX + ix] ?? true;
                  if (enabled) return null;
                  const cell = GRID_UNIT * DISPLAY_SCALE;
                  return (
                      <rect
                          key={`partial-off-${ix}-${iy}`}
                          x={ix * cell}
                          y={iy * cell}
                          width={cell}
                          height={cell}
                          fill="rgba(239, 68, 68, 0.22)"
                          stroke="rgba(239, 68, 68, 0.1)"
                          strokeWidth={1}
                          className="pointer-events-none"
                      />
                  );
              }),
          )}

          {/* wall inset boundary */}
          {(() => {
            const inset = (wallThickness + 0.25) * DISPLAY_SCALE
            return (
              <rect
                x={inset} y={inset}
                width={displayWidth - 2 * inset} height={displayHeight - 2 * inset}
                fill="none" stroke="rgba(255,255,255,0.15)"
                strokeWidth={1} strokeDasharray="6,4"
              />
            )
          })()}

          {placedTools.map(tool => {
            let pathData: string
            if (smoothedToolIds?.has(tool.tool_id)) {
              const level = smoothLevels?.get(tool.tool_id) ?? 0.5
              pathData = smoothPathData(simplifyPolygon(tool.points, smoothEpsilon(level)), tool.interior_rings, DISPLAY_SCALE)
            } else {
              pathData = polygonPathData(tool.points, tool.interior_rings, DISPLAY_SCALE)
            }
            const isSelected = (selection?.type === 'tool' && selection.toolId === tool.id) || (activeTool === 'cutout' && cutoutToolId === tool.id)
            const isOversized = oversizedToolIds?.has(tool.id) ?? false

            return (
              <g key={tool.id} onClick={stopClickUnlessText}>
                {isOversized && <title>{tool.name} may be clipped outside the printable area</title>}
                <path
                  d={pathData}
                  fillRule="evenodd"
                  fill={isSelected ? 'rgb(51, 65, 85)' : 'rgb(71, 85, 105)'}
                  stroke={isOversized ? 'rgb(251, 191, 36)' : isSelected ? 'rgb(148, 163, 184)' : 'rgb(100, 116, 139)'}
                  strokeWidth={handleStroke}
                  strokeDasharray={isOversized ? '8,5' : undefined}
                  aria-label={isOversized ? `${tool.name} may be clipped outside the printable area` : undefined}
                  className={activeTool === 'select' ? 'cursor-move' : 'cursor-crosshair'}
                  onMouseDown={handleToolMouseDown(tool.id)}
                  onClick={activeTool === 'choose-cutout-tool' ? e => onChooseCutoutTool(tool.id, e) : stopClickUnlessText}
                />

              </g>
            )
          })}

          {/* Overlay cutouts after all outlines so another tool cannot hide them. */}
          {placedTools.map(tool => (
            <CutoutOverlay
              key={`holes-${tool.id}`}
              holes={tool.finger_holes}
              interactive={activeTool === 'select'}
              selectedId={selection?.type === 'hole' && selection.toolId === tool.id ? selection.holeId : undefined}
              editMode={activeTool}
              defaultCutoutDepth={tool.depth_override ?? defaultCutoutDepth}
              maxCutoutDepth={maxCutoutDepth}
              insertAllowance={insertAllowance}
              onMouseDown={(holeId, e) => onHoleClick(tool.id, holeId, e)}
              onClick={stopClick}
            />
          ))}

          {selection?.type === 'hole' && activeTool === 'select' && (() => {
            const hole = placedTools.find(t => t.id === selection.toolId)?.finger_holes.find(h => h.id === selection.holeId)
            if (!hole || isRectangularCutout(hole.shape)) return null
            return <circle aria-label="Resize cutout" cx={(hole.x + hole.radius) * DISPLAY_SCALE} cy={hole.y * DISPLAY_SCALE} r={Math.max(7, handleR * 0.45)} fill="rgb(90, 180, 222)" stroke="white" strokeWidth={2} className="cursor-ew-resize" onMouseDown={e => onHoleResizeMouseDown(selection.toolId, hole.id, e)} onClick={stopClick} />
          })()}

          {activeTool === 'cutout' && cutoutToolId && cutoutHover && cutoutHover.x >= 0 && cutoutHover.y >= 0 && cutoutHover.x <= binWidthMm && cutoutHover.y <= binHeightMm && (
            <g opacity={0.55} className="pointer-events-none">
              <CutoutOverlay holes={[{ id: 'cutout-preview', ...cutoutHover, shape: cutoutShape, rotation: 0, ...getCutoutDefaults(cutoutShape) } as FingerHole]} />
            </g>
          )}

          {/* text labels */}
          {textLabels.map(label => {
            const x = label.x * DISPLAY_SCALE
            const y = label.y * DISPLAY_SCALE
            const fontSize = label.font_size * DISPLAY_SCALE
            const isSelected = selection?.type === 'label' && selection.labelId === label.id
            const isEditing = editingLabelId === label.id
            const hitH = Math.max(fontSize * 1.4, handleR * 2)
            const hitW = Math.max(fontSize * label.text.length * 0.7, handleR * 4)

            return (
              <g key={label.id} transform={label.rotation !== 0 ? `rotate(${label.rotation} ${x} ${y})` : undefined}>
                <rect
                  x={x - hitW / 2} y={y - hitH / 2}
                  width={hitW} height={hitH}
                  fill="transparent"
                  className="cursor-move"
                  onMouseDown={handleLabelMouseDown(label.id)}
                  onDoubleClick={handleLabelDoubleClick(label.id)}
                  onClick={stopClick}
                />
                {!isEditing && (
                  <text
                    x={x} y={y}
                    textAnchor="middle" dominantBaseline="central"
                    fill={isSelected ? 'rgb(13, 148, 136)' : 'rgb(20, 184, 166)'}
                    stroke={isSelected ? 'rgb(13, 148, 136)' : 'none'}
                    strokeWidth={isSelected ? 0.5 : 0}
                    fontSize={fontSize} fontWeight="600" fontFamily="Arial, sans-serif"
                    className="pointer-events-none"
                  >
                    {label.text}
                  </text>
                )}
              </g>
            )
          })}

          {/* selection handles: tool */}
          {selection?.type === 'tool' && (() => {
            const tool = placedTools.find(t => t.id === selection.toolId)
            if (!tool) return null
            const pad = handleR * 0.4
            let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity
            for (const p of tool.points) {
              bMinX = Math.min(bMinX, p.x); bMinY = Math.min(bMinY, p.y)
              bMaxX = Math.max(bMaxX, p.x); bMaxY = Math.max(bMaxY, p.y)
            }
            const dMinX = bMinX * DISPLAY_SCALE - pad
            const dMinY = bMinY * DISPLAY_SCALE - pad
            const dMaxX = bMaxX * DISPLAY_SCALE + pad
            const dMaxY = bMaxY * DISPLAY_SCALE + pad
            const cornerSize = handleR * 2
            const cornerLen = handleR * 0.7
            const corners = [
              { x: dMinX, y: dMinY },
              { x: dMaxX, y: dMinY },
              { x: dMaxX, y: dMaxY },
              { x: dMinX, y: dMaxY },
            ]
            return (
              <g>
                <rect
                  x={dMinX} y={dMinY}
                  width={dMaxX - dMinX} height={dMaxY - dMinY}
                  fill="none" stroke="rgba(90, 180, 222, 0.3)" strokeWidth={handleStroke}
                  strokeDasharray={`${handleR * 0.4},${handleR * 0.25}`}
                  className="pointer-events-none"
                />
                {corners.map((c, i) => {
                  const dx = i === 0 || i === 3 ? 1 : -1
                  const dy = i < 2 ? 1 : -1
                  const arcR = cornerLen
                  return (
                    <g key={i}>
                      <path
                        d={`M${c.x},${c.y + dy * arcR} A${arcR},${arcR} 0 0 ${dy * dx > 0 ? 1 : 0} ${c.x + dx * arcR},${c.y}`}
                        fill="none" stroke="rgba(90, 180, 222, 0.5)" strokeWidth={handleStroke}
                        className="pointer-events-none"
                      />
                      <rect
                        x={c.x - cornerSize / 2} y={c.y - cornerSize / 2}
                        width={cornerSize} height={cornerSize}
                        fill="transparent"
                        className="cursor-rotate"
                        onMouseDown={handleRotateMouseDown(tool.id)}
                        onClick={stopClick}
                      />
                    </g>
                  )
                })}
              </g>
            )
          })()}

          {/* selection handles: label */}
          {selection?.type === 'label' && !editingLabelId && (() => {
            const label = textLabels.find(l => l.id === selection.labelId)
            if (!label) return null
            const x = label.x * DISPLAY_SCALE
            const y = label.y * DISPLAY_SCALE
            const fontSize = label.font_size * DISPLAY_SCALE
            const hitH = Math.max(fontSize * 1.4, handleR * 2)
            const hitW = Math.max(fontSize * label.text.length * 0.7, handleR * 4)
            const pad = handleR * 0.3
            const bMinX = x - hitW / 2 - pad
            const bMinY = y - hitH / 2 - pad
            const bMaxX = x + hitW / 2 + pad
            const bMaxY = y + hitH / 2 + pad
            const cornerSize = handleR * 2
            const cornerLen = handleR * 0.7
            const corners = [
              { x: bMinX, y: bMinY },
              { x: bMaxX, y: bMinY },
              { x: bMaxX, y: bMaxY },
              { x: bMinX, y: bMaxY },
            ]
            return (
              <g transform={label.rotation !== 0 ? `rotate(${label.rotation} ${x} ${y})` : undefined}>
                <rect
                  x={bMinX} y={bMinY}
                  width={bMaxX - bMinX} height={bMaxY - bMinY}
                  fill="none" stroke="rgba(13, 148, 136, 0.4)" strokeWidth={handleStroke}
                  strokeDasharray={`${handleR * 0.4},${handleR * 0.25}`}
                  className="pointer-events-none"
                />
                {corners.map((c, i) => {
                  const dx = i === 0 || i === 3 ? 1 : -1
                  const dy = i < 2 ? 1 : -1
                  const arcR = cornerLen
                  return (
                    <g key={i}>
                      <path
                        d={`M${c.x},${c.y + dy * arcR} A${arcR},${arcR} 0 0 ${dy * dx > 0 ? 1 : 0} ${c.x + dx * arcR},${c.y}`}
                        fill="none" stroke="rgba(13, 148, 136, 0.5)" strokeWidth={handleStroke}
                        className="pointer-events-none"
                      />
                      <rect
                        x={c.x - cornerSize / 2} y={c.y - cornerSize / 2}
                        width={cornerSize} height={cornerSize}
                        fill="transparent"
                        className="cursor-rotate"
                        onMouseDown={handleLabelRotateMouseDown(label.id)}
                        onClick={stopClick}
                      />
                    </g>
                  )
                })}
              </g>
            )
          })()}

          {editingLabelId && (() => {
            const label = textLabels.find(l => l.id === editingLabelId)
            if (!label) return null
            const x = label.x * DISPLAY_SCALE
            const y = label.y * DISPLAY_SCALE
            return (
              <foreignObject
                x={x - 400} y={y - 50}
                width={800} height={100}
                transform={label.rotation !== 0 ? `rotate(${label.rotation} ${x} ${y})` : undefined}
              >
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingText}
                  onChange={e => onEditingTextChange(e.target.value)}
                  onKeyDown={onEditingLabelKeyDown}
                  onBlur={onEditingLabelBlur}
                  onClick={stopClick}
                  className="w-full bg-elevated border-2 border-accent rounded-lg text-text-primary outline-none"
                  style={{ fontSize: '48px', padding: '12px 20px', height: '100%', boxSizing: 'border-box', textAlign: 'center' }}
                />
              </foreignObject>
            )
          })()}

          {pendingLabel && (
            <foreignObject
              x={pendingLabel.x * DISPLAY_SCALE - 400}
              y={pendingLabel.y * DISPLAY_SCALE - 50}
              width={800} height={100}
            >
              <input
                ref={pendingInputRef}
                type="text"
                value={pendingLabelText}
                onChange={e => onPendingTextChange(e.target.value)}
                onKeyDown={onPendingLabelKeyDown}
                onBlur={onPendingLabelBlur}
                onClick={stopClick}
                placeholder="Type label text, press Enter..."
                className="w-full bg-elevated border-2 border-accent rounded-lg text-text-primary outline-none"
                style={{ fontSize: '48px', padding: '12px 20px', height: '100%', boxSizing: 'border-box', textAlign: 'center' }}
              />
            </foreignObject>
          )}
        </svg>
      </div>

    </>
  )
}
