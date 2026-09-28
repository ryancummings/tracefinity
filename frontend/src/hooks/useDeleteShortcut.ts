import { useEffect } from 'react'

export function isDeleteKey(event: KeyboardEvent): boolean {
  if (event.key !== 'Delete' || event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  const target = event.target instanceof Element ? event.target : document.activeElement
  return !(target instanceof Element && (target.closest('input, textarea, select, [contenteditable], [role="textbox"]') || (target as HTMLElement).isContentEditable))
}

/** Treat Delete as a click when the focused control explicitly offers deletion. */
export function activateFocusedDeleteButton(event: KeyboardEvent): void {
  if (!isDeleteKey(event)) return
  const button = document.activeElement
  if (!(button instanceof HTMLButtonElement) || !button.hasAttribute('data-delete-shortcut') || button.disabled) return
  event.preventDefault()
  button.click()
}

/** Delete the selected canvas item only when no other control or dialog owns the key. */
export function useDeleteShortcut(action: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    function handleKeyDown(event: KeyboardEvent) {
      if (!isDeleteKey(event) || document.querySelector('[aria-modal="true"]')) return
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (target instanceof Element && target.closest('button, a, [role="button"]')) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [action, enabled])
}
