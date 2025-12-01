/**
 * Utility functions for parsing laycan date strings into Date objects
 * Supports formats:
 * - "15-20 Nov 2024" (full date range)
 * - "15 Nov 2024" (single date)
 * - "02-03/11" (day-month format)
 * - "02-03" (day range only, uses reference month/year)
 */

export interface LaycanDate {
  startDate: Date | null
  endDate: Date | null
  isValid: boolean
  daysUntil: number | null
  isOverdue: boolean
}

/**
 * Parse a laycan string into start and end dates
 */
export function parseLaycanDate(
  laycan: string,
  referenceMonth?: number,
  referenceYear?: number
): LaycanDate {
  // Handle TBA or empty
  if (!laycan || laycan.trim() === '' || laycan === 'TBA' || laycan === '-') {
    return {
      startDate: null,
      endDate: null,
      isValid: false,
      daysUntil: null,
      isOverdue: false,
    }
  }

  const now = new Date()
  const month = referenceMonth || now.getMonth() + 1
  const year = referenceYear || now.getFullYear()

  // Format 1: "15-20 Nov 2024" or "15 Nov 2024" (full date with month name)
  const fullDateMatch = laycan.match(/(\d{1,2})(?:[\s-]+(\d{1,2}))?[\s-]*([a-z]{3})[\s-]+(\d{4})/i)
  if (fullDateMatch) {
    const startDay = parseInt(fullDateMatch[1])
    const endDay = fullDateMatch[2] ? parseInt(fullDateMatch[2]) : startDay
    const monthName = fullDateMatch[3].toLowerCase()
    const yearValue = parseInt(fullDateMatch[4])

    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const monthIndex = monthNames.indexOf(monthName)
    if (monthIndex >= 0) {
      const startDate = new Date(yearValue, monthIndex, startDay)
      const endDate = new Date(yearValue, monthIndex, endDay)
      const daysUntil = calculateDaysUntil(startDate)
      return {
        startDate,
        endDate,
        isValid: true,
        daysUntil,
        isOverdue: daysUntil < 0,
      }
    }
  }

  // Format 2: "02-03/11" or "2-3/11" (day-month format)
  const dayMonthMatch = laycan.match(/(\d{1,2})[\s-]+(\d{1,2})[\s/]+(\d{1,2})/)
  if (dayMonthMatch) {
    const startDay = parseInt(dayMonthMatch[1])
    const endDay = parseInt(dayMonthMatch[2])
    const monthValue = parseInt(dayMonthMatch[3])
    const yearValue = year // Use reference year

    const startDate = new Date(yearValue, monthValue - 1, startDay)
    const endDate = new Date(yearValue, monthValue - 1, endDay)
    const daysUntil = calculateDaysUntil(startDate)
    return {
      startDate,
      endDate,
      isValid: true,
      daysUntil,
      isOverdue: daysUntil < 0,
    }
  }

  // Format 3: "02-03" or "2-3" (day range only, uses reference month/year)
  const dayRangeMatch = laycan.match(/(\d{1,2})[\s-]+(\d{1,2})/)
  if (dayRangeMatch) {
    const startDay = parseInt(dayRangeMatch[1])
    const endDay = parseInt(dayRangeMatch[2])

    const startDate = new Date(year, month - 1, startDay)
    const endDate = new Date(year, month - 1, endDay)
    const daysUntil = calculateDaysUntil(startDate)
    return {
      startDate,
      endDate,
      isValid: true,
      daysUntil,
      isOverdue: daysUntil < 0,
    }
  }

  // Format 4: Single day "15" (uses reference month/year)
  const singleDayMatch = laycan.match(/^(\d{1,2})$/)
  if (singleDayMatch) {
    const day = parseInt(singleDayMatch[1])
    const startDate = new Date(year, month - 1, day)
    const endDate = new Date(year, month - 1, day)
    const daysUntil = calculateDaysUntil(startDate)
    return {
      startDate,
      endDate,
      isValid: true,
      daysUntil,
      isOverdue: daysUntil < 0,
    }
  }

  // If no format matches, return invalid
  return {
    startDate: null,
    endDate: null,
    isValid: false,
    daysUntil: null,
    isOverdue: false,
  }
}

/**
 * Calculate days until a date (negative if overdue)
 */
export function calculateDaysUntil(date: Date): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

