/**
 * Voyage duration configuration and delivery window calculation utilities.
 * 
 * Trip durations are from first day of loading window to destination,
 * including 2-day laycan allowance.
 */

// Voyage duration lookup table (days including 2-day laycan)
export const VOYAGE_DURATIONS: Record<string, Record<string, number>> = {
  "Rotterdam": { "SUEZ": 24, "CAPE": 40 },
  "Le Havre": { "SUEZ": 24, "CAPE": 40 },
  "Shell Haven": { "SUEZ": 24, "CAPE": 40 },
  "Naples": { "SUEZ": 17, "CAPE": 40 },
  "Milford Haven": { "SUEZ": 23, "CAPE": 39 },
}

// List of valid destinations for dropdowns
export const CIF_DESTINATIONS = Object.keys(VOYAGE_DURATIONS)

// List of valid routes
export const CIF_ROUTES = ["SUEZ", "CAPE"]

/**
 * Get voyage duration in days for a destination and route.
 */
export function getVoyageDuration(destination: string, route: string): number | null {
  const destRoutes = VOYAGE_DURATIONS[destination]
  if (!destRoutes) return null
  return destRoutes[route] ?? null
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

