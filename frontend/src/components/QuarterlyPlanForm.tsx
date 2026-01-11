import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Alert,
  Tabs,
  Tab,
} from '@mui/material'
import { Save, CalendarMonth, Add } from '@mui/icons-material'
import { quarterlyPlanAPI, contractAPI } from '../api/client'
import { usePresence, PresenceUser } from '../hooks/usePresence'
import { useToast } from '../contexts/ToastContext'
import { useFormShortcuts } from '../hooks/useKeyboardShortcuts'
import { EditingWarningBanner, ActiveUsersIndicator } from './Presence'
import { getQuarterDisplayLabel } from '../utils/fiscalYear'
import { applyAmendmentsToProduct } from '../utils/monthlyPlanUtils'

interface QuarterlyPlanFormProps {
  contractId: number
  contract?: any  // Contract object with products
  editingPlan?: any  // Quarterly plan being edited (for single product edit)
  existingPlans?: any[]  // Existing quarterly plans for this contract
  onPlanCreated: () => void
  onCancel?: () => void
}

interface ProductPlanData {
  productName: string
  contractYear: number  // Which contract year (1, 2, 3, etc.)
  totalQuantity: number
  optionalQuantity: number
  existingPlanId?: number
  existingPlanVersion?: number  // For optimistic locking
  q1: string
  q2: string
  q3: string
  q4: string
  adjustmentNotes?: string  // Notes about deferred/advanced quantities
}

// Calculate contract duration in years
const getContractYears = (startPeriod: string, endPeriod: string): number => {
  if (!startPeriod || !endPeriod) return 1
  const start = new Date(startPeriod)
  const end = new Date(endPeriod)
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  return Math.max(1, Math.ceil(months / 12))
}

export default function QuarterlyPlanForm({ contractId, contract, existingPlans = [], onPlanCreated, onCancel }: QuarterlyPlanFormProps) {
  const [contractData, setContractData] = useState<any>(contract)
  const [productPlans, setProductPlans] = useState<ProductPlanData[]>([])
  const [initialProductPlans, setInitialProductPlans] = useState<ProductPlanData[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [selectedYear, setSelectedYear] = useState(1)
  const [editingUser, setEditingUser] = useState<{ user: PresenceUser; field: string } | null>(null)
  const { showSuccess, showError } = useToast()

  // Check if form has unsaved changes
  const isDirty = productPlans.length > 0 && JSON.stringify(productPlans) !== JSON.stringify(initialProductPlans)
  
  // Real-time presence tracking for this contract's quarterly plan
  const handleDataChanged = useCallback(() => {
    // Another user saved changes - reload the data
    onPlanCreated()
  }, [onPlanCreated])
  
  const handleUserEditing = useCallback((user: PresenceUser, field: string) => {
    setEditingUser({ user, field })
    // Clear after 5 seconds
    setTimeout(() => setEditingUser(null), 5000)
  }, [])
  
  const { otherUsers, isConnected, notifyEditing, notifyStoppedEditing } = usePresence(
    'quarterly-plan',
    contractId.toString(),
    {
      onDataChanged: handleDataChanged,
      onUserEditing: handleUserEditing,
      onUserStoppedEditing: () => setEditingUser(null),
    }
  )
  
  // Get fiscal start month from contract, default to 1 (January)
  const fiscalStartMonth = contractData?.fiscal_start_month || 1
  
  // Calculate number of contract years
  const numContractYears = contractData 
    ? getContractYears(contractData.start_period, contractData.end_period)
    : 1

  // Load contract
  useEffect(() => {
    const loadContract = async () => {
      let contractToUse = contract
      if (!contractToUse && contractId) {
        try {
          const contractRes = await contractAPI.getById(contractId)
          contractToUse = contractRes.data
          setContractData(contractToUse)
        } catch (error) {
          console.error('Error loading contract:', error)
        }
      } else {
        setContractData(contractToUse)
      }
    }
    loadContract()
  }, [contract, contractId])

  // Initialize product plans when contract data or existing plans change
  useEffect(() => {
    if (!contractData) return
    
    const products = Array.isArray(contractData.products) ? contractData.products : []
    const years = getContractYears(contractData.start_period, contractData.end_period)
    const isSingleProduct = products.length === 1
    
    // Create plan data entries for each product for each year
    const newProductPlans: ProductPlanData[] = []
    
    for (let year = 1; year <= years; year++) {
      for (const product of products) {
        // Find existing plan for this product and year
        // For single-product contracts, also match plans with null product_name (legacy data)
        const existingPlan = existingPlans.find(p => {
          const yearMatches = (p.contract_year || 1) === year
          const productMatches = p.product_name === product.name || 
            (isSingleProduct && p.product_name == null)
          return yearMatches && productMatches
        })
        
        // Load quantities from existing plan or default to empty
        let q1 = '', q2 = '', q3 = '', q4 = ''
        
        if (existingPlan) {
          q1 = (existingPlan.q1_quantity || 0).toString()
          q2 = (existingPlan.q2_quantity || 0).toString()
          q3 = (existingPlan.q3_quantity || 0).toString()
          q4 = (existingPlan.q4_quantity || 0).toString()
          // Top-up amounts are now tracked at MonthlyPlan level only
        }
        
        // Get year-specific quantity if available, otherwise use total
        const yearQuantity = product.year_quantities?.find((yq: any) => yq.year === year)

        // Check if this product uses range (min/max) mode
        const isRangeMode = (product.min_quantity != null && product.min_quantity > 0) ||
                           (product.max_quantity != null && product.max_quantity > 0)

        // Get original quantities from year_quantities or product
        const originalQty = isRangeMode
          ? (yearQuantity?.max_quantity ?? product.max_quantity ?? 0)
          : (yearQuantity?.quantity ?? product.total_quantity ?? 0)
        const originalMinQty = yearQuantity?.min_quantity ?? product.min_quantity ?? 0
        const yearOptionalQty = yearQuantity?.optional_quantity ?? product.optional_quantity ?? 0

        // Apply authority amendments to get effective quantities
        const amendments = contractData?.authority_amendments || []
        const { effectiveMax } = applyAmendmentsToProduct(
          originalMinQty,
          originalQty,
          amendments,
          product.name,
          year
        )

        // Use effective quantity for the year total
        const yearTotalQty = isRangeMode ? effectiveMax : (yearQuantity?.quantity ?? product.total_quantity ?? 0)

        newProductPlans.push({
          productName: product.name,
          contractYear: year,
          totalQuantity: yearTotalQty,
          optionalQuantity: yearOptionalQty,
          existingPlanId: existingPlan?.id,
          existingPlanVersion: existingPlan?.version || 1,
          q1,
          q2,
          q3,
          q4,
          adjustmentNotes: existingPlan?.adjustment_notes || '',
          // Top-up amounts are now tracked at MonthlyPlan level only
        })
      }
    }
    
    setProductPlans(newProductPlans)
    setInitialProductPlans(JSON.parse(JSON.stringify(newProductPlans)))  // Deep copy for comparison
  }, [contractData, existingPlans])
  
  // Legacy support - keeping old variable names for minimal code changes
  const contractProducts = contractData?.products || []
  const isMultiProduct = contractProducts.length > 1
  
  // Filter plans for selected year
  const yearPlans = productPlans.filter(p => p.contractYear === selectedYear)


  const handleQuantityChange = (productName: string, contractYear: number, quarter: 'q1' | 'q2' | 'q3' | 'q4', value: string) => {
    // Notify others that we're editing this field
    notifyEditing(`${productName} ${quarter.toUpperCase()}`)
    
    setProductPlans(prev => {
      return prev.map(p => {
        if (p.productName === productName && p.contractYear === contractYear) {
          return { ...p, [quarter]: value }
        }
        return p
      })
    })
  }
  
  // Notify when user stops editing (on blur)
  const handleFieldBlur = () => {
    notifyStoppedEditing()
  }

  const getProductTotal = (plan: ProductPlanData): number => {
    return (parseFloat(plan.q1) || 0) + (parseFloat(plan.q2) || 0) + (parseFloat(plan.q3) || 0) + (parseFloat(plan.q4) || 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!contractId || !contractData) {
      showError('Contract data not loaded. Please try again.')
      return
    }

    // Validate all products (only validate per-year totals, not across all years)
    // The total contract quantity is spread across years
    for (const plan of yearPlans) {
      const total = getProductTotal(plan)
      if (total < 0) {
        showError(`${plan.productName} Year ${plan.contractYear}: Quantities cannot be negative`)
        return
      }
    }

    setIsSaving(true)

    try {
      // Save each product's quarterly plan for all years
      for (const plan of productPlans) {
        const q1Qty = parseFloat(plan.q1) || 0
        const q2Qty = parseFloat(plan.q2) || 0
        const q3Qty = parseFloat(plan.q3) || 0
        const q4Qty = parseFloat(plan.q4) || 0

        if (plan.existingPlanId) {
          // Update existing plan (include version for optimistic locking)
          await quarterlyPlanAPI.update(plan.existingPlanId, {
            q1_quantity: q1Qty,
            q2_quantity: q2Qty,
            q3_quantity: q3Qty,
            q4_quantity: q4Qty,
            version: plan.existingPlanVersion || 1,
          })
        } else {
          // Create new plan with contract_year
          const createPayload: any = {
            contract_id: contractId,
            contract_year: plan.contractYear,
            product_name: plan.productName,
            q1_quantity: q1Qty,
            q2_quantity: q2Qty,
            q3_quantity: q3Qty,
            q4_quantity: q4Qty,
          }
          
          await quarterlyPlanAPI.create(createPayload)
        }
      }

      showSuccess('Quarterly plan(s) saved successfully!')
      onPlanCreated()
      if (onCancel) onCancel()
    } catch (error: any) {
      console.error('Error saving quarterly plan:', error)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error occurred'
      showError(`Error saving quarterly plan: ${errorMessage}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Keyboard shortcut: Ctrl+S to save
  useFormShortcuts(
    () => handleSubmit({ preventDefault: () => {} } as React.FormEvent),
    isDirty && !isSaving
  )

  if (!contractData || productPlans.length === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography>Loading contract details...</Typography>
      </Paper>
    )
  }
  
  // Get calendar year for display
  const getYearLabel = (contractYear: number): string => {
    if (!contractData?.start_period) return `Year ${contractYear}`
    const startYear = new Date(contractData.start_period).getFullYear()
    const calendarYear = startYear + (contractYear - 1)
    return `Year ${contractYear} (${calendarYear})`
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Typography variant="h6">
          {existingPlans.length > 0 ? 'Edit Quarterly Plan' : 'Create Quarterly Plan'}
        </Typography>
        <ActiveUsersIndicator 
          users={otherUsers} 
          isConnected={isConnected}
          variant="avatars"
          showConnectionStatus
          label="Also editing"
        />
      </Box>
      
      {/* Warning banner when others are editing */}
      <EditingWarningBanner
        otherUsers={otherUsers}
        isConnected={isConnected}
        resourceType="quarterly plan"
        onRefresh={onPlanCreated}
        editingUser={editingUser}
      />
      
      {isMultiProduct && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This contract has multiple products. Enter quarterly quantities for each product below.
        </Alert>
      )}
      
      {/* Year Tabs */}
      {numContractYears > 1 && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs 
            value={selectedYear} 
            onChange={(_, newValue) => setSelectedYear(newValue)}
            variant="scrollable"
            scrollButtons="auto"
          >
            {Array.from({ length: numContractYears }, (_, i) => i + 1).map(year => (
              <Tab 
                key={year} 
                value={year} 
                label={getYearLabel(year)}
                icon={<CalendarMonth fontSize="small" />}
                iconPosition="start"
                sx={{ minHeight: 48 }}
              />
            ))}
          </Tabs>
        </Box>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {yearPlans.map((plan) => {
            const total = getProductTotal(plan)
            
            return (
              <Grid item xs={12} md={isMultiProduct ? 6 : 12} key={`${plan.productName}-${plan.contractYear}`}>
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    p: 2, 
                    bgcolor: '#FAFBFC',
                    border: isMultiProduct ? '2px solid' : '1px solid',
                    borderColor: isMultiProduct ? '#DBEAFE' : 'divider',
                  }}
                >
                  {/* Product Header */}
                  <Box sx={{ mb: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      px: 1.5, 
                      py: 0.5, 
                      bgcolor: '#DBEAFE', 
                      color: '#1D4ED8', 
                      borderRadius: 1,
                      fontWeight: 600,
                      fontSize: '0.95rem',
                    }}>
                      {plan.productName}
                    </Box>
                    <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                      Contract Total: {plan.totalQuantity.toLocaleString()} KT
                      {plan.optionalQuantity > 0 && ` (+${plan.optionalQuantity.toLocaleString()} KT optional)`}
                    </Typography>
                  </Box>

                  {/* Quarter Inputs */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((quarter) => {
                      const fieldKey = `q${['Q1', 'Q2', 'Q3', 'Q4'].indexOf(quarter) + 1}` as 'q1' | 'q2' | 'q3' | 'q4'
                      const contractStartYear = contractData?.start_period ? new Date(contractData.start_period).getFullYear() : undefined
                      
                      return (
                        <Box key={quarter}>
                        <TextField
                          label={getQuarterDisplayLabel(quarter, fiscalStartMonth, contractStartYear, plan.contractYear)}
                          type="number"
                          size="small"
                          value={plan[fieldKey]}
                          onChange={(e) => handleQuantityChange(plan.productName, plan.contractYear, fieldKey, e.target.value)}
                          onBlur={handleFieldBlur}
                          fullWidth
                          InputProps={{
                            endAdornment: <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>KT</Typography>
                          }}
                        />
                        </Box>
                      )
                    })}
                  </Box>

                  {/* Total for this year */}
                  <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 'bold',
                        color: total > plan.totalQuantity
                          ? 'error.main'  // Red if exceeds contract total
                          : total === plan.totalQuantity
                            ? 'success.main'  // Green if matches exactly
                            : total > 0
                              ? 'warning.main'  // Amber if partial
                              : 'text.secondary'  // Grey if zero
                      }}
                    >
                      Year {plan.contractYear} Total: {total.toLocaleString()} KT
                    </Typography>

                    {/* Adjustment Notes - show if there are deferred/advanced quantities */}
                    {plan.adjustmentNotes && (
                      <Box sx={{ 
                        mt: 1.5, 
                        p: 1.5, 
                        bgcolor: '#FEF3C7', 
                        borderRadius: 1, 
                        border: '1px solid #F59E0B' 
                      }}>
                        <Typography variant="caption" sx={{ color: '#92400E', fontWeight: 600, display: 'block', mb: 0.5 }}>
                          📋 Adjustment Notes
                        </Typography>
                        {plan.adjustmentNotes.split('\n').map((note, idx) => (
                          <Typography key={idx} variant="body2" sx={{ color: '#78350F', fontSize: '0.85rem' }}>
                            {note}
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </Box>
                </Paper>
              </Grid>
            )
          })}
        </Grid>

        {/* Submit Button */}
        <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
          {onCancel && (
            <Button onClick={onCancel} variant="outlined" disabled={isSaving}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variant={isDirty ? "contained" : "outlined"}
            startIcon={existingPlans.length > 0 ? <Save /> : <Add />}
            disabled={isSaving || !isDirty}
            sx={{
              transition: 'all 0.2s ease',
              ...(isDirty ? {} : { color: 'text.secondary', borderColor: 'divider' })
            }}
          >
            {isSaving ? 'Saving...' : existingPlans.length > 0 ? 'Save Changes' : 'Create Plan'}
          </Button>
        </Box>
      </Box>
    </Paper>
  )
}
