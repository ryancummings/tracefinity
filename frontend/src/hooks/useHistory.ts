import { useState, useCallback, useEffect, useRef } from 'react'
import { MAX_HISTORY } from '@/lib/constants'

export function useHistory<T>(
  initial: T,
  onChange: (value: T) => void,
  maxEntries: number = MAX_HISTORY
): {
  set: (value: T) => void
  replace: (value: T) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
} {
  const [entries, setEntries] = useState<T[]>(() => [JSON.parse(JSON.stringify(initial))])
  const [index, setIndex] = useState(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const canUndo = index > 0
  const canRedo = index < entries.length - 1

  const set = useCallback((value: T) => {
    setEntries(prev => {
      const next = prev.slice(0, index + 1)
      next.push(JSON.parse(JSON.stringify(value)))
      if (next.length > maxEntries) next.shift()
      return next
    })
    setIndex(prev => Math.min(prev + 1, maxEntries - 1))
  }, [index, maxEntries])

  // swap the current entry, for revising the step just taken
  const replace = useCallback((value: T) => {
    setEntries(prev => prev.map((entry, i) => (i === index ? JSON.parse(JSON.stringify(value)) : entry)))
  }, [index])

  const undo = useCallback(() => {
    if (!canUndo) return
    const newIdx = index - 1
    setIndex(newIdx)
    onChangeRef.current(JSON.parse(JSON.stringify(entries[newIdx])))
  }, [canUndo, index, entries])

  const redo = useCallback(() => {
    if (!canRedo) return
    const newIdx = index + 1
    setIndex(newIdx)
    onChangeRef.current(JSON.parse(JSON.stringify(entries[newIdx])))
  }, [canRedo, index, entries])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  return { set, replace, undo, redo, canUndo, canRedo }
}
