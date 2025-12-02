import type { CargoStatus } from '../types'

export const IN_ROAD_STATUS_VALUE: CargoStatus = 'In-Road (Pending Discharge)'
export const IN_ROAD_STATUS_LABEL = 'In-Road'

export const formatStatusLabel = (status?: string | null) => {
  if (!status) return ''
  return status === IN_ROAD_STATUS_VALUE ? IN_ROAD_STATUS_LABEL : status
}

