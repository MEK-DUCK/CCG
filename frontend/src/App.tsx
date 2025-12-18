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
import Layout from './components/Layout'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#007AFF', // Apple blue
      light: '#5AC8FA',
      dark: '#0051D5',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#5856D6', // Apple purple
      light: '#AF52DE',
      dark: '#3634A3',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F2F2F7', // Apple light gray
      paper: '#FFFFFF',
    },
    text: {
      primary: '#000000',
      secondary: '#8E8E93',
    },
    divider: 'rgba(0, 0, 0, 0.1)',
    grey: {
      50: '#F2F2F7',
      100: '#E5E5EA',
      200: '#D1D1D6',
      300: '#C7C7CC',
      400: '#AEAEB2',
      500: '#8E8E93',
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
    h4: {
      fontWeight: 700,
      fontSize: '2rem',
      letterSpacing: '-0.02em',
      color: '#000000',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.5rem',
      letterSpacing: '-0.01em',
      color: '#000000',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.25rem',
      letterSpacing: '-0.01em',
      color: '#000000',
    },
    subtitle1: {
      fontWeight: 500,
      fontSize: '1rem',
      color: '#000000',
    },
    subtitle2: {
      fontWeight: 500,
      fontSize: '0.875rem',
      color: '#8E8E93',
    },
    body1: {
      fontSize: '1rem',
      color: '#000000',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      color: '#8E8E93',
      lineHeight: 1.43,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
      letterSpacing: '0.01em',
    },
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    'none',
    '0px 1px 3px rgba(0, 0, 0, 0.05)',
    '0px 2px 6px rgba(0, 0, 0, 0.05)',
    '0px 4px 12px rgba(0, 0, 0, 0.05)',
    '0px 8px 24px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
    '0px 16px 48px rgba(0, 0, 0, 0.05)',
  ],
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
          borderRadius: 12,
          border: 'none',
        },
        elevation1: {
          boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 10,
          fontWeight: 500,
          padding: '10px 20px',
          fontSize: '0.9375rem',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        contained: {
          boxShadow: '0px 2px 6px rgba(0, 122, 255, 0.2)',
          '&:hover': {
            boxShadow: '0px 4px 12px rgba(0, 122, 255, 0.3)',
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
        outlined: {
          borderWidth: 1.5,
          '&:hover': {
            borderWidth: 1.5,
            transform: 'translateY(-1px)',
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#F2F2F7',
          '& .MuiTableCell-root': {
            color: '#000000',
            fontWeight: 600,
            fontSize: '0.8125rem',
            borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(0, 122, 255, 0.04) !important',
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
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          padding: '16px',
          fontSize: '0.9375rem',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          fontSize: '0.75rem',
          height: 24,
          borderRadius: 6,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.9375rem',
          minHeight: 48,
          padding: '12px 16px',
          '&.Mui-selected': {
            fontWeight: 600,
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(0, 0, 0, 0.2)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
        },
      },
    },
  },
})

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/customers" element={<CustomerManagement />} />
            <Route path="/contracts" element={<ContractManagement />} />
            <Route path="/contracts/:contractId/dashboard" element={<ContractDashboard />} />
            <Route path="/lifting-plan" element={<LiftingPlanPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/reconciliation" element={<ReconciliationPage />} />
            <Route path="/contract-summary" element={<ContractSummaryPage />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  )
}

export default App

