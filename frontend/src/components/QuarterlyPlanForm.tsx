import { useState, useEffect } from 'react'
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Divider,
} from '@mui/material'
import { Add, Save, TrendingUp } from '@mui/icons-material'
import { quarterlyPlanAPI, contractAPI, AuthorityTopUp } from '../api/client'

interface QuarterlyPlanFormProps {
  contractId: number
  contract?: any  // Contract object with products
  editingPlan?: any  // Quarterly plan being edited (for single product edit)
  existingPlans?: any[]  // Existing quarterly plans for this contract
  onPlanCreated: () => void
  onCancel?: () => void
}

// Determine quarter order based on contract start month
const getQuarterOrder = (startMonth: number): ('Q1' | 'Q2' | 'Q3' | 'Q4')[] => {
  if (startMonth >= 1 && startMonth <= 3) {
    return ['Q1', 'Q2', 'Q3', 'Q4']
  } else if (startMonth >= 4 && startMonth <= 6) {
    return ['Q2', 'Q3', 'Q4', 'Q1']
  } else if (startMonth >= 7 && startMonth <= 9) {
    return ['Q3', 'Q4', 'Q1', 'Q2']
  } else {
    return ['Q4', 'Q1', 'Q2', 'Q3']
  }
}

// Get quarter label with months
const getQuarterLabel = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): string => {
  const labels: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', string> = {
    Q1: 'Jan-Mar',
    Q2: 'Apr-Jun',
    Q3: 'Jul-Sep',
    Q4: 'Oct-Dec',
  }
  return labels[quarter]
}

interface ProductPlanData {
  productName: string
  totalQuantity: number
  optionalQuantity: number
  authorityTopupQuantity: number  // Total authority top-ups for this product
  existingPlanId?: number
  q1: string
  q2: string
  q3: string
  q4: string
}

export default function QuarterlyPlanForm({ contractId, contract, existingPlans = [], onPlanCreated, onCancel }: QuarterlyPlanFormProps) {
  const [quarterOrder, setQuarterOrder] = useState<('Q1' | 'Q2' | 'Q3' | 'Q4')[]>(['Q1', 'Q2', 'Q3', 'Q4'])
  const [contractData, setContractData] = useState<any>(contract)
  const [productPlans, setProductPlans] = useState<ProductPlanData[]>([])
  const [isSaving, setIsSaving] = useState(false)
  
  // Authority Top-Up Dialog State
  const [topupDialogOpen, setTopupDialogOpen] = useState(false)
  const [topupProductName, setTopupProductName] = useState('')
  const [topupForm, setTopupForm] = useState({
    quantity: '',
    authority_reference: '',
    reason: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [isAddingTopup, setIsAddingTopup] = useState(false)

  // Load contract and determine quarter order
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

      if (contractToUse && contractToUse.start_period) {
        const startDate = new Date(contractToUse.start_period)
        const startMonth = startDate.getMonth() + 1
        const order = getQuarterOrder(startMonth)
        setQuarterOrder(order)
      }
    }
    loadContract()
  }, [contract, contractId])

  // Helper function to calculate authority top-up for a product
  const getAuthorityTopupForProduct = (productName: string): number => {
    if (!contractData?.authority_topups) return 0
    const topups = Array.isArray(contractData.authority_topups) ? contractData.authority_topups : []
    return topups
      .filter((t: any) => t.product_name === productName)
      .reduce((sum: number, t: any) => sum + (t.quantity || 0), 0)
  }

  // Initialize product plans when contract data or existing plans change
  useEffect(() => {
    if (!contractData) return
    
    const products = Array.isArray(contractData.products) ? contractData.products : []
    const isMultiProduct = products.length > 1
    
    if (isMultiProduct) {
      // Multi-product: Create a plan data entry for each product
      const newProductPlans: ProductPlanData[] = products.map((product: any) => {
        // Find existing plan for this product
        const existingPlan = existingPlans.find(p => p.product_name === product.name)
        
        // Map database quantities to form (based on quarter order)
        let q1 = '', q2 = '', q3 = '', q4 = ''
        if (existingPlan && contractData.start_period) {
          const startDate = new Date(contractData.start_period)
          const startMonth = startDate.getMonth() + 1
          const order = getQuarterOrder(startMonth)
          
          const dbQuantities = [
            existingPlan.q1_quantity || 0,
            existingPlan.q2_quantity || 0,
            existingPlan.q3_quantity || 0,
            existingPlan.q4_quantity || 0,
          ]
          
          // Map to calendar quarters
          const calendarQuantities: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }
          order.forEach((calQ, contractIdx) => {
            calendarQuantities[calQ] = dbQuantities[contractIdx]
          })
          
          q1 = calendarQuantities.Q1.toString()
          q2 = calendarQuantities.Q2.toString()
          q3 = calendarQuantities.Q3.toString()
          q4 = calendarQuantities.Q4.toString()
        }
        
        return {
          productName: product.name,
          totalQuantity: product.total_quantity || 0,
          optionalQuantity: product.optional_quantity || 0,
          authorityTopupQuantity: getAuthorityTopupForProduct(product.name),
          existingPlanId: existingPlan?.id,
          q1,
          q2,
          q3,
          q4,
        }
      })
      setProductPlans(newProductPlans)
    } else if (products.length === 1) {
      // Single product
      const product = products[0]
      const existingPlan = existingPlans.length > 0 ? existingPlans[0] : null
      
      let q1 = '', q2 = '', q3 = '', q4 = ''
      if (existingPlan && contractData.start_period) {
        const startDate = new Date(contractData.start_period)
        const startMonth = startDate.getMonth() + 1
        const order = getQuarterOrder(startMonth)
        
        const dbQuantities = [
          existingPlan.q1_quantity || 0,
          existingPlan.q2_quantity || 0,
          existingPlan.q3_quantity || 0,
          existingPlan.q4_quantity || 0,
        ]
        
        const calendarQuantities: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }
        order.forEach((calQ, contractIdx) => {
          calendarQuantities[calQ] = dbQuantities[contractIdx]
        })
        
        q1 = calendarQuantities.Q1.toString()
        q2 = calendarQuantities.Q2.toString()
        q3 = calendarQuantities.Q3.toString()
        q4 = calendarQuantities.Q4.toString()
      }
      
      setProductPlans([{
        productName: product.name,
        totalQuantity: product.total_quantity || 0,
        optionalQuantity: product.optional_quantity || 0,
        authorityTopupQuantity: getAuthorityTopupForProduct(product.name),
        existingPlanId: existingPlan?.id,
        q1,
        q2,
        q3,
        q4,
      }])
    }
  }, [contractData, existingPlans])

  const handleQuantityChange = (productIndex: number, quarter: 'q1' | 'q2' | 'q3' | 'q4', value: string) => {
    setProductPlans(prev => {
      const updated = [...prev]
      updated[productIndex] = { ...updated[productIndex], [quarter]: value }
      return updated
    })
  }

  const getProductTotal = (plan: ProductPlanData): number => {
    return (parseFloat(plan.q1) || 0) + (parseFloat(plan.q2) || 0) + (parseFloat(plan.q3) || 0) + (parseFloat(plan.q4) || 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!contractId || !contractData) {
      alert('Contract data not loaded. Please try again.')
      return
    }

    // Validate all products
    for (const plan of productPlans) {
      const total = getProductTotal(plan)
      // Max allowed = total + optional + authority top-ups
      const maxAllowed = plan.totalQuantity + plan.optionalQuantity + plan.authorityTopupQuantity
      
      if (total < plan.totalQuantity) {
        alert(`${plan.productName}: Total (${total.toLocaleString()} KT) is less than required (${plan.totalQuantity.toLocaleString()} KT)`)
        return
      }
      if (total > maxAllowed) {
        const topupMsg = plan.authorityTopupQuantity > 0 ? ` + ${plan.authorityTopupQuantity.toLocaleString()} KT authority top-up` : ''
        alert(`${plan.productName}: Total (${total.toLocaleString()} KT) exceeds maximum allowed (${maxAllowed.toLocaleString()} KT = ${plan.totalQuantity.toLocaleString()} KT + ${plan.optionalQuantity.toLocaleString()} KT optional${topupMsg})`)
        return
      }
      // Allow any value between totalQuantity and maxAllowed (more flexible)
    }

    setIsSaving(true)

    try {
      const startDate = new Date(contractData.start_period)
      const startMonth = startDate.getMonth() + 1
      const order = getQuarterOrder(startMonth)
      
      const isMultiProduct = productPlans.length > 1

      // Save each product's quarterly plan
      for (const plan of productPlans) {
        // Map calendar quarters to database fields
        const calendarQuantities: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number> = {
          Q1: parseFloat(plan.q1) || 0,
          Q2: parseFloat(plan.q2) || 0,
          Q3: parseFloat(plan.q3) || 0,
          Q4: parseFloat(plan.q4) || 0,
        }
        
        const dbQuantities = order.map(calQ => calendarQuantities[calQ])

        if (plan.existingPlanId) {
          // Update existing plan
          await quarterlyPlanAPI.update(plan.existingPlanId, {
            q1_quantity: dbQuantities[0],
            q2_quantity: dbQuantities[1],
            q3_quantity: dbQuantities[2],
            q4_quantity: dbQuantities[3],
          })
        } else {
          // Create new plan
          const createPayload: any = {
            contract_id: contractId,
            q1_quantity: dbQuantities[0],
            q2_quantity: dbQuantities[1],
            q3_quantity: dbQuantities[2],
            q4_quantity: dbQuantities[3],
          }
          
          // Add product_name for multi-product contracts
          if (isMultiProduct) {
            createPayload.product_name = plan.productName
          }
          
          await quarterlyPlanAPI.create(createPayload)
        }
      }

      alert('Quarterly plan(s) saved successfully!')
      onPlanCreated()
      if (onCancel) onCancel()
    } catch (error: any) {
      console.error('Error saving quarterly plan:', error)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error occurred'
      alert(`Error saving quarterly plan: ${errorMessage}`)
    } finally {
      setIsSaving(false)
    }
  }

  const contractProducts = contractData?.products || []
  const isMultiProduct = contractProducts.length > 1

  if (!contractData || productPlans.length === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography>Loading contract details...</Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        {existingPlans.length > 0 ? 'Edit Quarterly Plan' : 'Create Quarterly Plan'}
      </Typography>
      
      {isMultiProduct && (
        <Alert severity="info" sx={{ mb: 3 }}>
          This contract has multiple products. Enter quarterly quantities for each product below.
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {productPlans.map((plan, productIndex) => {
            const total = getProductTotal(plan)
            const maxAllowed = plan.totalQuantity + plan.optionalQuantity + plan.authorityTopupQuantity
            const isValid = total >= plan.totalQuantity && total <= maxAllowed
            const isExact = total === plan.totalQuantity
            
            return (
              <Grid item xs={12} md={isMultiProduct ? 6 : 12} key={plan.productName}>
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
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<TrendingUp />}
                        onClick={() => {
                          setTopupProductName(plan.productName)
                          setTopupForm({
                            quantity: '',
                            authority_reference: '',
                            reason: '',
                            date: new Date().toISOString().split('T')[0],
                          })
                          setTopupDialogOpen(true)
                        }}
                        sx={{ 
                          borderColor: '#10B981', 
                          color: '#10B981',
                          '&:hover': { 
                            borderColor: '#059669', 
                            bgcolor: 'rgba(16, 185, 129, 0.04)' 
                          }
                        }}
                      >
                        Authority Top-Up
                      </Button>
                    </Box>
                    <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                      Total: {plan.totalQuantity.toLocaleString()} KT
                      {plan.optionalQuantity > 0 && ` (+${plan.optionalQuantity.toLocaleString()} KT optional)`}
                      {plan.authorityTopupQuantity > 0 && (
                        <Chip 
                          size="small" 
                          label={`+${plan.authorityTopupQuantity.toLocaleString()} KT top-up`}
                          sx={{ 
                            ml: 1, 
                            bgcolor: '#D1FAE5', 
                            color: '#065F46',
                            fontWeight: 600,
                            height: 22,
                          }}
                        />
                      )}
                    </Typography>
                  </Box>

                  {/* Quarter Inputs */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {quarterOrder.map((quarter) => {
                      const fieldKey = `q${['Q1', 'Q2', 'Q3', 'Q4'].indexOf(quarter) + 1}` as 'q1' | 'q2' | 'q3' | 'q4'
                      return (
                        <TextField
                          key={quarter}
                          label={`${quarter} (${getQuarterLabel(quarter)})`}
                          type="number"
                          size="small"
                          value={plan[fieldKey]}
                          onChange={(e) => handleQuantityChange(productIndex, fieldKey, e.target.value)}
                          fullWidth
                          InputProps={{
                            endAdornment: <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>KT</Typography>
                          }}
                        />
                      )
                    })}
                  </Box>

                  {/* Total and Validation */}
                  <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography 
                      variant="body1" 
                      sx={{ 
                        fontWeight: 'bold', 
                        color: isValid ? 'success.main' : total > 0 ? 'error.main' : 'text.primary' 
                      }}
                    >
                      Total: {total.toLocaleString()} KT
                      {isValid && ' ✓'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {isExact 
                        ? `Matches contract total (${plan.totalQuantity.toLocaleString()} KT)`
                        : isValid 
                          ? plan.authorityTopupQuantity > 0 && total > plan.totalQuantity + plan.optionalQuantity
                            ? `Using authority top-up (max: ${maxAllowed.toLocaleString()} KT)`
                            : `Using optional quantity (${plan.totalQuantity.toLocaleString()} + ${plan.optionalQuantity.toLocaleString()} KT)`
                          : `Target: ${plan.totalQuantity.toLocaleString()} - ${maxAllowed.toLocaleString()} KT`}
                    </Typography>
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
            variant="contained" 
            startIcon={existingPlans.length > 0 ? <Save /> : <Add />}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : existingPlans.length > 0 ? 'Save Changes' : 'Create Plan'}
          </Button>
        </Box>
      </Box>

      {/* Authority Top-Up Dialog */}
      <Dialog open={topupDialogOpen} onClose={() => setTopupDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#F0FDF4', borderBottom: '1px solid #D1FAE5' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUp sx={{ color: '#10B981' }} />
            <Typography variant="h6">Authority Top-Up</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Add authorized quantity increase for <strong>{topupProductName}</strong>
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="Top-Up Quantity (KT)"
              type="number"
              value={topupForm.quantity}
              onChange={(e) => setTopupForm({ ...topupForm, quantity: e.target.value })}
              required
              fullWidth
              InputProps={{
                endAdornment: <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>KT</Typography>
              }}
              helperText="Additional quantity authorized beyond contract"
            />
            <TextField
              label="Authority Reference"
              value={topupForm.authority_reference}
              onChange={(e) => setTopupForm({ ...topupForm, authority_reference: e.target.value })}
              required
              fullWidth
              placeholder="e.g., AUTH-2024-001"
              helperText="Reference number for the authorization"
            />
            <TextField
              label="Date"
              type="date"
              value={topupForm.date}
              onChange={(e) => setTopupForm({ ...topupForm, date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Reason (Optional)"
              value={topupForm.reason}
              onChange={(e) => setTopupForm({ ...topupForm, reason: e.target.value })}
              fullWidth
              multiline
              rows={2}
              placeholder="e.g., Customer request, market demand"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTopupDialogOpen(false)} disabled={isAddingTopup}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (!topupForm.quantity || !topupForm.authority_reference) {
                alert('Please fill in quantity and authority reference')
                return
              }
              
              setIsAddingTopup(true)
              try {
                const topupData: AuthorityTopUp = {
                  product_name: topupProductName,
                  quantity: parseFloat(topupForm.quantity),
                  authority_reference: topupForm.authority_reference,
                  reason: topupForm.reason || undefined,
                  date: topupForm.date || undefined,
                }
                
                await contractAPI.addAuthorityTopup(contractId, topupData)
                
                // Reload contract to get updated top-ups
                const contractRes = await contractAPI.getById(contractId)
                setContractData(contractRes.data)
                
                setTopupDialogOpen(false)
                alert(`Authority top-up of ${parseFloat(topupForm.quantity).toLocaleString()} KT added successfully!`)
              } catch (error: any) {
                console.error('Error adding authority top-up:', error)
                const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error'
                alert(`Error adding top-up: ${errorMessage}`)
              } finally {
                setIsAddingTopup(false)
              }
            }}
            disabled={isAddingTopup || !topupForm.quantity || !topupForm.authority_reference}
            sx={{ 
              bgcolor: '#10B981', 
              '&:hover': { bgcolor: '#059669' } 
            }}
          >
            {isAddingTopup ? 'Adding...' : 'Add Top-Up'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
