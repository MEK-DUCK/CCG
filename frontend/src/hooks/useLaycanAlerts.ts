import { useMemo } from 'react'
import type { Cargo, MonthlyPlan, Contract, Customer } from '../types'
import { parseLaycanDate } from '../utils/laycanParser'
import { getLaycanAlertSeverity, type LaycanAlert } from '../utils/alertUtils'

interface UseLaycanAlertsProps {
  cargos: Cargo[]
  monthlyPlans: MonthlyPlan[]
  contracts: Contract[]
  customers: Customer[]
  maxDays?: number // Only show alerts within X days (default: 14)
}

/**
 * Hook to calculate laycan alerts from cargos and monthly plans
 */
export function useLaycanAlerts({
  cargos,
  monthlyPlans,
  contracts,
  customers,
  maxDays = 14,
}: UseLaycanAlertsProps) {
  const alerts = useMemo(() => {
    const alertList: LaycanAlert[] = []

    // Process cargos with laycan dates
    cargos.forEach((cargo) => {
      // Get laycan from monthly plan (priority: laycan_2_days > laycan_5_days)
      const monthlyPlan = monthlyPlans.find((mp) => mp.id === cargo.monthly_plan_id)
      if (!monthlyPlan) return

      const contract = contracts.find((c) => c.id === cargo.contract_id)
      if (!contract) return

      // For FOB contracts, use laycan_2_days or laycan_5_days
      let laycanString: string | undefined
      if (contract.contract_type === 'FOB') {
        laycanString = monthlyPlan.laycan_2_days || monthlyPlan.laycan_5_days
      } else {
        // For CIF, use cargo's laycan_window if available
        laycanString = cargo.laycan_window
      }

      if (!laycanString) return

      // Parse laycan date
      const laycanDate = parseLaycanDate(
        laycanString,
        monthlyPlan.month,
        monthlyPlan.year
      )

      if (!laycanDate.isValid || laycanDate.daysUntil === null) return

      // Only include alerts within maxDays threshold
      if (laycanDate.daysUntil > maxDays) return

      const severity = getLaycanAlertSeverity(laycanDate.daysUntil)
      if (severity === 'none') return

      const customer = customers.find((c) => c.id === cargo.customer_id)

      alertList.push({
        id: `cargo-${cargo.id}`,
        cargoId: cargo.id,
        cargoCargoId: cargo.cargo_id,
        vesselName: cargo.vessel_name,
        contractNumber: contract.contract_number,
        laycan: laycanString,
        daysUntil: laycanDate.daysUntil,
        severity,
        laycanDate: laycanDate.startDate!,
        isOverdue: laycanDate.isOverdue,
        customerName: customer?.name,
      })
    })

    // Process monthly plans without cargos (not created yet)
    // Note: monthlyPlans need to have quarterly_plan_id to find the contract
    // For now, we'll skip monthly plans without cargos since we need quarterly plan info
    // This can be enhanced later if needed

    // Sort by days until (most urgent first)
    return alertList.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [cargos, monthlyPlans, contracts, customers, maxDays])

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical')
  const warningAlerts = alerts.filter((a) => a.severity === 'warning')
  const infoAlerts = alerts.filter((a) => a.severity === 'info')

  return {
    alerts,
    criticalAlerts,
    warningAlerts,
    infoAlerts,
    totalCount: alerts.length,
    criticalCount: criticalAlerts.length,
    warningCount: warningAlerts.length,
    infoCount: infoAlerts.length,
  }
}

