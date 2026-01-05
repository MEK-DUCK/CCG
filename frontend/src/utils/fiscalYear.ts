/**
 * Fiscal Year Utility Functions
 * 
 * Centralized logic for fiscal year calculations.
 * This mirrors the backend logic in backend/app/utils/fiscal_year.py and backend/app/config.py
 * 
 * Fiscal year concepts:
 * - fiscal_start_month: The calendar month (1-12) when Q1 starts
 * - contract_year: Which year of a multi-year contract (1, 2, 3, etc.)
 * - quarter: Fiscal quarter (1-4)
 * 
 * Example for July fiscal start (fiscal_start_month=7):
 * - Q1 = Jul, Aug, Sep
 * - Q2 = Oct, Nov, Dec
 * - Q3 = Jan, Feb, Mar (next calendar year)
 * - Q4 = Apr, May, Jun (next calendar year)
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Get the three calendar months (1-12) that belong to a fiscal quarter.
 * 
 * @param fiscalStartMonth - Month when Q1 starts (1-12)
 * @param quarter - Fiscal quarter (1-4)
 * @returns Tuple of three months [month1, month2, month3]
 * 
 * @example
 * getQuarterMonths(7, 1) // [7, 8, 9] - Q1 for July start
 * getQuarterMonths(7, 3) // [1, 2, 3] - Q3 for July start (Jan-Mar)
 * getQuarterMonths(1, 2) // [4, 5, 6] - Q2 for January start (Apr-Jun)
 */
export function getQuarterMonths(fiscalStartMonth: number, quarter: number): [number, number, number] {
  const baseMonth = fiscalStartMonth + (quarter - 1) * 3
  const month1 = ((baseMonth - 1) % 12) + 1
  const month2 = (baseMonth % 12) + 1
  const month3 = ((baseMonth + 1) % 12) + 1
  return [month1, month2, month3]
}

/**
 * Get which fiscal quarter (1-4) a calendar month falls into.
 * 
 * @param fiscalStartMonth - Month when Q1 starts (1-12)
 * @param month - Calendar month (1-12)
 * @returns Fiscal quarter (1-4)
 * 
 * @example
 * getQuarterForMonth(7, 8)  // 1 - August is in Q1 for July start
 * getQuarterForMonth(7, 1)  // 3 - January is in Q3 for July start
 * getQuarterForMonth(1, 4)  // 2 - April is in Q2 for January start
 */
export function getQuarterForMonth(fiscalStartMonth: number, month: number): number {
  const monthsFromStart = (month - fiscalStartMonth + 12) % 12
  return Math.floor(monthsFromStart / 3) + 1
}

/**
 * Get the calendar year for the first month of a fiscal quarter.
 * 
 * @param fiscalStartMonth - Month when Q1 starts (1-12)
 * @param quarter - Fiscal quarter (1-4)
 * @param contractStartYear - Calendar year when the contract started
 * @param contractYear - Which year of the contract (1, 2, etc.)
 * @returns Calendar year for the first month of the quarter
 * 
 * @example
 * // Contract starts July 2025
 * getQuarterYear(7, 1, 2025, 1) // 2025 - Q1 Year 1 = Jul 2025
 * getQuarterYear(7, 3, 2025, 1) // 2026 - Q3 Year 1 = Jan 2026
 * getQuarterYear(7, 1, 2025, 2) // 2026 - Q1 Year 2 = Jul 2026
 */
export function getQuarterYear(
  fiscalStartMonth: number,
  quarter: number,
  contractStartYear: number,
  contractYear: number = 1
): number {
  let yearOffset = contractYear - 1
  const quarterStartMonth = fiscalStartMonth + (quarter - 1) * 3
  if (quarterStartMonth > 12) {
    yearOffset += 1
  }
  return contractStartYear + yearOffset
}

/**
 * Get the calendar year for a specific month in a contract.
 * 
 * @param fiscalStartMonth - Month when Q1 starts (1-12)
 * @param month - Calendar month (1-12)
 * @param contractStartYear - Calendar year when the contract started
 * @param contractYear - Which year of the contract (1, 2, etc.)
 * @returns Calendar year for that month
 */
export function getMonthCalendarYear(
  fiscalStartMonth: number,
  month: number,
  contractStartYear: number,
  contractYear: number = 1
): number {
  const baseYear = contractStartYear + (contractYear - 1)
  // If the month is before the fiscal start month, it's in the next calendar year
  if (month < fiscalStartMonth) {
    return baseYear + 1
  }
  return baseYear
}

/**
 * Get a display label for quarter months (e.g., "Jul-Sep").
 * 
 * @param fiscalStartMonth - Month when Q1 starts (1-12)
 * @param quarter - Fiscal quarter (1-4)
 * @returns Label like "Jul-Sep"
 */
export function getQuarterMonthsLabel(fiscalStartMonth: number, quarter: number): string {
  const [m1, , m3] = getQuarterMonths(fiscalStartMonth, quarter)
  return `${MONTH_NAMES[m1 - 1]}-${MONTH_NAMES[m3 - 1]}`
}

/**
 * Get a full display label for a quarter (e.g., "Q1 (Jul-Sep 2025)").
 * 
 * @param quarter - Quarter as 'Q1', 'Q2', 'Q3', or 'Q4' OR as number 1-4
 * @param fiscalStartMonth - Month when Q1 starts (1-12)
 * @param contractStartYear - Calendar year when the contract started (optional)
 * @param contractYear - Which year of the contract (1, 2, etc.)
 * @returns Display string like "Q1 (Jul-Sep 2025)" or "Year 2 Q1 (Jul-Sep 2026)"
 */
export function getQuarterDisplayLabel(
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' | number,
  fiscalStartMonth: number = 1,
  contractStartYear?: number,
  contractYear: number = 1
): string {
  const quarterNum = typeof quarter === 'number' ? quarter : parseInt(quarter.replace('Q', ''))
  const monthsLabel = getQuarterMonthsLabel(fiscalStartMonth, quarterNum)
  
  if (contractStartYear) {
    const calendarYear = getQuarterYear(fiscalStartMonth, quarterNum, contractStartYear, contractYear)
    const yearPrefix = contractYear > 1 ? `Year ${contractYear} ` : ''
    return `${yearPrefix}Q${quarterNum} (${monthsLabel} ${calendarYear})`
  }
  
  return `Q${quarterNum} (${monthsLabel})`
}

/**
 * Calculate the duration of a contract in months.
 * 
 * @param startDate - Contract start date
 * @param endDate - Contract end date
 * @returns Number of months (at least 1)
 */
export function calculateContractDurationMonths(startDate: Date, endDate: Date): number {
  const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                 (endDate.getMonth() - startDate.getMonth()) + 1
  return Math.max(1, months)
}

/**
 * Calculate how many contract years are needed.
 * 
 * @param startDate - Contract start date
 * @param endDate - Contract end date
 * @returns Number of contract years (1, 2, etc.)
 */
export function calculateContractYears(startDate: Date, endDate: Date): number {
  const months = calculateContractDurationMonths(startDate, endDate)
  return Math.ceil(months / 12)
}

/**
 * Generate the 12 calendar months for a specific contract year.
 * 
 * @param fiscalStartMonth - Month when Q1 starts (1-12)
 * @param contractStartYear - Calendar year when the contract started
 * @param contractYear - Which year of the contract (1, 2, etc.)
 * @returns Array of {month, year} objects for the 12 months
 */
export function getContractYearMonths(
  fiscalStartMonth: number,
  contractStartYear: number,
  contractYear: number = 1
): Array<{ month: number; year: number }> {
  const baseYear = contractStartYear + (contractYear - 1)
  const months: Array<{ month: number; year: number }> = []
  
  for (let i = 0; i < 12; i++) {
    let month = fiscalStartMonth + i
    let year = baseYear
    if (month > 12) {
      month -= 12
      year += 1
    }
    months.push({ month, year })
  }
  
  return months
}

/**
 * Check if a month/year falls within a specific fiscal quarter.
 * 
 * @param month - Calendar month (1-12)
 * @param year - Calendar year
 * @param quarter - Fiscal quarter (1-4)
 * @param fiscalStartMonth - Month when Q1 starts (1-12)
 * @param contractStartYear - Calendar year when the contract started
 * @param contractYear - Which year of the contract (1, 2, etc.)
 * @returns true if the month/year is in the specified quarter
 */
export function isMonthInQuarter(
  month: number,
  year: number,
  quarter: number,
  fiscalStartMonth: number,
  contractStartYear: number,
  contractYear: number = 1
): boolean {
  const quarterMonths = getQuarterMonths(fiscalStartMonth, quarter)
  
  // Check if month is one of the quarter months
  if (!quarterMonths.includes(month)) {
    return false
  }
  
  // Get the expected calendar year for this month within the contract year
  const monthYear = getMonthCalendarYear(fiscalStartMonth, month, contractStartYear, contractYear)
  
  return year === monthYear
}

/**
 * Get month name from month number.
 * 
 * @param month - Calendar month (1-12)
 * @returns Month name (e.g., "Jan", "Feb")
 */
export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] || ''
}

/**
 * Get full month name from month number.
 * 
 * @param month - Calendar month (1-12)
 * @returns Full month name (e.g., "January", "February")
 */
export function getFullMonthName(month: number): string {
  const fullNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  return fullNames[month - 1] || ''
}

