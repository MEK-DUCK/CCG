/**
 * Real-time presence tracking hook for collaborative awareness.
 * 
 * Connects to WebSocket to track which users are viewing the same resource
 * and receive notifications when data changes.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'

export interface PresenceUser {
  user_id: number
  initials: string
  full_name: string
  connected_at: string
}

export interface PresenceState {
  users: PresenceUser[]
  otherUsers: PresenceUser[]  // Excludes current user
  isConnected: boolean
  error: string | null
}

export interface DataChangedEvent {
  user: PresenceUser
  change_type: 'create' | 'update' | 'delete'
}

interface UsePresenceOptions {
  /** Called when another user modifies the data */
  onDataChanged?: (event: DataChangedEvent) => void
  /** Called when another user starts editing a field */
  onUserEditing?: (user: PresenceUser, field: string) => void
  /** Called when another user stops editing */
  onUserStoppedEditing?: (user: PresenceUser) => void
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number
  /** Whether presence tracking is enabled (default: true). Set to false to disable connection. */
  enabled?: boolean
}

/**
 * Hook for tracking presence on a resource.
 * 
 * @param resourceType - Type of resource (page, monthly-plan, contract, cargo, etc.)
 * @param resourceId - ID of the resource (use 'home' for pages)
 * @param options - Optional callbacks and configuration
 * 
 * @example
 * // Track presence on a page
 * const { users, otherUsers, isConnected } = usePresence('page', 'home')
 * 
 * @example
 * // Track presence on a specific monthly plan with change notifications
 * const { users, otherUsers, notifyEditing } = usePresence('monthly-plan', planId.toString(), {
 *   onDataChanged: (event) => {
 *     toast.info(`${event.user.initials} made changes. Click to refresh.`)
 *   }
 * })
 */
export function usePresence(
  resourceType: string,
  resourceId: string,
  options: UsePresenceOptions = {}
): PresenceState & {
  notifyEditing: (field: string) => void
  notifyStoppedEditing: () => void
} {
  const { user, token } = useAuth()
  const [state, setState] = useState<PresenceState>({
    users: [],
    otherUsers: [],
    isConnected: false,
    error: null,
  })
  
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const isCleaningUpRef = useRef(false)
  const mountedRef = useRef(true)
  
  // Store callbacks in refs to avoid dependency issues
  const callbacksRef = useRef(options)
  callbacksRef.current = options
  
  const {
    autoReconnect = true,
    heartbeatInterval = 30000,
    enabled = true,
  } = options
  
  // Get WebSocket URL - connect directly to backend
  const getWsUrl = useCallback(() => {
    // In development, connect directly to the backend WebSocket server
    // In production, use VITE_API_URL if set, otherwise fall back to window.location.host
    const isDev = import.meta.env.DEV
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    
    // For development, always connect to backend directly at port 8000
    // The Vite proxy doesn't handle WebSocket upgrades well
    let host: string
    if (isDev) {
      host = 'localhost:8000'
    } else {
      const apiUrl = import.meta.env.VITE_API_URL
      if (apiUrl) {
        // Extract host from API URL (e.g., https://ccg-2knb.onrender.com -> ccg-2knb.onrender.com)
        try {
          const url = new URL(apiUrl)
          host = url.host
        } catch {
          host = window.location.host
        }
      } else {
        host = window.location.host
      }
    }
    
    return `${protocol}//${host}/api/ws/presence/${resourceType}/${resourceId}?token=${token}`
  }, [resourceType, resourceId, token])
  
  // Notify that current user is editing a field
  const notifyEditing = useCallback((field: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'editing', field }))
    }
  }, [])
  
  // Notify that current user stopped editing
  const notifyStoppedEditing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stopped_editing' }))
    }
  }, [])
  
  // Connect on mount, disconnect on unmount
  // Use stable dependencies to avoid reconnection loops
  useEffect(() => {
    // Reset mounted flag
    mountedRef.current = true
    isCleaningUpRef.current = false
    
    // Don't connect if disabled or missing auth
    if (!enabled || !token || !user) {
      return
    }
    
    const currentUserId = user.id
    
    // Connect to WebSocket
    const connect = () => {
      if (isCleaningUpRef.current || !mountedRef.current) {
        return
      }
      
      // Close existing connection
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      
      try {
        const wsUrl = getWsUrl()
        console.log(`[Presence] Connecting to ${wsUrl}`)
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws
        
        ws.onopen = () => {
          if (!mountedRef.current) {
            ws.close()
            return
          }
          console.log(`[Presence] Connected to ${resourceType}/${resourceId}`)
          setState(prev => ({ ...prev, isConnected: true, error: null }))
          reconnectAttemptsRef.current = 0
          
          // Start heartbeat
          if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current)
          }
          heartbeatRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'heartbeat' }))
            }
          }, heartbeatInterval)
        }
        
        ws.onmessage = (event) => {
          if (!mountedRef.current) return
          
          try {
            const data = JSON.parse(event.data)
            
            switch (data.type) {
              case 'presence':
                // Update users list
                const users = data.users as PresenceUser[]
                const otherUsers = users.filter(u => u.user_id !== currentUserId)
                setState(prev => ({ ...prev, users, otherUsers }))
                break
                
              case 'data_changed':
                // Another user modified the data
                if (callbacksRef.current.onDataChanged) {
                  callbacksRef.current.onDataChanged({
                    user: data.user,
                    change_type: data.change_type,
                  })
                }
                break
                
              case 'user_editing':
                // Another user is editing a field
                if (callbacksRef.current.onUserEditing) {
                  callbacksRef.current.onUserEditing(data.user, data.field)
                }
                break
                
              case 'user_stopped_editing':
                // Another user stopped editing
                if (callbacksRef.current.onUserStoppedEditing) {
                  callbacksRef.current.onUserStoppedEditing(data.user)
                }
                break
                
              case 'heartbeat_ack':
                // Heartbeat acknowledged - connection is alive
                break
                
              case 'error':
                console.error('[Presence] Error:', data.message)
                setState(prev => ({ ...prev, error: data.message }))
                break
            }
          } catch (e) {
            console.error('[Presence] Failed to parse message:', e)
          }
        }
        
        ws.onclose = (event) => {
          console.log(`[Presence] Disconnected from ${resourceType}/${resourceId}`, event.code)
          
          if (mountedRef.current) {
            setState(prev => ({ ...prev, isConnected: false }))
          }
          
          // Clear heartbeat
          if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current)
            heartbeatRef.current = null
          }
          
          // Auto-reconnect with exponential backoff (only if not cleaning up)
          // Skip reconnect for code 1005 (no status) which often happens during React Strict Mode cleanup
          if (autoReconnect && !isCleaningUpRef.current && mountedRef.current && event.code !== 4001 && event.code !== 1005) {
            const delay = Math.min(2000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
            reconnectAttemptsRef.current++
            
            console.log(`[Presence] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`)
            reconnectRef.current = setTimeout(connect, delay)
          }
        }
        
        ws.onerror = (error) => {
          console.error('[Presence] WebSocket error:', error)
          if (mountedRef.current) {
            setState(prev => ({ ...prev, error: 'Connection error' }))
          }
        }
        
      } catch (e) {
        console.error('[Presence] Failed to connect:', e)
        if (mountedRef.current) {
          setState(prev => ({ ...prev, error: 'Failed to connect' }))
        }
      }
    }
    
    // Longer delay to handle React Strict Mode double-mounting in development
    // This prevents rapid connect/disconnect cycles that confuse the presence system
    const connectTimeout = setTimeout(connect, 500)
    
    return () => {
      // Mark as cleaning up to prevent reconnection attempts
      isCleaningUpRef.current = true
      mountedRef.current = false
      
      clearTimeout(connectTimeout)
      
      // Clear timers
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
      
      // Close connection
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  // Only reconnect when these core values change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, user?.id, resourceType, resourceId, getWsUrl])
  
  return {
    ...state,
    notifyEditing,
    notifyStoppedEditing,
  }
}

/**
 * Simplified hook for page-level presence (no resource ID needed).
 */
export function usePagePresence(pageName: string, options?: UsePresenceOptions) {
  return usePresence('page', pageName, options)
}

export default usePresence

