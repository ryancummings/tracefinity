// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { activateFocusedDeleteButton, useDeleteShortcut } from './useDeleteShortcut'

function SelectedItem({ onDelete }: { onDelete: () => void }) {
  useDeleteShortcut(onDelete, true)
  return <>
    <input aria-label="Name" />
    <button type="button">Another action</button>
    <div tabIndex={0}>Canvas</div>
  </>
}

afterEach(() => {
  cleanup()
  document.querySelectorAll('[aria-modal="true"]').forEach(element => element.remove())
})

describe('Delete shortcut', () => {
  it('uses the selected item action, but leaves text editing and dialogs alone', () => {
    const onDelete = vi.fn()
    const { getByLabelText, getByText } = render(<SelectedItem onDelete={onDelete} />)

    fireEvent.keyDown(getByText('Canvas'), { key: 'Delete' })
    expect(onDelete).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(getByLabelText('Name'), { key: 'Delete' })
    fireEvent.keyDown(getByText('Another action'), { key: 'Delete' })
    fireEvent.keyDown(getByText('Canvas'), { key: 'Delete', repeat: true })
    fireEvent.keyDown(getByText('Canvas'), { key: 'Delete', ctrlKey: true })
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)
    fireEvent.keyDown(getByText('Canvas'), { key: 'Delete' })
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('clicks the focused delete button, including a confirmation button', () => {
    const onDelete = vi.fn()
    const { getByText } = render(<button type="button" data-delete-shortcut onClick={onDelete}>Delete item</button>)
    const button = getByText('Delete item') as HTMLButtonElement
    button.focus()
    window.addEventListener('keydown', activateFocusedDeleteButton, true)
    try {
      fireEvent.keyDown(button, { key: 'Delete' })
      expect(onDelete).toHaveBeenCalledTimes(1)
      fireEvent.keyDown(button, { key: 'Delete', repeat: true })
      expect(onDelete).toHaveBeenCalledTimes(1)
      button.disabled = true
      fireEvent.keyDown(button, { key: 'Delete' })
      expect(onDelete).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('keydown', activateFocusedDeleteButton, true)
    }
  })
})
