export type ContractType = 'FOB' | 'CIF'
export type PaymentMethod = 'T/T' | 'LC'
export type LCStatus = 'Pending LC' | 'LC in Order' | 'LC Not in Order' | 'LC Memo Issued'

export type CargoStatus = 
  | 'Planned'
  | 'Loading'
  | 'Completed Loading'
  | 'In-Road (Pending Discharge)'
  | 'Pending Nomination'
  | 'Pending TL Approval'
  | 'Nomination Released'

export interface Customer {
  id: number
  customer_id: string
  name: string
  created_at: string
  updated_at?: string
}

export interface ContractProduct {
  name: string  // JET A-1, GASOIL, GASOIL 10PPM, HFO, LSFO
  total_quantity: number  // Total quantity in KT
  optional_quantity?: number  // Optional quantity in KT
}

export interface Contract {
  id: number
  contract_id: string
  contract_number: string
  contract_type: ContractType
  payment_method?: PaymentMethod  // T/T or LC
  start_period: string
  end_period: string
  products: ContractProduct[]  // List of products with quantities
  discharge_ranges?: string
  additives_required?: boolean
  fax_received?: boolean
  fax_received_date?: string
  concluded_memo_received?: boolean
  concluded_memo_received_date?: string
  remarks?: string
  customer_id: number
  created_at: string
  updated_at?: string
}

export interface QuarterlyPlan {
  id: number
  q1_quantity: number
  q2_quantity: number
  q3_quantity: number
  q4_quantity: number
  contract_id: number
  created_at: string
  updated_at?: string
}

export interface MonthlyPlan {
  id: number
  month: number
  year: number
  month_quantity: number
  number_of_liftings: number
  planned_lifting_sizes?: string
  laycan_5_days?: string  // For FOB contracts only
  laycan_2_days?: string  // For FOB contracts only
  laycan_2_days_remark?: string
  loading_month?: string  // For CIF contracts only (planning)
  loading_window?: string  // For CIF contracts only
  delivery_month?: string  // For CIF contracts only (planning)
  delivery_window?: string  // For CIF contracts only
  delivery_window_remark?: string
  quarterly_plan_id: number
  created_at: string
  updated_at?: string
}

export interface MonthlyPlanStatus {
  monthly_plan_id: number
  month: number
  year: number
  is_locked: boolean
  has_cargos: boolean
  has_completed_cargos: boolean
  total_cargos: number
  completed_cargos: number
  cargo_ids: string[]
  completed_cargo_ids: string[]
}

export interface Cargo {
  id: number
  cargo_id: string
  vessel_name: string
  customer_id: number
  product_name: string  // Product name instead of product_id
  contract_id: number
  contract_type: ContractType
  load_ports: string
  inspector_name?: string
  cargo_quantity: number
  laycan_window?: string
  // Manual vessel operation fields
  eta?: string  // ETA (manual entry)
  berthed?: string  // Berthed (manual entry)
  commenced?: string  // Commenced (manual entry)
  etc?: string  // ETC - Estimated Time of Completion (manual entry)
  // Legacy fields kept for backward compatibility
  eta_load_port?: string
  loading_start_time?: string
  loading_completion_time?: string
  etd_load_port?: string
  eta_discharge_port?: string
  discharge_port_location?: string
  discharge_completion_time?: string
  status: CargoStatus
  notes?: string
  monthly_plan_id: number
  created_at: string
  updated_at?: string
  // Completion tracking fields
  sailing_fax_entry_completed?: boolean
  sailing_fax_entry_initials?: string
  sailing_fax_entry_date?: string
  documents_mailing_completed?: boolean
  documents_mailing_initials?: string
  documents_mailing_date?: string
  inspector_invoice_completed?: boolean
  inspector_invoice_initials?: string
  inspector_invoice_date?: string
  lc_status?: LCStatus  // LC status (only for LC payment method contracts)
}

export interface CargoAuditLog {
  id: number
  cargo_id?: number
  cargo_cargo_id: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE'
  field_name?: string
  old_value?: string
  new_value?: string
  old_monthly_plan_id?: number
  new_monthly_plan_id?: number
  old_month?: number
  old_year?: number
  new_month?: number
  new_year?: number
  description?: string
  created_at: string
  cargo_snapshot?: string
}

export interface MonthlyPlanAuditLog {
  id: number
  monthly_plan_id?: number
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  field_name?: string
  old_value?: string
  new_value?: string
  month?: number
  year?: number
  contract_id?: number
  contract_number?: string
  contract_name?: string
  quarterly_plan_id?: number
  description?: string
  created_at: string
  monthly_plan_snapshot?: string
}

export interface QuarterlyPlanAuditLog {
  id: number
  quarterly_plan_id?: number
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  field_name?: string
  old_value?: string
  new_value?: string
  contract_id?: number
  contract_number?: string
  contract_name?: string
  description?: string
  created_at: string
  quarterly_plan_snapshot?: string
}

export type PlanAuditLog = MonthlyPlanAuditLog | QuarterlyPlanAuditLog

