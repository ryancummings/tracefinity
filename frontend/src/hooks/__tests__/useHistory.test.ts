// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHistory } from '../useHistory'

describe('useHistory', () => {
  it('records the first edit made after an undo', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useHistory<string>('a', onChange))

    act(() => result.current.set('b'))
    act(() => result.current.set('c'))
    act(() => result.current.undo())
    expect(onChange).toHaveBeenLastCalledWith('b')

    // a new edit after undo must be undoable on its own
    act(() => result.current.set('d'))
    act(() => result.current.undo())
    expect(onChange).toHaveBeenLastCalledWith('b')
    expect(result.current.canRedo).toBe(true)
  })

  it('records the first edit made after a redo', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useHistory<string>('a', onChange))

    act(() => result.current.set('b'))
    act(() => result.current.undo())
    act(() => result.current.redo())
    act(() => result.current.set('c'))
    act(() => result.current.undo())
    expect(onChange).toHaveBeenLastCalledWith('b')
  })
})
