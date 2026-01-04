import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import HomePage from './pages/HomePage'
import CustomerManagement from './pages/CustomerManagement'
import ContractManagement from './pages/ContractManagement'
import ContractDashboard from './pages/ContractDashboard'
import LiftingPlanPage from './pages/LiftingPlanPage'
import ReconciliationPage from './pages/ReconciliationPage'
import DashboardPage from './pages/DashboardPage'
import ContractSummaryPage from './pages/ContractSummaryPage'
import AdminPage from './pages/AdminPage'
import CalendarPage from './pages/CalendarPage'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import SetPasswordPage from './pages/SetPasswordPage'
import Layout from './components/Layout'
import ProtectedRoute, { PublicOnlyRoute } from './components/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#475569', // Slate 600 - professional blue-gray
      light: '#64748B', // Slate 500
      dark: '#334155', // Slate 700
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#64748B', // Slate 500 - subtle accent
      light: '#94A3B8', // Slate 400
      dark: '#475569', // Slate 600
      contrastText: '#ffffff',
    },
    success: {
      main: '#059669', // Emerald 600
      light: '#10B981',
      dark: '#047857',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#D97706', // Amber 600
      light: '#F59E0B',
      dark: '#B45309',
      contrastText: '#ffffff',
    },
    error: {
      main: '#DC2626', // Red 600
      light: '#EF4444',
      dark: '#B91C1C',
      contrastText: '#ffffff',
    },
    info: {
      main: '#0284C7', // Sky 600 - blue-gray info
      light: '#0EA5E9',
      dark: '#0369A1',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F1F5F9', // Slate 100 - subtle cool gray
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1E293B', // Slate 800
      secondary: '#64748B', // Slate 500
    },
    divider: 'rgba(100, 116, 139, 0.15)', // Slate-based divider
    grey: {
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      800: '#1E293B',
      900: '#0F172A',
    },
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: {
      fontWeight: 700,
      fontSize: '1.875rem',
      letterSpacing: '-0.025em',
      lineHeight: 1.2,
      color: '#1E293B',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.5rem',
      letterSpacing: '-0.02em',
      lineHeight: 1.3,
      color: '#1E293B',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.125rem',
      letterSpacing: '-0.01em',
      lineHeight: 1.4,
      color: '#1E293B',
    },
    subtitle1: {
      fontWeight: 500,
      fontSize: '1rem',
      lineHeight: 1.5,
      color: '#334155',
    },
    subtitle2: {
      fontWeight: 500,
      fontSize: '0.875rem',
      lineHeight: 1.5,
      color: '#64748B',
    },
    body1: {
      fontSize: '0.9375rem',
      color: '#334155',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      color: '#64748B',
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '0.75rem',
      color: '#94A3B8',
      lineHeight: 1.5,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
      letterSpacing: '0.01em',
    },
  },
  shape: {
    borderRadius: 10,
  },
  shadows: [
    'none',
    '0px 1px 2px rgba(15, 23, 42, 0.04)',
    '0px 1px 3px rgba(15, 23, 42, 0.06), 0px 1px 2px rgba(15, 23, 42, 0.04)',
    '0px 4px 6px -1px rgba(15, 23, 42, 0.06), 0px 2px 4px -1px rgba(15, 23, 42, 0.04)',
    '0px 10px 15px -3px rgba(15, 23, 42, 0.08), 0px 4px 6px -2px rgba(15, 23, 42, 0.04)',
    '0px 20px 25px -5px rgba(15, 23, 42, 0.08), 0px 10px 10px -5px rgba(15, 23, 42, 0.04)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
          scrollbarColor: '#CBD5E1 transparent',
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#CBD5E1',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: '#94A3B8',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0px 1px 3px rgba(15, 23, 42, 0.06), 0px 1px 2px rgba(15, 23, 42, 0.04)',
          borderRadius: 12,
          border: '1px solid rgba(148, 163, 184, 0.1)',
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0px 1px 3px rgba(15, 23, 42, 0.06), 0px 1px 2px rgba(15, 23, 42, 0.04)',
        },
        elevation2: {
          boxShadow: '0px 4px 6px -1px rgba(15, 23, 42, 0.06), 0px 2px 4px -1px rgba(15, 23, 42, 0.04)',
        },
        elevation3: {
          boxShadow: '0px 10px 15px -3px rgba(15, 23, 42, 0.08), 0px 4px 6px -2px rgba(15, 23, 42, 0.04)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          fontWeight: 500,
          padding: '8px 16px',
          fontSize: '0.875rem',
          transition: 'all 0.15s ease',
          '&:focus-visible': {
            outline: '2px solid #475569',
            outlineOffset: '2px',
          },
        },
        contained: {
          boxShadow: '0px 1px 2px rgba(15, 23, 42, 0.05)',
          '&:hover': {
            boxShadow: '0px 4px 6px -1px rgba(71, 85, 105, 0.15), 0px 2px 4px -1px rgba(71, 85, 105, 0.08)',
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
            boxShadow: '0px 1px 2px rgba(15, 23, 42, 0.05)',
          },
        },
        outlined: {
          borderWidth: 1,
          borderColor: '#E2E8F0',
          '&:hover': {
            borderWidth: 1,
            borderColor: '#CBD5E1',
            backgroundColor: '#F8FAFC',
          },
        },
        text: {
          '&:hover': {
            backgroundColor: 'rgba(71, 85, 105, 0.08)',
          },
        },
        sizeSmall: {
          padding: '6px 12px',
          fontSize: '0.8125rem',
        },
        sizeLarge: {
          padding: '12px 24px',
          fontSize: '0.9375rem',
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: '1px solid rgba(148, 163, 184, 0.12)',
          overflow: 'hidden',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#F8FAFC',
          '& .MuiTableCell-root': {
            color: '#475569',
            fontWeight: 600,
            fontSize: '0.75rem',
            borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
            textTransform: 'uppercase',
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
            backgroundColor: 'rgba(71, 85, 105, 0.04) !important',
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
          borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          padding: '14px 16px',
          fontSize: '0.875rem',
          color: '#334155',
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
        filled: {
          // FOB chip - light blue
          '&.MuiChip-colorPrimary': {
            backgroundColor: '#DBEAFE', // Blue 100
            color: '#1D4ED8', // Blue 700
          },
          // CIF chip - light orange
          '&.MuiChip-colorSecondary': {
            backgroundColor: '#FEF3C7', // Amber 100
            color: '#B45309', // Amber 700
          },
          // T/T chip - light green
          '&.MuiChip-colorSuccess': {
            backgroundColor: '#D1FAE5', // Emerald 100
            color: '#047857', // Emerald 700
          },
          // LC chip - light purple
          '&.MuiChip-colorWarning': {
            backgroundColor: '#EDE9FE', // Violet 100
            color: '#6D28D9', // Violet 700
          },
          '&.MuiChip-colorError': {
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#DC2626',
          },
          '&.MuiChip-colorInfo': {
            backgroundColor: '#E0F2FE', // Sky 100
            color: '#0369A1', // Sky 700
          },
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
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          minHeight: 44,
          padding: '10px 16px',
          color: '#64748B',
          transition: 'all 0.15s ease',
          '&.Mui-selected': {
            fontWeight: 600,
            color: '#475569',
          },
          '&:hover': {
            color: '#334155',
            backgroundColor: 'rgba(71, 85, 105, 0.04)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: '#FFFFFF',
            transition: 'all 0.15s ease',
            '& fieldset': {
              borderColor: '#E2E8F0',
              transition: 'border-color 0.15s ease',
            },
            '&:hover fieldset': {
              borderColor: '#CBD5E1',
            },
            '&.Mui-focused fieldset': {
              borderWidth: 2,
              borderColor: '#475569',
            },
          },
          '& .MuiInputLabel-root': {
            color: '#64748B',
            '&.Mui-focused': {
              color: '#475569',
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
            borderColor: '#E2E8F0',
          },
          '&:hover fieldset': {
            borderColor: '#CBD5E1',
          },
          '&.Mui-focused fieldset': {
            borderWidth: 2,
            borderColor: '#475569',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0px 1px 3px rgba(15, 23, 42, 0.06), 0px 1px 2px rgba(15, 23, 42, 0.04)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          transition: 'all 0.2s ease',
          '&:hover': {
            boxShadow: '0px 4px 6px -1px rgba(15, 23, 42, 0.06), 0px 2px 4px -1px rgba(15, 23, 42, 0.04)',
          },
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
          color: '#1E293B',
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
            backgroundColor: 'rgba(71, 85, 105, 0.08)',
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1E293B',
          fontSize: '0.75rem',
          fontWeight: 500,
          borderRadius: 6,
          padding: '6px 10px',
        },
        arrow: {
          color: '#1E293B',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(148, 163, 184, 0.12)',
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: '#475569',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: '#E2E8F0',
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
        standardSuccess: {
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          color: '#059669',
        },
        standardError: {
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: '#DC2626',
        },
        standardWarning: {
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          color: '#D97706',
        },
        standardInfo: {
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          color: '#2563EB',
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: {
          borderTop: '1px solid rgba(148, 163, 184, 0.12)',
        },
        selectLabel: {
          fontSize: '0.8125rem',
          color: '#64748B',
        },
        displayedRows: {
          fontSize: '0.8125rem',
          color: '#64748B',
        },
      },
    },
  },
})

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Public auth routes (redirect to home if already logged in) */}
            <Route path="/login" element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            } />
            <Route path="/forgot-password" element={
              <PublicOnlyRoute>
                <ForgotPasswordPage />
              </PublicOnlyRoute>
            } />
            <Route path="/set-password" element={<SetPasswordPage />} />

            {/* Protected routes (require authentication) */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout>
                  <HomePage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/customers" element={
              <ProtectedRoute>
                <Layout>
                  <CustomerManagement />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/contracts" element={
              <ProtectedRoute>
                <Layout>
                  <ContractManagement />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/contracts/:contractId/dashboard" element={
              <ProtectedRoute>
                <Layout>
                  <ContractDashboard />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/lifting-plan" element={
              <ProtectedRoute>
                <Layout>
                  <LiftingPlanPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/calendar" element={
              <ProtectedRoute>
                <Layout>
                  <CalendarPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/reconciliation" element={
              <ProtectedRoute>
                <Layout>
                  <ReconciliationPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/contract-summary" element={
              <ProtectedRoute>
                <Layout>
                  <ContractSummaryPage />
                </Layout>
              </ProtectedRoute>
            } />
            {/* Admin route (requires admin role) */}
            <Route path="/admin" element={
              <ProtectedRoute requireAdmin>
                <Layout>
                  <AdminPage />
                </Layout>
              </ProtectedRoute>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App

