/**
 * Real-time data synchronization hook for live updates.
 * 
 * Connects to WebSocket and receives push notifications when data changes
 * on the server. This enables an "Excel-like" experience where changes made
 * by one user appear instantly for all other users.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'

export interface DataSyncEvent {
  change_type: 'created' | 'updated' | 'deleted'
  entity_type: string  // 'cargo', 'monthly_plan', etc.
  entity_id: number
  entity_data: Record<string, unknown> | null
  changed_by: {
    user_id: number
    initials: string
  } | null
  timestamp: string
}

export interface RealTimeSyncState {
  isConnected: boolean
  lastEvent: DataSyncEvent | null
  error: string | null
}

interface UseRealTimeSyncOptions {
  /** Called when data changes are received */
  onDataSync?: (event: DataSyncEvent) => void
  /** Called when a specific entity type changes */
  onCargoChange?: (event: DataSyncEvent) => void
  onMonthlyPlanChange?: (event: DataSyncEvent) => void
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number
  /** Whether sync is enabled (default: true) */
  enabled?: boolean
}

/**
 * Hook for real-time data synchronization on a page.
 * 
 * @param pageName - Name of the page to sync (e.g., 'port-movement')
 * @param options - Callbacks and configuration
 * 
 * @example
 * // Sync port movement page with automatic cargo updates
 * const { isConnected } = useRealTimeSync('port-movement', {
 *   onCargoChange: (event) => {
 *     if (event.change_type === 'created') {
 *       // Add new cargo to state
 *       setPortMovement(prev => [...prev, event.entity_data])
 *     } else if (event.change_type === 'updated') {
 *       // Update existing cargo
 *       setPortMovement(prev => prev.map(c => 
 *         c.id === event.entity_id ? { ...c, ...event.entity_data } : c
 *       ))
 *     } else if (event.change_type === 'deleted') {
 *       // Remove cargo from state
 *       setPortMovement(prev => prev.filter(c => c.id !== event.entity_id))
 *     }
 *   }
 * })
 */
export function useRealTimeSync(
  pageName: string,
  options: UseRealTimeSyncOptions = {}
): RealTimeSyncState {
  const { user, token } = useAuth()
  const [state, setState] = useState<RealTimeSyncState>({
    isConnected: false,
    lastEvent: null,
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
    const isDev = import.meta.env.DEV
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = isDev ? 'localhost:8000' : window.location.host
    return `${protocol}//${host}/api/ws/presence/page/${pageName}?token=${token}`
  }, [pageName, token])
  
  // Connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true
    isCleaningUpRef.current = false
    
    console.log(`[RealTimeSync] useEffect triggered - enabled: ${enabled}, token: ${!!token}, user: ${!!user}`)
    
    if (!enabled || !token || !user) {
      console.log(`[RealTimeSync] Not connecting - missing requirements`)
      return
    }
    
    const connect = () => {
      if (isCleaningUpRef.current || !mountedRef.current) {
        return
      }
      
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      
      try {
        const wsUrl = getWsUrl()
        console.log(`[RealTimeSync] Connecting to ${wsUrl}`)
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws
        
        ws.onopen = () => {
          if (!mountedRef.current) {
            ws.close()
            return
          }
          console.log(`[RealTimeSync] Connected to page/${pageName}`)
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
            
            // Handle data sync events
            if (data.type === 'data_sync') {
              const syncEvent: DataSyncEvent = {
                change_type: data.change_type,
                entity_type: data.entity_type,
                entity_id: data.entity_id,
                entity_data: data.entity_data,
                changed_by: data.changed_by,
                timestamp: data.timestamp,
              }
              
              console.log(`[RealTimeSync] ${syncEvent.change_type} ${syncEvent.entity_type}:${syncEvent.entity_id} by ${syncEvent.changed_by?.initials || 'unknown'}`)
              
              // Update state
              setState(prev => ({ ...prev, lastEvent: syncEvent }))
              
              // Call generic callback
              if (callbacksRef.current.onDataSync) {
                callbacksRef.current.onDataSync(syncEvent)
              }
              
              // Call entity-specific callbacks
              if (syncEvent.entity_type === 'cargo' && callbacksRef.current.onCargoChange) {
                callbacksRef.current.onCargoChange(syncEvent)
              }
              if (syncEvent.entity_type === 'monthly_plan' && callbacksRef.current.onMonthlyPlanChange) {
                callbacksRef.current.onMonthlyPlanChange(syncEvent)
              }
            }
            // Ignore presence messages - we're only interested in data changes
          } catch (e) {
            console.error('[RealTimeSync] Failed to parse message:', e)
          }
        }
        
        ws.onclose = (event) => {
          console.log(`[RealTimeSync] Disconnected from page/${pageName}`, event.code)
          
          if (mountedRef.current) {
            setState(prev => ({ ...prev, isConnected: false }))
          }
          
          if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current)
            heartbeatRef.current = null
          }
          
          // Auto-reconnect with exponential backoff
          if (autoReconnect && !isCleaningUpRef.current && mountedRef.current && event.code !== 4001) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
            reconnectAttemptsRef.current++
            console.log(`[RealTimeSync] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`)
            reconnectRef.current = setTimeout(connect, delay)
          }
        }
        
        ws.onerror = (error) => {
          console.error('[RealTimeSync] WebSocket error:', error)
          if (mountedRef.current) {
            setState(prev => ({ ...prev, error: 'Connection error' }))
          }
        }
        
      } catch (e) {
        console.error('[RealTimeSync] Failed to connect:', e)
        if (mountedRef.current) {
          setState(prev => ({ ...prev, error: 'Failed to connect' }))
        }
      }
    }
    
    // Small delay to handle React Strict Mode
    const connectTimeout = setTimeout(connect, 100)
    
    return () => {
      isCleaningUpRef.current = true
      mountedRef.current = false
      
      clearTimeout(connectTimeout)
      
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
      
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [enabled, token, user?.id, pageName, getWsUrl, autoReconnect, heartbeatInterval])
  
  return state
}

export default useRealTimeSync

