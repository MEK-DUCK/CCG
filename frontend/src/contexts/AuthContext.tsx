import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
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
const USER_KEY = 'oil_lifting_user'

// DEV MODE: Set to true to bypass authentication during development
const DEV_MODE = true
const DEV_USER: User = {
  id: 1,
  email: 'dev@oillifting.local',
  full_name: 'Developer',
  initials: 'DEV',
  role: 'admin',
  status: 'active',
}

// API endpoints
const AUTH_ENDPOINTS = {
  login: '/api/auth/login',
  setPassword: '/api/auth/set-password',
  forgotPassword: '/api/auth/forgot-password',
  changePassword: '/api/auth/change-password',
  me: '/api/auth/me',
  logout: '/api/auth/logout',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(DEV_MODE ? DEV_USER : null)
  const [token, setToken] = useState<string | null>(DEV_MODE ? 'dev-token' : null)
  const [isLoading, setIsLoading] = useState(false)

  // Initialize auth state from localStorage (or set DEV user in DEV_MODE)
  useEffect(() => {
    if (DEV_MODE) {
      console.log('🔓 DEV MODE: Authentication bypassed. Logged in as:', DEV_USER.full_name)
      // Save DEV user to localStorage so API client can read initials
      localStorage.setItem(USER_KEY, JSON.stringify(DEV_USER))
      localStorage.setItem(TOKEN_KEY, 'dev-token')
      return
    }

    setIsLoading(true)
    const storedToken = localStorage.getItem(TOKEN_KEY)
    const storedUser = localStorage.getItem(USER_KEY)

    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
        // Set default auth header
        client.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
      } catch (e) {
        // Invalid stored data, clear it
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      }
    }
    setIsLoading(false)
  }, [])

  // Refresh user data from server
  const refreshUser = useCallback(async () => {
    if (!token) return

    try {
      const response = await client.get(AUTH_ENDPOINTS.me)
      const userData = response.data
      setUser(userData)
      localStorage.setItem(USER_KEY, JSON.stringify(userData))
    } catch (error) {
      // Token might be invalid, logout
      console.error('Failed to refresh user:', error)
      logout()
    }
  }, [token])

  // Login
  const login = useCallback(async (email: string, password: string) => {
    const response = await client.post(AUTH_ENDPOINTS.login, { email, password })
    const { access_token, user: userData } = response.data

    // Store auth data
    setToken(access_token)
    setUser(userData)
    localStorage.setItem(TOKEN_KEY, access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))

    // Set default auth header
    client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
  }, [])

  // Logout
  const logout = useCallback(() => {
    // Clear state
    setToken(null)
    setUser(null)

    // Clear storage
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)

    // Remove auth header
    delete client.defaults.headers.common['Authorization']

    // Call logout endpoint (fire and forget)
    client.post(AUTH_ENDPOINTS.logout).catch(() => {})
  }, [])

  // Set password (for new users or password reset)
  const setPassword = useCallback(async (resetToken: string, password: string) => {
    const response = await client.post(AUTH_ENDPOINTS.setPassword, {
      token: resetToken,
      password,
    })
    const { access_token, user: userData } = response.data

    // Auto-login after setting password
    setToken(access_token)
    setUser(userData)
    localStorage.setItem(TOKEN_KEY, access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
  }, [])

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
    setPassword,
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

