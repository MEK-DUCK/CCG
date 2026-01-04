/**
 * Centralized Chip Color System
 * All chip colors in the app should reference this file for consistency.
 * Uses light pastel backgrounds with darker text of the same hue.
 */

// ============================================
// CONTRACT TYPE
// ============================================
export const CONTRACT_TYPE_COLORS = {
  FOB: { bgcolor: '#E0F2FE', color: '#0369A1' },  // Sky
  CIF: { bgcolor: '#FFEDD5', color: '#C2410C' },  // Orange
} as const

// ============================================
// PAYMENT METHOD
// ============================================
export const PAYMENT_COLORS = {
  'T/T': { bgcolor: '#D1FAE5', color: '#047857' },  // Mint/Emerald
  'LC': { bgcolor: '#EDE9FE', color: '#6D28D9' },   // Lavender/Violet
} as const

// ============================================
// LC STATUS
// ============================================
export const LC_STATUS_COLORS = {
  'LC in Order': { bgcolor: '#DCFCE7', color: '#166534' },      // Green
  'LC Not in Order': { bgcolor: '#FFE4E6', color: '#BE123C' },  // Rose
  'Pending LC': { bgcolor: '#FEF9C3', color: '#A16207' },       // Yellow
  'LC Memo Issued': { bgcolor: '#CFFAFE', color: '#0E7490' },   // Cyan
  'Financial Hold': { bgcolor: '#FAE8FF', color: '#A21CAF' },   // Fuchsia
} as const

// ============================================
// PRODUCTS (each product gets a unique hue)
// ============================================
export const PRODUCT_COLORS = {
  JET: { bgcolor: '#E0E7FF', color: '#4338CA' },        // Indigo
  GASOIL: { bgcolor: '#FEF3C7', color: '#B45309' },     // Amber
  FUEL_OIL: { bgcolor: '#FAE8FF', color: '#A21CAF' },   // Fuchsia
  MOGAS: { bgcolor: '#FCE7F3', color: '#BE185D' },      // Pink
  LPG: { bgcolor: '#CCFBF1', color: '#0F766E' },        // Teal
  NAPHTHA: { bgcolor: '#ECFCCB', color: '#4D7C0F' },    // Lime
  DEFAULT: { bgcolor: '#F1F5F9', color: '#475569' },    // Slate
} as const

// ============================================
// CARGO STATUS (progression: gray → yellow → blue → green)
// ============================================
export const CARGO_STATUS_COLORS = {
  'Planned': { bgcolor: '#F1F5F9', color: '#475569' },              // Slate
  'Pending Nomination': { bgcolor: '#FEF9C3', color: '#A16207' },   // Yellow
  'Pending TL Approval': { bgcolor: '#FFEDD5', color: '#C2410C' },  // Orange
  'Nomination Released': { bgcolor: '#CFFAFE', color: '#0E7490' },  // Cyan
  'Loading': { bgcolor: '#DBEAFE', color: '#1D4ED8' },              // Blue
  'Completed Loading': { bgcolor: '#DCFCE7', color: '#166534' },    // Green
  'Discharge Complete': { bgcolor: '#D1FAE5', color: '#047857' },   // Emerald
} as const

// ============================================
// SPECIAL BADGES
// ============================================
export const BADGE_COLORS = {
  COMBI: { bgcolor: '#DDD6FE', color: '#7C3AED' },     // Violet
  SPOT: { bgcolor: '#C7D2FE', color: '#4F46E5' },      // Indigo
  TBA: { bgcolor: '#F8FAFC', color: '#64748B', borderStyle: 'dashed' },  // Gray dashed
  OVERDUE: { bgcolor: '#FEE2E2', color: '#DC2626' },   // Red
  COMPLETED: { bgcolor: '#D1FAE5', color: '#047857' }, // Emerald
} as const

// ============================================
// TNG STATUS
// ============================================
export const TNG_STATUS_COLORS = {
  NORMAL: { bgcolor: '#F1F5F9', color: '#475569' },      // Slate
  DUE_SOON: { bgcolor: '#FEF9C3', color: '#A16207' },    // Yellow
  OVERDUE: { bgcolor: '#FEE2E2', color: '#DC2626' },     // Red
  ISSUED: { bgcolor: '#CFFAFE', color: '#0E7490' },      // Cyan
  REVISED: { bgcolor: '#DBEAFE', color: '#1D4ED8' },     // Blue
  LEAD_DAYS: { bgcolor: '#E0E7FF', color: '#3730A3' },   // Indigo
} as const

// ============================================
// CALENDAR EVENTS (slightly brighter for visibility)
// ============================================
export const CALENDAR_COLORS = {
  FOB_LAYCAN: { bg: '#7DD3FC', border: '#0EA5E9', text: '#000000' },      // Sky
  CIF_LOADING: { bg: '#FDBA74', border: '#F97316', text: '#000000' },     // Orange
  TNG_DUE: { bg: '#FDE047', border: '#EAB308', text: '#000000' },         // Yellow
  ND_DUE: { bg: '#FDA4AF', border: '#F43F5E', text: '#000000' },          // Rose
  // TBA versions (lighter)
  TBA_FOB: { bg: '#BAE6FD', border: '#7DD3FC', text: '#000000' },         // Sky lighter
  TBA_CIF: { bg: '#FED7AA', border: '#FDBA74', text: '#000000' },         // Orange lighter
} as const

// ============================================
// PLAN TYPE (Monthly vs Quarterly)
// ============================================
export const PLAN_TYPE_COLORS = {
  MONTHLY: { bgcolor: '#DBEAFE', color: '#1D4ED8' },   // Blue
  QUARTERLY: { bgcolor: '#EDE9FE', color: '#6D28D9' }, // Violet
} as const

// ============================================
// ADMIN CHIPS
// ============================================
export const ADMIN_COLORS = {
  CUSTOMER_ID: { bgcolor: '#F1F5F9', color: '#475569' },   // Slate
  PRODUCT_CODE: { bgcolor: '#E0E7FF', color: '#3730A3' },  // Indigo
  PORT_CODE: { bgcolor: '#D1FAE5', color: '#047857' },     // Emerald
  INSPECTOR_CODE: { bgcolor: '#CFFAFE', color: '#0E7490' }, // Cyan
  ACTIVE: { bgcolor: '#DCFCE7', color: '#166534' },        // Green
  INACTIVE: { bgcolor: '#F1F5F9', color: '#64748B' },      // Gray
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
  return LC_STATUS_COLORS[status as keyof typeof LC_STATUS_COLORS] || { bgcolor: '#F1F5F9', color: '#475569' }
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

