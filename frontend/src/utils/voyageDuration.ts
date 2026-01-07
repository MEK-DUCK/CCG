/**
 * Voyage duration configuration and delivery window calculation utilities.
 * 
 * Trip durations are from first day of loading window to destination,
 * including 2-day laycan allowance.
 * 
 * Voyage durations are now fetched from the database via the discharge ports API.
 */

// Cache for voyage durations fetched from API
let voyageDurationsCache: Record<string, { suez: number | null, cape: number | null }> = {}
let cacheLoaded = false

// List of valid routes
export const CIF_ROUTES = ["SUEZ", "CAPE"]

// Single-route destinations (no route selection needed, same-month delivery allowed)
// These destinations only have a Suez route with short voyage duration
export const SINGLE_ROUTE_DESTINATIONS = ["Djibouti", "Keamari/Fotco"]

/**
 * Check if a destination is a single-route destination.
 * Single-route destinations don't require route selection and allow same-month delivery.
 */
export function isSingleRouteDestination(destination: string | undefined | null): boolean {
  if (!destination) return false
  return SINGLE_ROUTE_DESTINATIONS.includes(destination)
}

/**
 * Interface for discharge port data from API
 */
export interface DischargePort {
  id: number
  name: string
  restrictions?: string
  voyage_days_suez?: number
  voyage_days_cape?: number
  is_active: boolean
  sort_order: number
}

/**
 * Load voyage durations from the API into the cache.
 * This should be called once when the app initializes or when discharge ports are updated.
 */
export async function loadVoyageDurations(): Promise<void> {
  try {
    const response = await fetch('/api/discharge-ports')
    if (response.ok) {
      const ports: DischargePort[] = await response.json()
      voyageDurationsCache = {}
      ports.forEach(port => {
        voyageDurationsCache[port.name] = {
          suez: port.voyage_days_suez ?? null,
          cape: port.voyage_days_cape ?? null
        }
      })
      cacheLoaded = true
    }
  } catch (error) {
    console.error('Failed to load voyage durations from API:', error)
  }
}

/**
 * Get the list of valid CIF destinations from the cache.
 */
export function getCifDestinations(): string[] {
  return Object.keys(voyageDurationsCache)
}

/**
 * Get voyage duration in days for a destination and route.
 * Uses cached data from the database.
 * For single-route destinations, returns the available route duration regardless of route param.
 */
export function getVoyageDuration(destination: string, route: string): number | null {
  const portData = voyageDurationsCache[destination]
  if (!portData) return null

  // For single-route destinations, return the only available route (suez)
  if (isSingleRouteDestination(destination)) {
    return portData.suez
  }

  if (route && route.toUpperCase() === 'SUEZ') {
    return portData.suez
  } else if (route && route.toUpperCase() === 'CAPE') {
    return portData.cape
  }

  return null
}

/**
 * Set voyage durations directly (used when ports are fetched elsewhere).
 */
export function setVoyageDurations(ports: DischargePort[]): void {
  voyageDurationsCache = {}
  ports.forEach(port => {
    voyageDurationsCache[port.name] = {
      suez: port.voyage_days_suez ?? null,
      cape: port.voyage_days_cape ?? null
    }
  })
  cacheLoaded = true
}

/**
 * Check if voyage durations have been loaded.
 */
export function isVoyageDurationsLoaded(): boolean {
  return cacheLoaded
}

/**
 * Parse the first day from a loading window string.
 * 
 * Supports formats:
 * - "01-05/01" (DD-DD/MM)
 * - "1-5/1" (D-D/M)
 * - "15-20" (DD-DD, uses provided month/year)
 */
export function parseLoadingWindowStart(
  loadingWindow: string,
  month: number,
  year: number
): Date | null {
  if (!loadingWindow) return null
  
  loadingWindow = loadingWindow.trim()
  
  try {
    // Format: "DD-DD/MM" or "D-D/M"
    if (loadingWindow.includes("/")) {
      const parts = loadingWindow.split("/")
      const dayPart = parts[0]  // "01-05" or "1-5"
      const monthPart = parts[1]  // "01" or "1"
      
      // Get first day
      const firstDay = parseInt(dayPart.split("-")[0], 10)
      const parsedMonth = parseInt(monthPart, 10)
      
      // Determine year - if parsed month < reference month, it might be next year
      let parsedYear = year
      if (parsedMonth < month) {
        parsedYear = year + 1
      }
      
      return new Date(parsedYear, parsedMonth - 1, firstDay)
    }
    
    // Format: "DD-DD" (use reference month/year)
    if (loadingWindow.includes("-")) {
      const firstDay = parseInt(loadingWindow.split("-")[0], 10)
      return new Date(year, month - 1, firstDay)
    }
    
    // Single day
    const firstDay = parseInt(loadingWindow, 10)
    return new Date(year, month - 1, firstDay)
    
  } catch {
    return null
  }
}

/**
 * Get the last day of a month.
 */
function getLastDayOfMonth(year: number, month: number): number {
  // month is 0-indexed for Date, so month+1 with day 0 gives last day of month
  return new Date(year, month, 0).getDate()
}

/**
 * Calculate the ETA (Estimated Time of Arrival) date.
 * ETA = First day of loading window + voyage duration
 * 
 * Returns a formatted date string like "Mar 24" or null if cannot calculate.
 */
export function calculateETA(
  loadingWindow: string,
  destination: string,
  route: string,
  month: number,
  year: number
): string | null {
  // Get voyage duration
  const duration = getVoyageDuration(destination, route)
  if (duration === null) return null
  
  // Parse loading window start date
  const loadingStart = parseLoadingWindowStart(loadingWindow, month, year)
  if (!loadingStart) return null
  
  // Calculate ETA
  const eta = new Date(loadingStart)
  eta.setDate(eta.getDate() + duration)
  
  // Format as "Mon DD" (e.g., "Mar 24")
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${monthNames[eta.getMonth()]} ${eta.getDate()}`
}

/**
 * Calculate the full ETA date object.
 * Returns the Date object or null if cannot calculate.
 */
export function calculateETADate(
  loadingWindow: string,
  destination: string,
  route: string,
  month: number,
  year: number
): Date | null {
  // Get voyage duration
  const duration = getVoyageDuration(destination, route)
  if (duration === null) return null
  
  // Parse loading window start date
  const loadingStart = parseLoadingWindowStart(loadingWindow, month, year)
  if (!loadingStart) return null
  
  // Calculate ETA
  const eta = new Date(loadingStart)
  eta.setDate(eta.getDate() + duration)
  
  return eta
}

/**
 * Calculate the delivery window based on loading window, destination, and route.
 * 
 * Formula logic:
 * - Delivery Start = First day of Loading + Trip Duration
 * - Delivery End = Delivery Start + 14 days
 * - If same month: "(StartDay-EndDay/Month)"
 * - If cross-month: Use last 15 days of delivery start month
 */
export function calculateDeliveryWindow(
  loadingWindow: string,
  destination: string,
  route: string,
  month: number,
  year: number
): string | null {
  // Get voyage duration
  const duration = getVoyageDuration(destination, route)
  if (duration === null) return null
  
  // Parse loading window start date
  const loadingStart = parseLoadingWindowStart(loadingWindow, month, year)
  if (!loadingStart) return null
  
  // Calculate delivery dates
  const deliveryStart = new Date(loadingStart)
  deliveryStart.setDate(deliveryStart.getDate() + duration)
  
  const deliveryEnd = new Date(loadingStart)
  deliveryEnd.setDate(deliveryEnd.getDate() + duration + 14)
  
  // Check if same month
  if (deliveryStart.getMonth() === deliveryEnd.getMonth()) {
    // Same month: (StartDay-EndDay/Month)
    const monthNum = deliveryStart.getMonth() + 1  // Convert to 1-indexed
    return `(${deliveryStart.getDate()}-${deliveryEnd.getDate()}/${monthNum})`
  } else {
    // Cross-month: Use last 15 days of delivery start month
    const deliveryMonth = deliveryStart.getMonth() + 1  // 1-indexed
    const lastDayOfMonth = getLastDayOfMonth(deliveryStart.getFullYear(), deliveryMonth)
    const adjustedStart = lastDayOfMonth - 14  // 15 days from end
    return `(${adjustedStart}-${lastDayOfMonth}/${deliveryMonth})`
  }
}

