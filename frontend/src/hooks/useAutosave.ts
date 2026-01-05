import { useRef, useCallback } from 'react'
import { monthlyPlanAPI } from '../api/client'

interface PendingChange {
  data: Record<string, any>
  version?: number
  monthKey?: string
  entryIndex?: number
}

interface AutosaveCallbacks {
  onVersionUpdate?: (planId: number, newVersion: number, monthKey: string, entryIndex: number) => void
  onError?: (error: any, planId: number) => void
}

/**
 * Hook for managing autosave functionality with debouncing and batching.
 * Accumulates multiple field changes and saves them together after a delay.
 */
export function useAutosave(callbacks?: AutosaveCallbacks) {
  const autosaveTimersRef = useRef<Record<string, number>>({})
  const pendingChangesRef = useRef<Record<number, PendingChange>>({})

  const scheduleAutosave = useCallback((
    planId: number,
    data: Record<string, any>,
    _keySuffix: string,
    version?: number,
    monthKey?: string,
    entryIndex?: number
  ) => {
    // Use a single timer key per plan to batch all changes together
    const key = `plan:${planId}`
    
    // Accumulate changes for this plan - merge with existing pending changes
    const existing = pendingChangesRef.current[planId] || { data: {} }
    const newData = { ...existing.data, ...data }
    
    pendingChangesRef.current[planId] = {
      data: newData,
      version: version ?? existing.version,
      monthKey: monthKey ?? existing.monthKey,
      entryIndex: entryIndex !== undefined ? entryIndex : existing.entryIndex,
    }
    
    console.log(`[Autosave] Accumulated changes for plan ${planId}:`, Object.keys(newData))
    
    // Clear existing timer for this plan
    const existingTimer = autosaveTimersRef.current[key]
    if (existingTimer) {
      console.log(`[Autosave] Clearing existing timer for plan ${planId}`)
      window.clearTimeout(existingTimer)
      delete autosaveTimersRef.current[key]
    }
    
    // Set new timer - will save all accumulated changes after 2 minutes of no activity
    autosaveTimersRef.current[key] = window.setTimeout(async () => {
      const pending = pendingChangesRef.current[planId]
      if (!pending || Object.keys(pending.data).length === 0) return
      
      // Clear pending changes before saving
      delete pendingChangesRef.current[planId]
      delete autosaveTimersRef.current[key]
      
      console.log(`[Autosave] Saving batched changes for plan ${planId}:`, Object.keys(pending.data))
      
      try {
        // Include version for optimistic locking
        const updateData = { ...pending.data, version: pending.version || 1 }
        const result = await monthlyPlanAPI.update(planId, updateData)
        
        // Notify about version update for optimistic locking
        if (pending.monthKey !== undefined && pending.entryIndex !== undefined && result.data?.version) {
          callbacks?.onVersionUpdate?.(planId, result.data.version, pending.monthKey, pending.entryIndex)
        }
      } catch (error) {
        console.error('Error autosaving monthly plan field:', error)
        callbacks?.onError?.(error, planId)
      }
    }, 120000)  // 120 second (2 min) delay to allow batching multiple field changes
  }, [callbacks])

  /**
   * Cancel all pending autosave timers (e.g., on unmount or manual save)
   */
  const cancelAllPending = useCallback(() => {
    Object.values(autosaveTimersRef.current).forEach(timer => {
      window.clearTimeout(timer)
    })
    autosaveTimersRef.current = {}
    pendingChangesRef.current = {}
  }, [])

  /**
   * Flush all pending changes immediately (save now instead of waiting)
   */
  const flushPending = useCallback(async () => {
    const pendingPlans = Object.entries(pendingChangesRef.current)
    
    // Clear all timers
    Object.values(autosaveTimersRef.current).forEach(timer => {
      window.clearTimeout(timer)
    })
    autosaveTimersRef.current = {}
    pendingChangesRef.current = {}
    
    // Save all pending changes
    const savePromises = pendingPlans.map(async ([planIdStr, pending]) => {
      const planId = parseInt(planIdStr, 10)
      if (Object.keys(pending.data).length === 0) return
      
      try {
        const updateData = { ...pending.data, version: pending.version || 1 }
        const result = await monthlyPlanAPI.update(planId, updateData)
        
        if (pending.monthKey !== undefined && pending.entryIndex !== undefined && result.data?.version) {
          callbacks?.onVersionUpdate?.(planId, result.data.version, pending.monthKey, pending.entryIndex)
        }
      } catch (error) {
        console.error(`Error flushing autosave for plan ${planId}:`, error)
        callbacks?.onError?.(error, planId)
      }
    })
    
    await Promise.all(savePromises)
  }, [callbacks])

  return {
    scheduleAutosave,
    cancelAllPending,
    flushPending,
    autosaveTimersRef,
  }
}

export default useAutosave

