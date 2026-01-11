import React from 'react'
import { TableCell, TableCellProps, Box } from '@mui/material'

interface ResizableTableCellProps extends Omit<TableCellProps, 'width'> {
  /** Column identifier */
  columnId: string
  /** Current width of the column */
  width: number
  /** Minimum width of the column */
  minWidth?: number
  /** Callback when resize starts */
  onResizeStart: (e: React.MouseEvent, columnId: string) => void
  /** Whether to show the resize handle (default: true) */
  resizable?: boolean
  /** Children to render in the cell */
  children: React.ReactNode
}

/**
 * A table header cell with a draggable resize handle on the right edge.
 * Use with useResizableColumns hook for state management.
 */
export function ResizableTableCell({
  columnId,
  width,
  minWidth = 50,
  onResizeStart,
  resizable = true,
  children,
  sx,
  ...rest
}: ResizableTableCellProps) {
  return (
    <TableCell
      sx={{
        width,
        minWidth,
        position: 'relative',
        userSelect: 'none',
        '&:hover .resize-handle': {
          opacity: 1,
        },
        ...sx,
      }}
      {...rest}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{children}</span>
      </Box>
      {resizable && (
        <Box
          className="resize-handle"
          onMouseDown={(e) => onResizeStart(e, columnId)}
          sx={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: 'col-resize',
            opacity: 0,
            transition: 'opacity 0.2s, background-color 0.2s',
            backgroundColor: 'transparent',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.1)',
              opacity: 1,
            },
          }}
        />
      )}
    </TableCell>
  )
}

export default ResizableTableCell
