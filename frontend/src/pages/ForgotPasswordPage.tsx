import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Box,
  Card,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  CircularProgress,
} from '@mui/material'
import {
  Email as EmailIcon,
  ArrowBack as ArrowBackIcon,
  LocalGasStation as OilIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material'
import { useAuth } from '../contexts/AuthContext'

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await forgotPassword(email)
      setIsSuccess(true)
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Failed to send reset email. Please try again.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          background: `
            radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)
          `,
        },
      }}
    >
      <Card
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          mx: 2,
          p: 4,
          borderRadius: 4,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        {/* Back Link */}
        <Link
          to="/login"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: '#475569',
            fontSize: '0.875rem',
            fontWeight: 500,
            textDecoration: 'none',
            marginBottom: 24,
          }}
        >
          <ArrowBackIcon sx={{ fontSize: 18 }} />
          Back to login
        </Link>

        {/* Logo & Title */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 3,
              background: isSuccess
                ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                : 'linear-gradient(135deg, #475569 0%, #334155 100%)',
              boxShadow: isSuccess
                ? '0 10px 40px -10px rgba(5, 150, 105, 0.5)'
                : '0 10px 40px -10px rgba(71, 85, 105, 0.5)',
              mb: 2,
              transition: 'all 0.3s ease',
            }}
          >
            {isSuccess ? (
              <CheckCircleIcon sx={{ fontSize: 32, color: 'white' }} />
            ) : (
              <OilIcon sx={{ fontSize: 32, color: 'white' }} />
            )}
          </Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              color: '#1e293b',
              letterSpacing: '-0.02em',
              mb: 0.5,
            }}
          >
            {isSuccess ? 'Check your email' : 'Reset Password'}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: '#64748b',
              fontWeight: 500,
              maxWidth: 280,
              mx: 'auto',
            }}
          >
            {isSuccess
              ? `We've sent a password reset link to ${email}`
              : 'Enter your email and we\'ll send you a reset link'}
          </Typography>
        </Box>

        {!isSuccess ? (
          <>
            {/* Error Alert */}
            {error && (
              <Alert
                severity="error"
                sx={{
                  mb: 3,
                  borderRadius: 2,
                }}
              >
                {error}
              </Alert>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                sx={{ mb: 3 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon sx={{ color: '#94a3b8' }} />
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={isLoading}
                sx={{
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 600,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
                  boxShadow: '0 4px 14px 0 rgba(71, 85, 105, 0.39)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                {isLoading ? (
                  <CircularProgress size={24} sx={{ color: 'white' }} />
                ) : (
                  'Send Reset Link'
                )}
              </Button>
            </form>
          </>
        ) : (
          <Box sx={{ textAlign: 'center' }}>
            <Button
              component={Link}
              to="/login"
              variant="outlined"
              size="large"
              sx={{
                py: 1.5,
                px: 4,
                fontSize: '1rem',
                fontWeight: 600,
                borderRadius: 2,
                borderColor: '#e2e8f0',
                color: '#475569',
                '&:hover': {
                  borderColor: '#cbd5e1',
                  background: '#f8fafc',
                },
              }}
            >
              Back to Login
            </Button>
          </Box>
        )}
      </Card>
    </Box>
  )
}

