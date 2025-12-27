import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
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
  LinearProgress,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  Lock as LockIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material'
import SvgIcon from '@mui/material/SvgIcon'
import { useAuth } from '../contexts/AuthContext'

// Custom Oil Barrel Icon
const OilIcon = (props: any) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M12 2C8.14 2 5 3.57 5 5.5V18.5C5 20.43 8.14 22 12 22C15.86 22 19 20.43 19 18.5V5.5C19 3.57 15.86 2 12 2ZM12 4C14.76 4 17 4.9 17 5.5C17 6.1 14.76 7 12 7C9.24 7 7 6.1 7 5.5C7 4.9 9.24 4 12 4ZM17 18.5C17 19.1 14.76 20 12 20C9.24 20 7 19.1 7 18.5V8.31C8.35 9.04 10.1 9.5 12 9.5C13.9 9.5 15.65 9.04 17 8.31V18.5ZM7 11.5H17V13.5H7V11.5ZM7 15.5H17V17.5H7V15.5Z"/>
  </SvgIcon>
)
import client from '../api/client'

// Password strength calculation
function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0
  if (password.length >= 8) score += 25
  if (password.length >= 12) score += 15
  if (/[a-z]/.test(password)) score += 15
  if (/[A-Z]/.test(password)) score += 15
  if (/[0-9]/.test(password)) score += 15
  if (/[^a-zA-Z0-9]/.test(password)) score += 15

  if (score < 40) return { score, label: 'Weak', color: '#ef4444' }
  if (score < 70) return { score, label: 'Fair', color: '#f59e0b' }
  if (score < 90) return { score, label: 'Good', color: '#10b981' }
  return { score, label: 'Strong', color: '#059669' }
}

export default function SetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setPassword } = useAuth()

  const token = searchParams.get('token') || ''

  const [password, setPasswordValue] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [tokenInfo, setTokenInfo] = useState<{
    valid: boolean
    type?: string
    email?: string
    full_name?: string
  } | null>(null)

  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setTokenInfo({ valid: false })
        setIsValidating(false)
        return
      }

      try {
        const response = await client.get(`/api/auth/verify-token?token=${token}`)
        setTokenInfo(response.data)
      } catch (err) {
        setTokenInfo({ valid: false })
      } finally {
        setIsValidating(false)
      }
    }

    validateToken()
  }, [token])

  const passwordStrength = getPasswordStrength(password)
  const passwordsMatch = password === confirmPassword
  const canSubmit = password.length >= 8 && passwordsMatch

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setError('')
    setIsLoading(true)

    try {
      await setPassword(token, password)
      navigate('/')
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Failed to set password. Please try again.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  // Loading state
  if (isValidating) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
        }}
      >
        <CircularProgress sx={{ color: 'white' }} />
      </Box>
    )
  }

  // Invalid token state
  if (!tokenInfo?.valid) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
        }}
      >
        <Card
          sx={{
            width: '100%',
            maxWidth: 420,
            mx: 2,
            p: 4,
            borderRadius: 4,
            background: 'rgba(255, 255, 255, 0.95)',
            textAlign: 'center',
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              mb: 2,
            }}
          >
            <ErrorIcon sx={{ fontSize: 32, color: 'white' }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1 }}>
            Invalid or Expired Link
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 3 }}>
            This password reset link is invalid or has expired. Please request a new one.
          </Typography>
          <Button
            component={Link}
            to="/forgot-password"
            variant="contained"
            sx={{
              py: 1.5,
              px: 4,
              background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
            }}
          >
            Request New Link
          </Button>
        </Card>
      </Box>
    )
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
            variant="h5"
            sx={{
              fontWeight: 700,
              color: '#1e293b',
              letterSpacing: '-0.02em',
              mb: 0.5,
            }}
          >
            {tokenInfo.type === 'invite' ? 'Welcome!' : 'Reset Password'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 500 }}>
            {tokenInfo.type === 'invite'
              ? `Hi ${tokenInfo.full_name}, set your password to get started`
              : 'Enter your new password below'}
          </Typography>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="New Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPasswordValue(e.target.value)}
            required
            autoFocus
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

          {/* Password Strength Indicator */}
          {password && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <LinearProgress
                  variant="determinate"
                  value={passwordStrength.score}
                  sx={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: '#e2e8f0',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: passwordStrength.color,
                      borderRadius: 3,
                    },
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{ color: passwordStrength.color, fontWeight: 600, minWidth: 50 }}
                >
                  {passwordStrength.label}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                Use 8+ characters with uppercase, lowercase, numbers & symbols
              </Typography>
            </Box>
          )}

          <TextField
            fullWidth
            label="Confirm Password"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            error={confirmPassword.length > 0 && !passwordsMatch}
            helperText={
              confirmPassword.length > 0 && !passwordsMatch ? 'Passwords do not match' : ''
            }
            sx={{ mb: 3 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  {passwordsMatch && confirmPassword ? (
                    <CheckCircleIcon sx={{ color: '#10b981' }} />
                  ) : (
                    <LockIcon sx={{ color: '#94a3b8' }} />
                  )}
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    edge="end"
                    size="small"
                  >
                    {showConfirmPassword ? (
                      <VisibilityOff sx={{ color: '#94a3b8' }} />
                    ) : (
                      <Visibility sx={{ color: '#94a3b8' }} />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={isLoading || !canSubmit}
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
              '&:disabled': {
                background: '#94a3b8',
              },
            }}
          >
            {isLoading ? (
              <CircularProgress size={24} sx={{ color: 'white' }} />
            ) : tokenInfo.type === 'invite' ? (
              'Create Account'
            ) : (
              'Reset Password'
            )}
          </Button>
        </form>
      </Card>
    </Box>
  )
}

