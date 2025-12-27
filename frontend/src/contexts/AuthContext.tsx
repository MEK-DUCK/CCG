import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import client from '../api/client'

// Types
export interface User {
  id: number
  email: string
  full_name: string
  initials: string
  role: 'admin' | 'user'
  status: 'pending' | 'active' | 'inactive'
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setPassword: (token: string, password: string) => Promise<void>
  forgotPassword: (email: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Token storage keys
const TOKEN_KEY = 'oil_lifting_token'
const REFRESH_TOKEN_KEY = 'oil_lifting_refresh_token'
const USER_KEY = 'oil_lifting_user'
const TOKEN_EXPIRY_KEY = 'oil_lifting_token_expiry'

// API endpoints
const AUTH_ENDPOINTS = {
  login: '/api/auth/login',
  refresh: '/api/auth/refresh',
  setPassword: '/api/auth/set-password',
  forgotPassword: '/api/auth/forgot-password',
  changePassword: '/api/auth/change-password',
  me: '/api/auth/me',
  logout: '/api/auth/logout',
}

// Refresh token 1 minute before expiry
const REFRESH_BUFFER_SECONDS = 60

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isRefreshingRef = useRef(false)

  // Clear any scheduled refresh
  const clearRefreshTimeout = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = null
    }
  }, [])

  // Logout function (defined early for use in other callbacks)
  const logout = useCallback(() => {
    // Clear scheduled refresh
    clearRefreshTimeout()

    // Clear state
    setToken(null)
    setUser(null)

    // Clear storage
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(TOKEN_EXPIRY_KEY)

    // Remove auth header
    delete client.defaults.headers.common['Authorization']

    // Call logout endpoint (fire and forget)
    client.post(AUTH_ENDPOINTS.logout).catch(() => {})
  }, [clearRefreshTimeout])

  // Refresh the access token using the refresh token
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    if (isRefreshingRef.current) {
      return false // Already refreshing
    }

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (!refreshToken) {
      return false
    }

    isRefreshingRef.current = true
    try {
      const response = await client.post(AUTH_ENDPOINTS.refresh, {
        refresh_token: refreshToken,
      })
      
      const { access_token, expires_in, user: userData } = response.data

      // Update state and storage
      setToken(access_token)
      setUser(userData)
      localStorage.setItem(TOKEN_KEY, access_token)
      localStorage.setItem(USER_KEY, JSON.stringify(userData))
      
      // Calculate and store expiry time
      const expiryTime = Date.now() + (expires_in || 900) * 1000 // Default 15 min
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString())

      // Update auth header
      client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

      console.log('[Auth] Token refreshed successfully')
      return true
    } catch (error) {
      console.error('[Auth] Failed to refresh token:', error)
      // Refresh failed, logout
      logout()
      return false
    } finally {
      isRefreshingRef.current = false
    }
  }, [logout])

  // Schedule the next token refresh
  const scheduleTokenRefresh = useCallback((expiresIn: number) => {
    clearRefreshTimeout()

    // Refresh 1 minute before expiry, or at least 10 seconds from now
    const refreshIn = Math.max(
      (expiresIn - REFRESH_BUFFER_SECONDS) * 1000,
      10000
    )

    console.log(`[Auth] Scheduling token refresh in ${Math.round(refreshIn / 1000)} seconds`)
    
    refreshTimeoutRef.current = setTimeout(async () => {
      console.log('[Auth] Auto-refreshing token...')
      await refreshAccessToken()
      
      // Schedule next refresh if successful
      const newExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
      if (newExpiry) {
        const remainingSeconds = Math.max(0, (parseInt(newExpiry) - Date.now()) / 1000)
        if (remainingSeconds > 0) {
          scheduleTokenRefresh(remainingSeconds)
        }
      }
    }, refreshIn)
  }, [clearRefreshTimeout, refreshAccessToken])

  // Initialize auth state from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    const storedUser = localStorage.getItem(USER_KEY)
    const storedExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY)

    if (storedToken && storedUser) {
      try {
        const userData = JSON.parse(storedUser)
        setToken(storedToken)
        setUser(userData)
        
        // Set default auth header
        client.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`

        // Check if token is expired or about to expire
        if (storedExpiry) {
          const expiryTime = parseInt(storedExpiry)
          const remainingSeconds = (expiryTime - Date.now()) / 1000

          if (remainingSeconds <= 0) {
            // Token expired, try to refresh
            if (storedRefreshToken) {
              console.log('[Auth] Token expired, attempting refresh...')
              refreshAccessToken().then(success => {
                if (success) {
                  const newExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
                  if (newExpiry) {
                    const newRemainingSeconds = (parseInt(newExpiry) - Date.now()) / 1000
                    scheduleTokenRefresh(newRemainingSeconds)
                  }
                }
              })
            } else {
              // No refresh token, logout
              logout()
            }
          } else {
            // Schedule refresh before expiry
            scheduleTokenRefresh(remainingSeconds)
          }
        }
      } catch (e) {
        // Invalid stored data, clear it
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(REFRESH_TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(TOKEN_EXPIRY_KEY)
      }
    }
    setIsLoading(false)

    // Cleanup on unmount
    return () => {
      clearRefreshTimeout()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh user data from server
  const refreshUser = useCallback(async () => {
    if (!token) return

    try {
      const response = await client.get(AUTH_ENDPOINTS.me)
      const userData = response.data
      setUser(userData)
      localStorage.setItem(USER_KEY, JSON.stringify(userData))
    } catch (error) {
      // Token might be invalid, try refresh
      console.error('Failed to refresh user:', error)
      const refreshed = await refreshAccessToken()
      if (!refreshed) {
        logout()
      }
    }
  }, [token, refreshAccessToken, logout])

  // Login
  const login = useCallback(async (email: string, password: string) => {
    const response = await client.post(AUTH_ENDPOINTS.login, { email, password })
    const { access_token, refresh_token, expires_in, user: userData } = response.data

    // Store auth data
    setToken(access_token)
    setUser(userData)
    localStorage.setItem(TOKEN_KEY, access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    
    // Store refresh token if provided
    if (refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token)
    }
    
    // Calculate and store expiry time
    const expiresInSeconds = expires_in || 900 // Default 15 min
    const expiryTime = Date.now() + expiresInSeconds * 1000
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString())

    // Set default auth header
    client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

    // Schedule token refresh
    scheduleTokenRefresh(expiresInSeconds)
  }, [scheduleTokenRefresh])

  // Set password (for new users or password reset)
  const setPasswordFn = useCallback(async (resetToken: string, password: string) => {
    const response = await client.post(AUTH_ENDPOINTS.setPassword, {
      token: resetToken,
      password,
    })
    const { access_token, refresh_token, expires_in, user: userData } = response.data

    // Auto-login after setting password
    setToken(access_token)
    setUser(userData)
    localStorage.setItem(TOKEN_KEY, access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    
    if (refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token)
    }
    
    const expiresInSeconds = expires_in || 900
    const expiryTime = Date.now() + expiresInSeconds * 1000
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString())
    
    client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
    scheduleTokenRefresh(expiresInSeconds)
  }, [scheduleTokenRefresh])

  // Forgot password
  const forgotPassword = useCallback(async (email: string) => {
    await client.post(AUTH_ENDPOINTS.forgotPassword, { email })
  }, [])

  // Change password
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await client.post(AUTH_ENDPOINTS.changePassword, {
      current_password: currentPassword,
      new_password: newPassword,
    })
  }, [])

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    isAdmin: user?.role === 'admin',
    login,
    logout,
    setPassword: setPasswordFn,
    forgotPassword,
    changePassword,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Hook to require authentication
export function useRequireAuth(redirectTo: string = '/login') {
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = redirectTo
    }
  }, [isAuthenticated, isLoading, redirectTo])

  return { isAuthenticated, isLoading }
}

// Hook to require admin role
export function useRequireAdmin(redirectTo: string = '/') {
  const { isAuthenticated, isAdmin, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin)) {
      window.location.href = redirectTo
    }
  }, [isAuthenticated, isAdmin, isLoading, redirectTo])

  return { isAuthenticated, isAdmin, isLoading }
}

export default AuthContext
