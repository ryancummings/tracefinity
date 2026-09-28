import { describe, expect, it } from 'vitest'
import type { PlacedTool } from '@/types'
import { FACTORY_BIN_CONFIG } from './binDefaults'
import { toolsOutsidePrintableArea } from './binSizing'

function tool(id: string, x1: number, y1: number, x2: number, y2: number): PlacedTool {
  return {
    id, tool_id: id, name: id, rotation: 0,
    points: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }],
    finger_holes: [], interior_rings: [],
  }
}

describe('toolsOutsidePrintableArea', () => {
  it('marks only the tool that crosses the printable boundary', () => {
    const config = { ...FACTORY_BIN_CONFIG, grid_x: 4, grid_y: 3 }
    const result = toolsOutsidePrintableArea([
      tool('fits', 10, 10, 100, 80),
      tool('overhangs', -16, 10, 184, 80),
    ], config)

    expect([...result]).toEqual(['overhangs'])
  })

  it('includes clearance and the stacking lip in the printable margin', () => {
    const config = { ...FACTORY_BIN_CONFIG, grid_x: 2, grid_y: 2, wall_thickness: 1.6, cutout_clearance: 1 }
    const nearEdge = tool('near-edge', 3, 10, 40, 40)

    expect(toolsOutsidePrintableArea([nearEdge], config).has('near-edge')).toBe(true)
    expect(toolsOutsidePrintableArea([nearEdge], { ...config, stacking_lip: false }).has('near-edge')).toBe(false)
  })
})
