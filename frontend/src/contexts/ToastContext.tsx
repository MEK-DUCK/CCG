import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Snackbar, Alert, AlertColor } from '@mui/material'

interface ToastOptions {
  message: string
  severity?: AlertColor  // 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

interface ToastContextType {
  showToast: (options: ToastOptions | string) => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  showWarning: (message: string) => void
  showInfo: (message: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [severity, setSeverity] = useState<AlertColor>('success')
  const [duration, setDuration] = useState(4000)

  const showToast = useCallback((options: ToastOptions | string) => {
    if (typeof options === 'string') {
      setMessage(options)
      setSeverity('success')
      setDuration(4000)
    } else {
      setMessage(options.message)
      setSeverity(options.severity || 'success')
      setDuration(options.duration || 4000)
    }
    setOpen(true)
  }, [])

  const showSuccess = useCallback((message: string) => {
    showToast({ message, severity: 'success' })
  }, [showToast])

  const showError = useCallback((message: string) => {
    showToast({ message, severity: 'error', duration: 6000 })
  }, [showToast])

  const showWarning = useCallback((message: string) => {
    showToast({ message, severity: 'warning', duration: 5000 })
  }, [showToast])

  const showInfo = useCallback((message: string) => {
    showToast({ message, severity: 'info' })
  }, [showToast])

  const handleClose = (_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return
    setOpen(false)
  }

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={duration}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleClose}
          severity={severity}
          variant="filled"
          sx={{
            width: '100%',
            minWidth: 300,
            boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
            // Lighter, softer colors for better UX
            ...(severity === 'error' && {
              bgcolor: '#EF4444',  // Softer red (was dark #d32f2f)
            }),
            ...(severity === 'success' && {
              bgcolor: '#10B981',  // Softer green
            }),
          }}
        >
          {message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
