'use client'

import { useEffect, useState } from 'react'
import type { CutoutShape, PaperSize } from '@/types'
import { BinConfigurator } from '@/components/BinConfigurator'
import { NumericInput } from '@/components/NumericInput'
import { getDefaultBinConfig, resetDefaultBinConfig, saveDefaultBinConfig } from '@/lib/binDefaults'
import { FACTORY_CUTOUT_DEFAULTS, PAPER_SIZE_OPTIONS, getDefaultPaperSize, getSettings, saveSettings, type CutoutDefaults } from '@/lib/settings'

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
  const [paperSize, setPaperSize] = useState<PaperSize | null>(null)

  useEffect(() => {
    const saved = getSettings()
    setConfig(getDefaultBinConfig())
    setCutouts(Object.fromEntries(shapes.map(({ key }) => [key, {
      ...FACTORY_CUTOUT_DEFAULTS[key], ...saved.cutoutDefaults?.[key],
    }])) as CutoutDefaults)
    setTextSize(saved.textSize ?? 5)
    setPaperSize(getDefaultPaperSize())
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
        <p className="text-sm text-text-muted mt-1">Defaults apply to new photos, bins, cutouts, and labels. Existing designs keep their saved values.</p>
      </div>
      <section className="glass rounded-xl p-5">
        <h2 className="text-lg font-medium mb-1">Photos</h2>
        <p className="text-xs text-text-muted mb-4">The paper size a new photo starts with. You can still change it for each photo.</p>
        <fieldset>
          <legend className="sr-only">Default paper size</legend>
          <div className="inline-grid grid-cols-4 gap-0.5 rounded-[10px] glass p-0.5">
            {PAPER_SIZE_OPTIONS.map(option => (
              <label key={option.value} className="relative">
                {/* native radios give arrow-key movement and a single tab stop */}
                <input
                  type="radio"
                  name="default-paper-size"
                  value={option.value}
                  checked={paperSize === option.value}
                  onChange={() => { setPaperSize(option.value); saveSettings({ paperSize: option.value }) }}
                  className="peer sr-only"
                />
                <span className="flex h-7 px-3 items-center rounded text-xs font-medium whitespace-nowrap cursor-pointer text-text-muted hover:text-text-primary peer-checked:bg-surface peer-checked:text-text-primary peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <section className="glass rounded-xl p-5">
        <h2 className="text-lg font-medium mb-1">Cutouts and labels</h2>
        <p className="text-xs text-text-muted mb-5">Sizes are in millimetres. Finger scoops have straight sides and a bevel near the flat floor.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {shapes.map(({ key, label }) => (
            <div key={key} className="rounded-lg border border-border p-3">
              <h3 className="text-sm font-medium mb-2">{label}</h3>
              <div className="flex flex-wrap gap-4">
                {cutouts[key].width === undefined && (
                  <label className="text-xs text-text-muted flex items-center gap-2">{key === 'square' ? 'Side' : 'Diameter'}
                    <NumericInput value={cutouts[key].radius * 2} min={1} max={200} step={0.5} onChange={v => updateCutout(key, 'radius', v / 2)} className="w-16 bg-elevated rounded px-2 py-1 text-text-primary" /> mm
                  </label>
                )}
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
