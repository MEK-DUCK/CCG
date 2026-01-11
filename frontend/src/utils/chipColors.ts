/**
 * Centralized Chip Color System
 * All chip colors in the app should reference this file for consistency.
 * Uses muted, calm colors with subtle differentiation.
 * Design principle: Calm, professional, minimal visual noise.
 */

// ============================================
// CONTRACT TYPE
// ============================================
export const CONTRACT_TYPE_COLORS = {
  FOB: { bgcolor: '#DBEAFE', color: '#1E40AF' },  // Soft blue
  CIF: { bgcolor: '#FEF3C7', color: '#92400E' },  // Muted amber
} as const

// ============================================
// PAYMENT METHOD
// ============================================
export const PAYMENT_COLORS = {
  'T/T': { bgcolor: '#E0E7FF', color: '#3730A3' },  // Soft indigo
  'LC': { bgcolor: '#FEE2E2', color: '#991B1B' },   // Soft red (attention)
} as const

// ============================================
// CONTRACT CATEGORY
// ============================================
export const CONTRACT_CATEGORY_COLORS = {
  TERM: { bgcolor: '#F0FDF4', color: '#166534', borderColor: '#86EFAC' },       // Soft green
  SEMI_TERM: { bgcolor: '#FEF9C3', color: '#854D0E', borderColor: '#FDE047' },  // Soft yellow
  SPOT: { bgcolor: '#FCE7F3', color: '#9D174D', borderColor: '#F9A8D4' },       // Soft pink
} as const

// ============================================
// LC STATUS
// ============================================
export const LC_STATUS_COLORS = {
  'LC in Order': { bgcolor: '#F0FDF4', color: '#166534' },      // Soft green
  'LC Not in Order': { bgcolor: '#FEF2F2', color: '#991B1B' },  // Soft red
  'Pending LC': { bgcolor: '#FFFBEB', color: '#92400E' },       // Soft amber
  'LC Memo Issued': { bgcolor: '#F0F9FF', color: '#0C4A6E' },   // Soft sky
  'Financial Hold': { bgcolor: '#FDF4FF', color: '#86198F' },   // Soft fuchsia
} as const

// ============================================
// PRODUCTS (muted, professional colors)
// ============================================
export const PRODUCT_COLORS = {
  JET: { bgcolor: '#EEF2FF', color: '#4338CA' },        // Soft indigo
  GASOIL: { bgcolor: '#FFFBEB', color: '#92400E' },     // Soft amber
  FUEL_OIL: { bgcolor: '#FDF4FF', color: '#86198F' },   // Soft fuchsia
  MOGAS: { bgcolor: '#FDF2F8', color: '#9D174D' },      // Soft pink
  LPG: { bgcolor: '#F0FDFA', color: '#115E59' },        // Soft teal
  NAPHTHA: { bgcolor: '#F7FEE7', color: '#3F6212' },    // Soft lime
  DEFAULT: { bgcolor: '#F8FAFC', color: '#64748B' },    // Light slate
} as const

// ============================================
// CARGO STATUS (progression: gray → amber → slate → soft green)
// ============================================
export const CARGO_STATUS_COLORS = {
  'Planned': { bgcolor: '#F8FAFC', color: '#64748B' },              // Light slate
  'Pending Nomination': { bgcolor: '#FFFBEB', color: '#92400E' },   // Soft amber
  'Pending TL Approval': { bgcolor: '#FEF3C7', color: '#92400E' },  // Amber
  'Nomination Released': { bgcolor: '#F0F9FF', color: '#0C4A6E' },  // Soft sky
  'Loading': { bgcolor: '#EFF6FF', color: '#1E40AF' },              // Soft blue
  'Completed Loading': { bgcolor: '#F0FDF4', color: '#166534' },    // Soft green
  'Discharge Complete': { bgcolor: '#ECFDF5', color: '#065F46' },   // Soft emerald
} as const

// ============================================
// SPECIAL BADGES
// ============================================
export const BADGE_COLORS = {
  COMBI: { bgcolor: '#F5F3FF', color: '#6D28D9' },     // Soft violet
  SPOT: { bgcolor: '#EEF2FF', color: '#4338CA' },      // Soft indigo
  TBA: { bgcolor: '#F8FAFC', color: '#94A3B8', borderStyle: 'dashed' },  // Gray dashed
  OVERDUE: { bgcolor: '#FEF2F2', color: '#991B1B' },   // Soft red
  COMPLETED: { bgcolor: '#ECFDF5', color: '#065F46' }, // Soft emerald
} as const

// ============================================
// TNG STATUS
// ============================================
export const TNG_STATUS_COLORS = {
  NORMAL: { bgcolor: '#F8FAFC', color: '#64748B' },      // Light slate
  DUE_SOON: { bgcolor: '#FFFBEB', color: '#92400E' },    // Soft amber
  OVERDUE: { bgcolor: '#FEF2F2', color: '#991B1B' },     // Soft red
  ISSUED: { bgcolor: '#F0F9FF', color: '#0C4A6E' },      // Soft sky
  REVISED: { bgcolor: '#EFF6FF', color: '#1E40AF' },     // Soft blue
  LEAD_DAYS: { bgcolor: '#EEF2FF', color: '#3730A3' },   // Soft indigo
} as const

// ============================================
// CALENDAR EVENTS (slightly more visible but still calm)
// ============================================
export const CALENDAR_COLORS = {
  FOB_LAYCAN: { bg: '#BAE6FD', border: '#38BDF8', text: '#0C4A6E' },      // Sky
  CIF_LOADING: { bg: '#FED7AA', border: '#FB923C', text: '#7C2D12' },     // Orange
  TNG_DUE: { bg: '#FEF08A', border: '#FACC15', text: '#713F12' },         // Yellow
  ND_DUE: { bg: '#FECACA', border: '#F87171', text: '#7F1D1D' },          // Rose
  // TBA versions (lighter)
  TBA_FOB: { bg: '#E0F2FE', border: '#BAE6FD', text: '#0C4A6E' },         // Sky lighter
  TBA_CIF: { bg: '#FFEDD5', border: '#FED7AA', text: '#7C2D12' },         // Orange lighter
} as const

// ============================================
// PLAN TYPE (Monthly vs Quarterly)
// ============================================
export const PLAN_TYPE_COLORS = {
  MONTHLY: { bgcolor: '#EFF6FF', color: '#1E40AF' },   // Soft blue
  QUARTERLY: { bgcolor: '#F5F3FF', color: '#6D28D9' }, // Soft violet
} as const

// ============================================
// ADMIN CHIPS
// ============================================
export const ADMIN_COLORS = {
  CUSTOMER_ID: { bgcolor: '#F8FAFC', color: '#64748B' },   // Light slate
  PRODUCT_CODE: { bgcolor: '#EEF2FF', color: '#3730A3' },  // Soft indigo
  PORT_CODE: { bgcolor: '#ECFDF5', color: '#065F46' },     // Soft emerald
  INSPECTOR_CODE: { bgcolor: '#F0F9FF', color: '#0C4A6E' }, // Soft sky
  ACTIVE: { bgcolor: '#F0FDF4', color: '#166534' },        // Soft green
  INACTIVE: { bgcolor: '#F8FAFC', color: '#94A3B8' },      // Gray
} as const

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get product color based on product name
 */
export const getProductColor = (productName: string): { bgcolor: string; color: string } => {
  const name = (productName || '').toUpperCase()

  if (name.includes('JET') || name.includes('KERO') || name.includes('PARAFFIN')) {
    return PRODUCT_COLORS.JET
  }
  if (name.includes('GO') || name.includes('GASOIL') || name.includes('DIESEL') || name === 'GASOIL 10PPM') {
    return PRODUCT_COLORS.GASOIL
  }
  if (name.includes('FUEL') || name.includes('FO') || name.includes('HFO') || name.includes('LSFO')) {
    return PRODUCT_COLORS.FUEL_OIL
  }
  if (name.includes('MOGAS') || name.includes('PETROL') || name.includes('ULP')) {
    return PRODUCT_COLORS.MOGAS
  }
  if (name.includes('LPG') || name.includes('PROPANE') || name.includes('BUTANE')) {
    return PRODUCT_COLORS.LPG
  }
  if (name.includes('NAPHTHA') || name.includes('CONDENSATE')) {
    return PRODUCT_COLORS.NAPHTHA
  }

  return PRODUCT_COLORS.DEFAULT
}

/**
 * Get contract type color
 */
export const getContractTypeColor = (type: 'FOB' | 'CIF' | string): { bgcolor: string; color: string } => {
  return CONTRACT_TYPE_COLORS[type as keyof typeof CONTRACT_TYPE_COLORS] || CONTRACT_TYPE_COLORS.FOB
}

/**
 * Get payment method color
 */
export const getPaymentColor = (method: 'T/T' | 'LC' | string): { bgcolor: string; color: string } => {
  return PAYMENT_COLORS[method as keyof typeof PAYMENT_COLORS] || PAYMENT_COLORS['T/T']
}

/**
 * Get LC status chip props
 */
export const getLCStatusColor = (status: string): { bgcolor: string; color: string } => {
  return LC_STATUS_COLORS[status as keyof typeof LC_STATUS_COLORS] || { bgcolor: '#F8FAFC', color: '#64748B' }
}

/**
 * Get cargo status color
 */
export const getCargoStatusColor = (status: string): { bgcolor: string; color: string } => {
  return CARGO_STATUS_COLORS[status as keyof typeof CARGO_STATUS_COLORS] || CARGO_STATUS_COLORS['Planned']
}

/**
 * Get TNG status color based on state
 */
export const getTngStatusColor = (state: 'normal' | 'due_soon' | 'overdue' | 'issued' | 'revised'): { bgcolor: string; color: string } => {
  const map = {
    normal: TNG_STATUS_COLORS.NORMAL,
    due_soon: TNG_STATUS_COLORS.DUE_SOON,
    overdue: TNG_STATUS_COLORS.OVERDUE,
    issued: TNG_STATUS_COLORS.ISSUED,
    revised: TNG_STATUS_COLORS.REVISED,
  }
  return map[state] || TNG_STATUS_COLORS.NORMAL
}
