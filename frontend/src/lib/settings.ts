import type { BinDefaults, CutoutShape } from '@/types'

export type CutoutDefaults = Record<CutoutShape, { radius: number; width?: number; height?: number }>

export const FACTORY_CUTOUT_DEFAULTS: CutoutDefaults = {
  circle: { radius: 10 },
  cylinder: { radius: 10 },
  scoop: { radius: 15 },
  square: { radius: 10 },
  rectangle: { radius: 15, width: 30, height: 20 },
  filleted_rectangle: { radius: 15, width: 30, height: 20 },
}

export interface UserSettings {
  bedSize: number
  binDefaults?: Partial<BinDefaults>
  cutoutDefaults?: Partial<CutoutDefaults>
  textSize?: number
}

export const BED_SIZE_MIN_MM = 150
export const BED_SIZE_MAX_MM = 500

const DEFAULTS: UserSettings = { bedSize: 256, textSize: 5 }
const KEY = 'tracefinity-settings'

export function getSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

export function getCutoutDefaults(shape: CutoutShape) {
  const saved = getSettings().cutoutDefaults?.[shape]
  return { ...FACTORY_CUTOUT_DEFAULTS[shape], ...saved }
}

export function saveSettings(partial: Partial<UserSettings>): void {
  if (typeof window === 'undefined') return
  try {
    const current = getSettings()
    const next: Record<string, unknown> = { ...current, ...partial }
    for (const key of Object.keys(next)) {
      if (next[key] === undefined) delete next[key]
    }
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // localStorage can be unavailable in private browsing or restricted contexts.
  }
}
