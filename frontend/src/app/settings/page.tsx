'use client'

import { useEffect, useState } from 'react'
import type { CutoutShape } from '@/types'
import { BinConfigurator } from '@/components/BinConfigurator'
import { NumericInput } from '@/components/NumericInput'
import { getDefaultBinConfig, resetDefaultBinConfig, saveDefaultBinConfig } from '@/lib/binDefaults'
import { FACTORY_CUTOUT_DEFAULTS, getSettings, saveSettings, type CutoutDefaults } from '@/lib/settings'

const shapes: { key: CutoutShape; label: string }[] = [
  { key: 'scoop', label: 'Finger scoop' },
  { key: 'circle', label: 'Spherical hole' },
  { key: 'cylinder', label: 'Cylinder' },
  { key: 'square', label: 'Square' },
  { key: 'rectangle', label: 'Rectangle' },
  { key: 'filleted_rectangle', label: 'Filleted rectangle' },
]

export default function SettingsPage() {
  const [config, setConfig] = useState(() => getDefaultBinConfig())
  const [cutouts, setCutouts] = useState<CutoutDefaults>(FACTORY_CUTOUT_DEFAULTS)
  const [textSize, setTextSize] = useState(5)

  useEffect(() => {
    const saved = getSettings()
    setConfig(getDefaultBinConfig())
    setCutouts(Object.fromEntries(shapes.map(({ key }) => [key, {
      ...FACTORY_CUTOUT_DEFAULTS[key], ...saved.cutoutDefaults?.[key],
    }])) as CutoutDefaults)
    setTextSize(saved.textSize ?? 5)
  }, [])

  const updateCutout = (shape: CutoutShape, key: 'radius' | 'width' | 'height', value: number) => {
    const next = { ...cutouts, [shape]: { ...cutouts[shape], [key]: value } }
    setCutouts(next)
    saveSettings({ cutoutDefaults: next })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-text-muted mt-1">Defaults apply to new bins, cutouts, and labels. Existing designs keep their saved values.</p>
      </div>
      <section className="glass rounded-xl p-5">
        <h2 className="text-lg font-medium mb-1">Cutouts and labels</h2>
        <p className="text-xs text-text-muted mb-5">Sizes are in millimetres. Finger scoops have a flat floor and a tapered opening.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {shapes.map(({ key, label }) => (
            <div key={key} className="rounded-lg border border-border p-3">
              <h3 className="text-sm font-medium mb-2">{label}</h3>
              <div className="flex flex-wrap gap-4">
                <label className="text-xs text-text-muted flex items-center gap-2">{cutouts[key].width ? 'Fallback radius' : 'Radius / half side'}
                  <NumericInput value={cutouts[key].radius} min={0.5} max={100} step={0.5} onChange={v => updateCutout(key, 'radius', v)} className="w-16 bg-elevated rounded px-2 py-1 text-text-primary" />
                </label>
                {(['width', 'height'] as const).map(dim => cutouts[key][dim] !== undefined && (
                  <label key={dim} className="text-xs text-text-muted flex items-center gap-2 capitalize">{dim}
                    <NumericInput value={cutouts[key][dim] ?? 1} min={1} max={200} step={0.5} onChange={v => updateCutout(key, dim, v)} className="w-16 bg-elevated rounded px-2 py-1 text-text-primary" />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-border p-3">
            <h3 className="text-sm font-medium mb-2">Text labels</h3>
            <label className="text-xs text-text-muted flex items-center gap-2">Default text size
              <NumericInput value={textSize} min={1} max={30} step={0.5} onChange={v => { setTextSize(v); saveSettings({ textSize: v }) }} className="w-16 bg-elevated rounded px-2 py-1 text-text-primary" /> mm
            </label>
          </div>
        </div>
      </section>
      <section className="glass rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <div><h2 className="text-lg font-medium">New bin defaults</h2><p className="text-xs text-text-muted">Grid size, depth, clearance, magnets, print bed and other bin options.</p></div>
          <button className="text-xs text-accent" onClick={() => setConfig(resetDefaultBinConfig())}>Reset bin defaults</button>
        </div>
        <BinConfigurator config={config} onChange={next => { setConfig(next); saveDefaultBinConfig(next) }} />
      </section>
    </div>
  )
}
