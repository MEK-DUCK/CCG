/**
 * Utility functions for Monthly Plan calculations and formatting.
 */

export const QUARTER_MONTHS: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', { months: number[], labels: string[] }> = {
  Q1: { months: [1, 2, 3], labels: ['January', 'February', 'March'] },
  Q2: { months: [4, 5, 6], labels: ['April', 'May', 'June'] },
  Q3: { months: [7, 8, 9], labels: ['July', 'August', 'September'] },
  Q4: { months: [10, 11, 12], labels: ['October', 'November', 'December'] },
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Simple UUID generator for creating unique identifiers.
 */
export const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Get month name from month number (1-12).
 */
export const getMonthName = (month: number): string => {
  const date = new Date(2000, month - 1, 1)
  return date.toLocaleString('default', { month: 'long' })
}

/**
 * Generate delivery month options for CIF contracts.
 * Shows months AFTER the loading month (delivery cannot be same month as loading).
 * Typically shows next 3 months after loading month.
 *
 * For single-route destinations (allowSameMonth=true), also includes the loading month itself
 * since short voyage durations allow same-month delivery.
 */
export const getDeliveryMonthOptions = (
  loadingMonth: number,
  loadingYear: number,
  allowSameMonth: boolean = false
): Array<{ value: string, label: string }> => {
  const options: Array<{ value: string, label: string }> = []

  // For single-route destinations, include the loading month itself (same-month delivery allowed)
  const startOffset = allowSameMonth ? 0 : 1

  // Generate options for 3 months (starting from loading month if allowSameMonth, otherwise from next month)
  for (let i = startOffset; i <= startOffset + 2; i++) {
    const date = new Date(loadingYear, loadingMonth - 1 + i, 1)
    const month = date.getMonth() + 1
    const year = date.getFullYear()
    const monthName = MONTH_NAMES[month - 1]
    options.push({
      value: `${monthName} ${year}`,
      label: `${monthName} ${year}`
    })
  }

  return options
}

/**
 * Round quantity to avoid floating-point precision issues.
 * Rounds to 3 decimal places which is sufficient for KT measurements.
 */
export const roundQuantity = (qty: number | string | undefined | null): string => {
  if (qty === undefined || qty === null || qty === '') return ''
  const num = typeof qty === 'string' ? parseFloat(qty) : qty
  if (isNaN(num)) return ''
  // Round to 3 decimal places to avoid floating-point issues
  return Math.round(num * 1000) / 1000 + ''
}

/**
 * Get the loading month option for a specific month/year (single option dropdown).
 */
export const getLoadingMonthOption = (loadingMonth: number, loadingYear: number): { value: string, label: string } => {
  const monthName = MONTH_NAMES[loadingMonth - 1]
  return {
    value: `${monthName} ${loadingYear}`,
    label: `${monthName} ${loadingYear}`
  }
}

/**
 * Determine quarter order based on contract start month.
 * Returns quarters in the order they appear based on fiscal year start.
 */
export const getQuarterOrder = (startMonth: number): ('Q1' | 'Q2' | 'Q3' | 'Q4')[] => {
  if (startMonth >= 1 && startMonth <= 3) {
    return ['Q1', 'Q2', 'Q3', 'Q4']
  } else if (startMonth >= 4 && startMonth <= 6) {
    return ['Q2', 'Q3', 'Q4', 'Q1']
  } else if (startMonth >= 7 && startMonth <= 9) {
    return ['Q3', 'Q4', 'Q1', 'Q2']
  } else {
    return ['Q4', 'Q1', 'Q2', 'Q3']
  }
}

/**
 * Get all months in contract period with their years.
 * For CIF contracts, include one month BEFORE contract start (for loadings that deliver in first month).
 */
export const getContractMonths = (startPeriod: string, endPeriod: string, isCIF: boolean = false): Array<{ month: number, year: number }> => {
  const start = new Date(startPeriod)
  const end = new Date(endPeriod)
  const months: Array<{ month: number, year: number }> = []
  
  // For CIF contracts, start one month earlier to allow pre-contract loadings
  const current = new Date(start)
  if (isCIF) {
    current.setMonth(current.getMonth() - 1)
  }
  
  while (current <= end) {
    months.push({
      month: current.getMonth() + 1,
      year: current.getFullYear()
    })
    current.setMonth(current.getMonth() + 1)
  }
  
  return months
}

/**
 * Create a month key string for indexing entries.
 */
export const createMonthKey = (month: number, year: number): string => {
  return `${month}-${year}`
}

/**
 * Parse a month key string back to month and year.
 */
export const parseMonthKey = (key: string): { month: number, year: number } => {
  const [month, year] = key.split('-').map(Number)
  return { month, year }
}

