import type { CargoStatus, ContractType, PaymentMethod } from '../../types'

export interface FilterConfig {
  // Text search
  searchText?: string
  
  // Dropdown filters (multi-select)
  customers?: number[]
  contracts?: number[]
  products?: string[]
  statuses?: CargoStatus[]
  contractTypes?: ContractType[]
  paymentMethods?: PaymentMethod[]
  
  // Date ranges
  dateRange?: {
    start: Date | null
    end: Date | null
  }
  laycanRange?: {
    start: Date | null
    end: Date | null
  }
  
  // Quantity ranges
  quantityRange?: {
    min: number | null
    max: number | null
  }
  
  // Year/Month
  years?: number[]
  months?: number[]
  
  // Saved preset name
  presetName?: string
}

export interface FilterPreset {
  id: string
  name: string
  config: FilterConfig
  createdAt: string
}

export interface QuickFilter {
  id: string
  label: string
  icon?: string
  config: FilterConfig
}

