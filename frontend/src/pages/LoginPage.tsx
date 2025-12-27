import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Box,
  Card,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  Email as EmailIcon,
  Lock as LockIcon,
  LocalGasStation as OilIcon,
} from '@mui/icons-material'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/')
    return null
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(email, password)
      navigate('/')
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Login failed. Please try again.'
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
        // Animated gradient background
        background: `
          linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)
        `,
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          background: `
            radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(14, 165, 233, 0.08) 0%, transparent 40%)
          `,
          animation: 'pulse 15s ease-in-out infinite',
        },
        '@keyframes pulse': {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '50%': { transform: 'scale(1.1) rotate(5deg)' },
        },
      }}
    >
      {/* Floating particles effect */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          '& .particle': {
            position: 'absolute',
            width: '4px',
            height: '4px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            animation: 'float 20s infinite',
          },
          '@keyframes float': {
            '0%, 100%': { transform: 'translateY(100vh) rotate(0deg)', opacity: 0 },
            '10%': { opacity: 1 },
            '90%': { opacity: 1 },
            '100%': { transform: 'translateY(-100vh) rotate(720deg)', opacity: 0 },
          },
        }}
      >
        {[...Array(20)].map((_, i) => (
          <Box
            key={i}
            className="particle"
            sx={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 20}s`,
              animationDuration: `${15 + Math.random() * 10}s`,
            }}
          />
        ))}
      </Box>

      {/* Login Card */}
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
              background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
              boxShadow: '0 10px 40px -10px rgba(71, 85, 105, 0.5)',
              mb: 2,
            }}
          >
            <OilIcon sx={{ fontSize: 32, color: 'white' }} />
          </Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: '#1e293b',
              letterSpacing: '-0.02em',
              mb: 0.5,
            }}
          >
            Oil Lifting Program
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: '#64748b',
              fontWeight: 500,
            }}
          >
            Sign in to your account
          </Typography>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              borderRadius: 2,
              '& .MuiAlert-icon': { alignItems: 'center' },
            }}
          >
            {error}
          </Alert>
        )}

        {/* Login Form */}
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
            sx={{ mb: 2.5 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailIcon sx={{ color: '#94a3b8' }} />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            fullWidth
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            sx={{ mb: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockIcon sx={{ color: '#94a3b8' }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    size="small"
                  >
                    {showPassword ? (
                      <VisibilityOff sx={{ color: '#94a3b8' }} />
                    ) : (
                      <Visibility sx={{ color: '#94a3b8' }} />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {/* Forgot Password Link */}
          <Box sx={{ textAlign: 'right', mb: 3 }}>
            <Link
              to="/forgot-password"
              style={{
                color: '#475569',
                fontSize: '0.875rem',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Forgot password?
            </Link>
          </Box>

          {/* Submit Button */}
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
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                boxShadow: '0 6px 20px 0 rgba(71, 85, 105, 0.5)',
                transform: 'translateY(-2px)',
              },
              '&:active': {
                transform: 'translateY(0)',
              },
              '&:disabled': {
                background: '#94a3b8',
              },
            }}
          >
            {isLoading ? (
              <CircularProgress size={24} sx={{ color: 'white' }} />
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        {/* Footer */}
        <Box
          sx={{
            mt: 4,
            pt: 3,
            borderTop: '1px solid #e2e8f0',
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            Don't have an account?{' '}
            <Typography
              component="span"
              variant="body2"
              sx={{ color: '#475569', fontWeight: 600 }}
            >
              Contact your administrator
            </Typography>
          </Typography>
        </Box>
      </Card>

      {/* Version */}
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          bottom: 16,
          color: 'rgba(255, 255, 255, 0.4)',
        }}
      >
        v1.0.0
      </Typography>
    </Box>
  )
}

