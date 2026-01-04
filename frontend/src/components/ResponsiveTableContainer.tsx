import { ReactNode } from 'react'
import { Box, TableContainer, Paper, useTheme, useMediaQuery } from '@mui/material'

interface ResponsiveTableContainerProps {
  children: ReactNode
  minWidth?: number | string
  maxHeight?: number | string
  stickyHeader?: boolean
  component?: typeof Paper | 'div'
  sx?: object
}

/**
 * A responsive table container that ensures horizontal scrolling works on mobile/tablet.
 * Wraps tables with proper touch scrolling and visual scroll indicators.
 */
export default function ResponsiveTableContainer({
  children,
  minWidth = 800,
  maxHeight,
  stickyHeader = false,
  component = Paper,
  sx = {},
}: ResponsiveTableContainerProps) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const isTablet = useMediaQuery(theme.breakpoints.down('md'))

  // Adjust minWidth for different screen sizes
  const effectiveMinWidth = typeof minWidth === 'number' 
    ? (isMobile ? Math.max(minWidth, 600) : isTablet ? Math.max(minWidth, 800) : minWidth)
    : minWidth

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        // Visual scroll indicator gradient on the right edge
        '&::after': (isMobile || isTablet) ? {
          content: '""',
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '20px',
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(to right, transparent, rgba(30, 41, 59, 0.8))'
            : 'linear-gradient(to right, transparent, rgba(255, 255, 255, 0.8))',
          pointerEvents: 'none',
          zIndex: 1,
          opacity: 0.8,
          transition: 'opacity 0.2s',
        } : undefined,
      }}
    >
      <TableContainer
        component={component}
        sx={{
          maxWidth: '100%',
          width: '100%',
          overflowX: 'auto',
          overflowY: maxHeight ? 'auto' : 'visible',
          maxHeight: maxHeight,
          // Smooth scrolling on iOS
          WebkitOverflowScrolling: 'touch',
          // Scrollbar styling
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            height: '8px',
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: theme.palette.mode === 'dark' ? '#1E293B' : '#F1F5F9',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            background: theme.palette.mode === 'dark' ? '#475569' : '#CBD5E1',
            borderRadius: '4px',
            '&:hover': {
              background: theme.palette.mode === 'dark' ? '#64748B' : '#94A3B8',
            },
          },
          // Ensure table has minimum width for scrolling
          '& .MuiTable-root': {
            minWidth: effectiveMinWidth,
          },
          // Sticky header support
          ...(stickyHeader && {
            '& .MuiTableHead-root': {
              position: 'sticky',
              top: 0,
              zIndex: 2,
              backgroundColor: theme.palette.background.paper,
            },
          }),
          ...sx,
        }}
      >
        {children}
      </TableContainer>
    </Box>
  )
}

