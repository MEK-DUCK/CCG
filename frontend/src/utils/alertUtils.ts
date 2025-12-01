/**
 * Alert severity levels and utilities
 */

export enum AlertSeverity {
  CRITICAL = 'critical', // 0-2 days (overdue or today/tomorrow)
  WARNING = 'warning',   // 3-7 days (approaching)
  INFO = 'info',         // 8-14 days (upcoming)
  NONE = 'none',         // >14 days or no date
}

export interface LaycanAlert {
  id: string
  cargoId?: number
  cargoCargoId: string
  vesselName: string
  contractNumber: string
  laycan: string
  daysUntil: number
  severity: AlertSeverity
  laycanDate: Date
  isOverdue: boolean
  customerName?: string
}

/**
 * Get alert severity based on days until laycan
 */
export function getLaycanAlertSeverity(daysUntil: number | null): AlertSeverity {
  if (daysUntil === null) return AlertSeverity.NONE
  if (daysUntil < 0) return AlertSeverity.CRITICAL // Overdue
  if (daysUntil <= 2) return AlertSeverity.CRITICAL
  if (daysUntil <= 7) return AlertSeverity.WARNING
  if (daysUntil <= 14) return AlertSeverity.INFO
  return AlertSeverity.NONE
}

/**
 * Get color for alert severity (for MUI components)
 */
export function getAlertColor(severity: AlertSeverity): 'error' | 'warning' | 'info' | 'default' {
  switch (severity) {
    case AlertSeverity.CRITICAL:
      return 'error'
    case AlertSeverity.WARNING:
      return 'warning'
    case AlertSeverity.INFO:
      return 'info'
    default:
      return 'default'
  }
}

/**
 * Get human-readable message for alert
 */
export function getAlertMessage(daysUntil: number, isOverdue: boolean): string {
  if (isOverdue) {
    return `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}`
  }
  if (daysUntil === 0) {
    return 'Laycan is today'
  }
  if (daysUntil === 1) {
    return 'Laycan is tomorrow'
  }
  return `Laycan in ${daysUntil} days`
}

