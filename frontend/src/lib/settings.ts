import type { BinDefaults, CutoutShape, PaperSize } from '@/types'

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
  // unset until chosen; the browser's region decides meanwhile
  paperSize?: PaperSize
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

export const PAPER_SIZE_OPTIONS: { value: PaperSize; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'a3', label: 'A3' },
  { value: 'tabloid', label: 'Tabloid' },
]

// regions where US Letter, not A4, is the everyday sheet
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'CR', 'GT', 'PA', 'DO', 'SV', 'NI', 'PR'])

/** Letter for the first browser language whose region uses it, else A4. */
export function localePaperSize(languages: readonly string[]): PaperSize {
  for (const tag of languages) {
    try {
      // maximize fills in the likely region, e.g. "en" -> "en-Latn-US"
      const region = new Intl.Locale(tag).maximize().region
      if (region) return LETTER_REGIONS.has(region) ? 'letter' : 'a4'
    } catch {
      // ignore malformed language tags
    }
  }
  return 'a4'
}

/** Paper size a new photo starts with: the saved choice, else the browser's region. */
export function getDefaultPaperSize(): PaperSize {
  const saved = getSettings().paperSize
  if (saved) return saved
  if (typeof navigator === 'undefined') return 'a4'
  return localePaperSize(navigator.languages?.length ? navigator.languages : [navigator.language])
}
