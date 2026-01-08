import { createTheme, ThemeOptions } from '@mui/material/styles'

// Shared theme options (typography, shape, components that don't change)
const getBaseThemeOptions = (mode: 'light' | 'dark'): ThemeOptions => {
  const isLight = mode === 'light'
  
  return {
    palette: {
      mode,
      primary: {
        main: isLight ? '#475569' : '#94A3B8',
        light: isLight ? '#64748B' : '#CBD5E1',
        dark: isLight ? '#334155' : '#64748B',
        contrastText: '#ffffff',
      },
      secondary: {
        main: isLight ? '#64748B' : '#94A3B8',
        light: isLight ? '#94A3B8' : '#CBD5E1',
        dark: isLight ? '#475569' : '#64748B',
        contrastText: '#ffffff',
      },
      success: {
        main: '#059669',      // Kept for actual success states
        light: '#10B981',
        dark: '#047857',
        contrastText: '#ffffff',
      },
      warning: {
        main: '#B45309',      // Muted amber (was #D97706)
        light: '#D97706',
        dark: '#92400E',
        contrastText: '#ffffff',
      },
      error: {
        main: '#B91C1C',      // Muted red (was #DC2626)
        light: '#DC2626',
        dark: '#991B1B',
        contrastText: '#ffffff',
      },
      info: {
        main: '#0284C7',      // Keep original blue for info sections
        light: '#0EA5E9',
        dark: '#0369A1',
        contrastText: '#ffffff',
      },
      background: {
        default: isLight ? '#F1F5F9' : '#0F172A',
        paper: isLight ? '#FFFFFF' : '#1E293B',
      },
      text: {
        primary: isLight ? '#1E293B' : '#F1F5F9',
        secondary: isLight ? '#64748B' : '#94A3B8',
      },
      divider: isLight ? 'rgba(100, 116, 139, 0.15)' : 'rgba(148, 163, 184, 0.15)',
      grey: {
        50: isLight ? '#F8FAFC' : '#020617',
        100: isLight ? '#F1F5F9' : '#0F172A',
        200: isLight ? '#E2E8F0' : '#1E293B',
        300: isLight ? '#CBD5E1' : '#334155',
        400: isLight ? '#94A3B8' : '#475569',
        500: isLight ? '#64748B' : '#64748B',
        600: isLight ? '#475569' : '#94A3B8',
        700: isLight ? '#334155' : '#CBD5E1',
        800: isLight ? '#1E293B' : '#E2E8F0',
        900: isLight ? '#0F172A' : '#F1F5F9',
      },
    },
    typography: {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      h4: {
        fontWeight: 700,
        fontSize: '1.875rem',
        letterSpacing: '-0.025em',
        lineHeight: 1.2,
      },
      h5: {
        fontWeight: 600,
        fontSize: '1.5rem',
        letterSpacing: '-0.02em',
        lineHeight: 1.3,
      },
      h6: {
        fontWeight: 600,
        fontSize: '1.125rem',
        letterSpacing: '-0.01em',
        lineHeight: 1.4,
      },
      subtitle1: {
        fontWeight: 500,
        fontSize: '1rem',
        lineHeight: 1.5,
      },
      subtitle2: {
        fontWeight: 500,
        fontSize: '0.875rem',
        lineHeight: 1.5,
      },
      body1: {
        fontSize: '0.9375rem',
        lineHeight: 1.6,
      },
      body2: {
        fontSize: '0.875rem',
        lineHeight: 1.5,
      },
      caption: {
        fontSize: '0.75rem',
        lineHeight: 1.5,
      },
      button: {
        textTransform: 'none' as const,
        fontWeight: 500,
        letterSpacing: '0.01em',
      },
    },
    shape: {
      borderRadius: 10,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarWidth: 'thin',
            scrollbarColor: isLight ? '#CBD5E1 transparent' : '#475569 transparent',
            '&::-webkit-scrollbar': {
              width: '8px',
              height: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: isLight ? '#CBD5E1' : '#475569',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: isLight ? '#94A3B8' : '#64748B',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderRadius: 12,
            border: isLight ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(148, 163, 184, 0.1)',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none' as const,
            borderRadius: 8,
            fontWeight: 500,
            padding: '8px 16px',
            fontSize: '0.875rem',
            transition: 'all 0.15s ease',
          },
          contained: {
            boxShadow: '0px 1px 2px rgba(15, 23, 42, 0.05)',
            '&:hover': {
              boxShadow: '0px 4px 6px -1px rgba(71, 85, 105, 0.15), 0px 2px 4px -1px rgba(71, 85, 105, 0.08)',
              transform: 'translateY(-1px)',
            },
          },
          outlined: {
            borderWidth: 1,
            borderColor: isLight ? '#E2E8F0' : '#334155',
            '&:hover': {
              borderWidth: 1,
              borderColor: isLight ? '#CBD5E1' : '#475569',
              backgroundColor: isLight ? '#F8FAFC' : '#334155',
            },
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: isLight ? '1px solid rgba(148, 163, 184, 0.12)' : '1px solid rgba(148, 163, 184, 0.12)',
            // Enable horizontal scrolling on mobile
            overflowX: 'auto',
            overflowY: 'visible',
            // Smooth scrolling on iOS
            WebkitOverflowScrolling: 'touch',
            // Scrollbar styling for horizontal scroll
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': {
              height: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: isLight ? '#F1F5F9' : '#1E293B',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: isLight ? '#CBD5E1' : '#475569',
              borderRadius: '4px',
              '&:hover': {
                background: isLight ? '#94A3B8' : '#64748B',
              },
            },
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: isLight ? '#F8FAFC' : '#0F172A',
            '& .MuiTableCell-root': {
              fontWeight: 600,
              fontSize: '0.75rem',
              borderBottom: isLight ? '1px solid rgba(148, 163, 184, 0.12)' : '1px solid rgba(148, 163, 184, 0.12)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
              padding: '12px 16px',
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: 'background-color 0.15s ease',
            '&:hover': {
              backgroundColor: isLight ? 'rgba(71, 85, 105, 0.04) !important' : 'rgba(148, 163, 184, 0.08) !important',
            },
            '&:last-child td': {
              borderBottom: 'none',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: isLight ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(148, 163, 184, 0.1)',
            padding: '14px 16px',
            fontSize: '0.875rem',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 500,
            fontSize: '0.75rem',
            height: 26,
            borderRadius: 6,
            transition: 'all 0.15s ease',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 44,
          },
          indicator: {
            height: 3,
            borderRadius: '3px 3px 0 0',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none' as const,
            fontWeight: 500,
            fontSize: '0.875rem',
            minHeight: 44,
            padding: '10px 16px',
            transition: 'all 0.15s ease',
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
              backgroundColor: isLight ? '#FFFFFF' : '#1E293B',
              transition: 'all 0.15s ease',
              '& fieldset': {
                borderColor: isLight ? '#E2E8F0' : '#334155',
                transition: 'border-color 0.15s ease',
              },
              '&:hover fieldset': {
                borderColor: isLight ? '#CBD5E1' : '#475569',
              },
              '&.Mui-focused fieldset': {
                borderWidth: 2,
                borderColor: isLight ? '#475569' : '#94A3B8',
              },
            },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '& fieldset': {
              borderColor: isLight ? '#E2E8F0' : '#334155',
            },
            '&:hover fieldset': {
              borderColor: isLight ? '#CBD5E1' : '#475569',
            },
            '&.Mui-focused fieldset': {
              borderWidth: 2,
              borderColor: isLight ? '#475569' : '#94A3B8',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: isLight ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(148, 163, 184, 0.1)',
            transition: 'all 0.2s ease',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            boxShadow: '0px 25px 50px -12px rgba(15, 23, 42, 0.25)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: '1.25rem',
            fontWeight: 600,
            padding: '20px 24px 16px',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            padding: '16px 24px',
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: '16px 24px 20px',
            gap: '8px',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition: 'all 0.15s ease',
            '&:hover': {
              backgroundColor: isLight ? 'rgba(71, 85, 105, 0.08)' : 'rgba(148, 163, 184, 0.12)',
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isLight ? '#1E293B' : '#F1F5F9',
            color: isLight ? '#F1F5F9' : '#1E293B',
            fontSize: '0.75rem',
            fontWeight: 500,
            borderRadius: 6,
            padding: '6px 10px',
          },
          arrow: {
            color: isLight ? '#1E293B' : '#F1F5F9',
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: isLight ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.12)',
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            backgroundColor: isLight ? '#E2E8F0' : '#334155',
          },
          bar: {
            borderRadius: 4,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            fontSize: '0.875rem',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: isLight ? '#FFFFFF' : '#1E293B',
            border: isLight ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(148, 163, 184, 0.15)',
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: isLight ? 'rgba(71, 85, 105, 0.08)' : 'rgba(148, 163, 184, 0.12)',
            },
          },
        },
      },
    },
  }
}

export const createAppTheme = (mode: 'light' | 'dark') => createTheme(getBaseThemeOptions(mode))

