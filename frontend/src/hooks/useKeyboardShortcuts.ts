import { useEffect, useCallback } from 'react'

interface KeyboardShortcutOptions {
  onSave?: () => void
  onEscape?: () => void
  enabled?: boolean
}

/**
 * Hook for common keyboard shortcuts
 * - Ctrl+S / Cmd+S: Trigger save action
 * - Escape: Trigger close/cancel action
 */
export function useKeyboardShortcuts({
  onSave,
  onEscape,
  enabled = true,
}: KeyboardShortcutOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // Ctrl+S or Cmd+S to save
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
        onSave?.()
      }

      // Escape to close/cancel
      if (event.key === 'Escape') {
        // Don't trigger if user is in a select/dropdown (MUI handles this)
        const activeElement = document.activeElement
        const isInSelect = activeElement?.closest('[role="listbox"]') ||
                          activeElement?.closest('[role="menu"]')
        if (!isInSelect) {
          onEscape?.()
        }
      }
    },
    [onSave, onEscape, enabled]
  )

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, enabled])
}

/**
 * Hook specifically for dialogs - handles Escape to close
 */
export function useDialogShortcuts(onClose: () => void, open: boolean) {
  useKeyboardShortcuts({
    onEscape: onClose,
    enabled: open,
  })
}

/**
 * Hook specifically for forms - handles Ctrl+S to save
 */
export function useFormShortcuts(onSave: () => void, canSave: boolean = true) {
  useKeyboardShortcuts({
    onSave: canSave ? onSave : undefined,
    enabled: canSave,
  })
}
