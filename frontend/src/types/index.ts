export type ContractType = 'FOB' | 'CIF'
export type ContractCategory = 'TERM' | 'SEMI_TERM' | 'SPOT'
export type PaymentMethod = 'T/T' | 'LC'
export type LCStatus = 'Pending LC' | 'LC in Order' | 'LC Not in Order' | 'LC Memo Issued' | 'Financial Hold'

export type CargoStatus = 
  | 'Planned'
  | 'Loading'
  | 'Completed Loading'
  | 'Discharge Complete'
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

// Per-year quantity for multi-year contracts
export interface YearQuantity {
  year: number  // Contract year (1, 2, 3, etc.)
  // Fixed quantity mode (legacy/simple)
  quantity?: number  // Fixed quantity for this year in KT
  optional_quantity?: number  // Optional quantity for this year in KT
  // Min/Max quantity mode (range-based)
  min_quantity?: number  // Minimum quantity for this year in KT
  max_quantity?: number  // Maximum quantity for this year in KT
}

export interface ContractProduct {
  name: string  // JET A-1, GASOIL, GASOIL 10PPM, HFO, LSFO
  // Fixed quantity mode (legacy/simple) - total_quantity = fixed amount, optional_quantity = extra allowed
  total_quantity?: number  // Total fixed quantity in KT (sum of all years)
  optional_quantity?: number  // Optional quantity in KT (on top of total)
  // Min/Max quantity mode (range-based) - customer can lift anywhere between min and max
  min_quantity?: number  // Minimum contract quantity in KT
  max_quantity?: number  // Maximum contract quantity in KT
  year_quantities?: YearQuantity[]  // Per-year quantities for multi-year contracts
}

// Authority Amendment for mid-contract min/max adjustments
export interface AuthorityAmendment {
  product_name: string  // Must match a product in the contract
  amendment_type: 'increase_max' | 'decrease_max' | 'increase_min' | 'decrease_min' | 'set_min' | 'set_max'
  quantity_change?: number  // Amount to add/subtract
  new_min_quantity?: number  // New absolute min value
  new_max_quantity?: number  // New absolute max value
  authority_reference: string  // Reference number
  reason?: string  // Reason for the amendment
  effective_date?: string  // When the amendment takes effect
  year?: number  // Specific contract year affected (null = all years)
}

export interface Contract {
  id: number
  contract_id: string
  contract_number: string
  contract_type: ContractType
  contract_category?: ContractCategory  // TERM, SEMI_TERM, or SPOT
  payment_method?: PaymentMethod  // T/T or LC
  start_period: string
  end_period: string
  fiscal_start_month?: number  // 1-12, when Q1 starts for this contract
  products: ContractProduct[]  // List of products with quantities (fixed or min/max)
  authority_amendments?: AuthorityAmendment[]  // Mid-contract min/max adjustments
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
  version?: number  // For optimistic locking
}

export interface QuarterlyPlan {
  id: number
  product_name?: string  // Product name - makes quarterly plan product-specific for multi-product contracts
  contract_year?: number  // Which year of the contract (1, 2, etc.)
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
  combi_group_id?: string  // UUID to link combi monthly plans (multiple products, same vessel/laycan)
  product_name?: string  // Product name for SPOT contracts
  quarterly_plan_id?: number  // Optional for SPOT contracts
  contract_id?: number  // Direct link for SPOT contracts
  contract?: Contract  // Direct contract object for SPOT contracts (from bulk endpoint)
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
  cargo_ids: number[]  // Numeric IDs for API calls
  completed_cargo_ids: number[]  // Numeric IDs for API calls
  cargo_unique_ids?: string[]  // String cargo_id for display (optional for backwards compat)
  completed_cargo_unique_ids?: string[]  // String cargo_id for display (optional for backwards compat)
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
  combi_group_id?: string  // UUID to link combi cargos together (same vessel, different products)
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
  // CIF In-Road tracking fields
  five_nd_date?: string  // 5-ND: Due date for narrowing down delivery window
  nd_completed?: boolean  // ND Completed checkbox - removes highlight when checked
  nd_days?: string  // ND Days selection (3 Days, 5 Days, 7 Days, 10 Days)
  nd_delivery_window?: string  // Narrowed Down Delivery Window (actual dates)
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
  port_operations?: CargoPortOperation[]
}

export type PortOperationStatus = 'Planned' | 'Loading' | 'Completed Loading'

export interface CargoPortOperation {
  id: number
  cargo_id: number
  port_code: 'MAA' | 'MAB' | 'SHU' | 'ZOR' | (string & {})
  status: PortOperationStatus
  eta?: string
  berthed?: string
  commenced?: string
  etc?: string
  notes?: string
  created_at: string
  updated_at?: string
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
  product_name?: string  // Product name from quarterly plan
  description?: string
  created_at: string
  monthly_plan_snapshot?: string
  user_initials?: string  // User who made the change
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
  product_name?: string  // Product name from quarterly plan
  description?: string
  created_at: string
  quarterly_plan_snapshot?: string
  user_initials?: string  // User who made the change
}

export type PlanAuditLog = MonthlyPlanAuditLog | QuarterlyPlanAuditLog

export interface WeeklyQuantityMonth {
  month: number
  previous_quantity: number
  current_quantity: number
  delta: number
  remark?: string | null
}

export interface WeeklyQuantityContract {
  contract_id: number
  contract_number?: string | null
  contract_name?: string | null
  product_name?: string | null  // Product name for filtering
  months: WeeklyQuantityMonth[]
  previous_total: number
  current_total: number
  delta_total: number
}

export interface WeeklyQuantityComparisonResponse {
  year: number
  previous_week_start: string
  previous_week_end: string
  generated_at: string
  contracts: WeeklyQuantityContract[]
}

