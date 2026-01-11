import { useState, useRef, useCallback, useEffect } from 'react'

export interface ColumnConfig {
  id: string
  label: string
  defaultWidth: number
  minWidth?: number
}

interface ResizeState {
  columnId: string
  startX: number
  startWidth: number
}

/**
 * Hook for managing resizable table columns with localStorage persistence.
 *
 * @param tableId - Unique identifier for the table (used for localStorage key)
 * @param columns - Array of column configurations
 * @returns Object with columnWidths state and handleResizeStart callback
 */
export function useResizableColumns(tableId: string, columns: ColumnConfig[]) {
  const storageKey = `table_column_widths_${tableId}`

  // Initialize column widths from localStorage or defaults
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    // Try to load from localStorage
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        // Validate that all columns exist
        const widths: Record<string, number> = {}
        columns.forEach(col => {
          widths[col.id] = parsed[col.id] ?? col.defaultWidth
        })
        return widths
      }
    } catch {
      // Ignore localStorage errors
    }

    // Initialize with default widths
    const widths: Record<string, number> = {}
    columns.forEach(col => {
      widths[col.id] = col.defaultWidth
    })
    return widths
  })

  const resizingRef = useRef<ResizeState | null>(null)

  // Save to localStorage when widths change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columnWidths))
    } catch {
      // Ignore localStorage errors
    }
  }, [columnWidths, storageKey])

  // Handle column resize start
  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: string) => {
    e.preventDefault()
    e.stopPropagation()

    const column = columns.find(c => c.id === columnId)
    const startX = e.clientX
    const startWidth = columnWidths[columnId] ?? column?.defaultWidth ?? 150

    resizingRef.current = { columnId, startX, startWidth }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return

      const diff = moveEvent.clientX - resizingRef.current.startX
      const col = columns.find(c => c.id === resizingRef.current!.columnId)
      const minWidth = col?.minWidth ?? 50
      const newWidth = Math.max(minWidth, resizingRef.current.startWidth + diff)

      setColumnWidths(prev => ({
        ...prev,
        [resizingRef.current!.columnId]: newWidth
      }))
    }

    const handleMouseUp = () => {
      resizingRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [columnWidths, columns])

  // Reset all columns to default widths
  const resetColumnWidths = useCallback(() => {
    const widths: Record<string, number> = {}
    columns.forEach(col => {
      widths[col.id] = col.defaultWidth
    })
    setColumnWidths(widths)
  }, [columns])

  // Get width for a specific column
  const getColumnWidth = useCallback((columnId: string) => {
    return columnWidths[columnId] ?? columns.find(c => c.id === columnId)?.defaultWidth ?? 150
  }, [columnWidths, columns])

  // Get minWidth for a specific column
  const getColumnMinWidth = useCallback((columnId: string) => {
    return columns.find(c => c.id === columnId)?.minWidth ?? 50
  }, [columns])

  return {
    columnWidths,
    handleResizeStart,
    resetColumnWidths,
    getColumnWidth,
    getColumnMinWidth,
  }
}

export default useResizableColumns
