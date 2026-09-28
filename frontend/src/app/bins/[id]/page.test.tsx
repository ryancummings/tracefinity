// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BinData, PlacedTool, ToolSummary } from '@/types'
import { FACTORY_BIN_CONFIG } from '@/lib/binDefaults'
import BinPage from './page'
import { getBin, listTools, updateBin } from '@/lib/api'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'bin-1' }),
}))

vi.mock('@/hooks/useProjectSource', () => ({
  useProjectSource: () => ({ rootLabel: 'Bins', rootHref: '/', scopedHref: (path: string) => path }),
}))

vi.mock('@/lib/api', () => ({
  getBin: vi.fn(),
  listTools: vi.fn(),
  updateBin: vi.fn().mockResolvedValue(undefined),
  generateBinStl: vi.fn().mockResolvedValue({ stl_url: '/test.stl' }),
  getImageUrl: (url: string) => url,
  getBinStlUrl: vi.fn(),
  getBinZipUrl: vi.fn(),
  getBinThreemfUrl: vi.fn(),
  getBinInsertUrl: vi.fn(),
  updateTool: vi.fn(),
}))

vi.mock('@/components/BinEditor', () => ({
  BinEditor: ({ placedTools }: { placedTools: PlacedTool[] }) => (
    <output data-testid="placed-rings">{JSON.stringify(placedTools[0]?.interior_rings)}</output>
  ),
}))

vi.mock('@/components/BinConfigurator', () => ({
  calcMaxCutoutDepth: () => 20,
  BinConfigurator: ({ config, autoSize, onAutoSizeChange }: {
    config: BinData['bin_config']
    autoSize: boolean
    onAutoSizeChange: (value: boolean) => void
  }) => (
    <div>
      <output data-testid="grid-size">{config.grid_x}x{config.grid_y}</output>
      <output data-testid="auto-size">{String(autoSize)}</output>
      <button onClick={() => onAutoSizeChange(!autoSize)}>Toggle auto size</button>
    </div>
  ),
}))

vi.mock('@/components/BinPreview3D', () => ({ BinPreview3D: () => null }))
vi.mock('@/components/ToolBrowser', () => ({
  ToolBrowser: ({ onAddTool }: { onAddTool: (tool: PlacedTool) => void }) => (
    <button onClick={() => onAddTool({
      ...placed,
      id: 'large-placement',
      points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 90 }, { x: 0, y: 90 }],
      interior_rings: [],
    })}>Add large tool</button>
  ),
}))
vi.mock('@/components/Breadcrumb', () => ({ Breadcrumb: () => null }))

const placed: PlacedTool = {
  id: 'placed-1', tool_id: 'tool-1', name: 'Scissors', rotation: 0,
  points: [
    { x: 22, y: 27 }, { x: 62, y: 27 }, { x: 62, y: 57 },
    { x: 22, y: 57 }, { x: 22, y: 42 },
  ],
  finger_holes: [],
  interior_rings: [[{ x: 42, y: 42 }, { x: 45, y: 42 }, { x: 42, y: 45 }]],
}

const libraryTool = {
  id: 'tool-1', points: [
    { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 },
    { x: 0, y: 30 }, { x: 0, y: 15 },
  ],
  interior_rings: [[{ x: 20, y: 15 }, { x: 23, y: 15 }, { x: 20, y: 18 }]],
  smoothed: false, smooth_level: 0.5,
} as ToolSummary

beforeEach(() => {
  vi.mocked(getBin).mockResolvedValue({
    id: 'bin-1', name: 'Scissors tray', project_id: null,
    bin_config: { ...FACTORY_BIN_CONFIG, grid_x: 4, grid_y: 3 },
    auto_size_grid: false, placed_tools: [placed], text_labels: [],
    stl_path: null, created_at: null,
  })
  vi.mocked(listTools).mockResolvedValue([libraryTool])
  vi.mocked(updateBin).mockReset().mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('bin reload', () => {
  it('uses the already synced interior rings without moving them again', async () => {
    render(<BinPage />)
    await waitFor(() => expect(screen.getByTestId('placed-rings').textContent).toBe(JSON.stringify(placed.interior_rings)))
  })

  it('restores manual grid mode and saves a later mode change', async () => {
    render(<BinPage />)
    await waitFor(() => expect(screen.getByTestId('auto-size').textContent).toBe('false'))
    expect(screen.getByTestId('grid-size').textContent).toBe('4x3')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle auto size' }))
    await waitFor(() => expect(updateBin).toHaveBeenCalledWith('bin-1', expect.objectContaining({ auto_size_grid: true })))
  })

  it('does not resize a manually sized bin when another tool is placed', async () => {
    render(<BinPage />)
    await waitFor(() => expect(screen.getByTestId('auto-size').textContent).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: 'Add large tool' }))
    expect(screen.getByTestId('grid-size').textContent).toBe('4x3')
  })

  it('preserves the dimensions of bins saved before auto-size mode existed', async () => {
    vi.mocked(getBin).mockResolvedValueOnce({
      id: 'bin-1', name: 'Older tray', project_id: null,
      bin_config: { ...FACTORY_BIN_CONFIG, grid_x: 4, grid_y: 3 },
      auto_size_grid: null, placed_tools: [placed], text_labels: [],
      stl_path: null, created_at: null,
    })
    render(<BinPage />)
    await waitFor(() => expect(screen.getByTestId('auto-size').textContent).toBe('false'))
    expect(screen.getByTestId('grid-size').textContent).toBe('4x3')
  })
})
