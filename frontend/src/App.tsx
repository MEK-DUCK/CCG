import { useMemo } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
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
import { ThemeContextProvider, useThemeMode } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { createAppTheme } from './theme'

function AppContent() {
  const { mode } = useThemeMode()
  const theme = useMemo(() => createAppTheme(mode), [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ToastProvider>
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
      </ToastProvider>
    </ThemeProvider>
  )
}

function App() {
  return (
    <ThemeContextProvider>
      <AppContent />
    </ThemeContextProvider>
  )
}

export default App
