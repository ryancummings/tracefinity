import type { BinConfig, PlacedTool } from '@/types'
import { GRID_UNIT } from '@/lib/constants'

// Match the stacking-lip inset used by the backend's interior clipping rect.
const STACKING_LIP_INSET_MM = 2.6

export function toolsOutsidePrintableArea(
  tools: PlacedTool[],
  config: Pick<BinConfig, 'grid_x' | 'grid_y' | 'wall_thickness' | 'cutout_clearance' | 'stacking_lip'>,
): Set<string> {
  const inset = 0.25 + Math.max(config.wall_thickness, config.stacking_lip ? STACKING_LIP_INSET_MM : 0) + config.cutout_clearance
  const maxX = config.grid_x * GRID_UNIT - inset
  const maxY = config.grid_y * GRID_UNIT - inset
  return new Set(tools.filter(tool =>
    tool.points.some(point => point.x < inset || point.x > maxX || point.y < inset || point.y > maxY)
  ).map(tool => tool.id))
}
