import { useState, useEffect, useRef, useCallback } from 'react'

export function useDebouncedSave(
  saveFn: () => Promise<void> | void,
  deps: unknown[],
  delay: number = 150,
  options?: { skipInitial?: boolean; enabled?: boolean }
): { pending: boolean; saving: boolean; saved: boolean; saveCount: number; error: Error | null; flush: () => Promise<void> } {
  const [pending, setPending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveCount, setSaveCount] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingSaveRef = useRef<(() => Promise<void> | void) | null>(null)
  const revisionRef = useRef(0)
  const inFlightRef = useRef<Promise<void>>(Promise.resolve())
  const initialSkippedRef = useRef(!options?.skipInitial)
  const saveFnRef = useRef(saveFn)
  saveFnRef.current = saveFn

  useEffect(() => {
    if (options?.enabled === false) return
    if (!initialSkippedRef.current) {
      initialSkippedRef.current = true
      setSaved(true)
      return
    }
    const revision = ++revisionRef.current
    setSaved(false)
    setPending(true)
    const doSave = async () => {
      const save = saveFnRef.current
      if (revision === revisionRef.current) setPending(false)
      const run = async () => {
        if (revision === revisionRef.current) setSaving(true)
        try {
          await save()
          setSaveCount(c => c + 1)
          if (revision === revisionRef.current) {
            setSaved(true)
            setError(null)
          }
        } catch (err) {
          // A failed request must never be reported as saved.
          if (revision === revisionRef.current) {
            setError(err instanceof Error ? err : new Error('save failed'))
          }
        } finally {
          if (revision === revisionRef.current) setSaving(false)
        }
      }
      const next = inFlightRef.current.then(run)
      inFlightRef.current = next
      await next
    }
    pendingSaveRef.current = doSave
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      pendingSaveRef.current = null
      doSave()
    }, delay)
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, options?.enabled])

  /** Run a save that is still waiting out the debounce, e.g. before navigating away. */
  const flush = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    if (pending) await pending()
    await inFlightRef.current
  }, [])

  // In-app navigation unmounts the editor without firing beforeunload.
  useEffect(() => {
    const onUnload = () => { void flush() }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      void flush()
    }
  }, [flush])

  return { pending, saving, saved, saveCount, error, flush }
}
