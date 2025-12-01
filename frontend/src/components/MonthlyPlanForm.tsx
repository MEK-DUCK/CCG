import { useState, useEffect } from 'react'
import {
  Box,
  TextField,
  Typography,
  Paper,
  Grid,
  Button,
  Divider,
  IconButton,
  InputAdornment,
} from '@mui/material'
import { Save, Add, Delete, Lock } from '@mui/icons-material'
import { monthlyPlanAPI, quarterlyPlanAPI, contractAPI } from '../api/client'
import { MonthlyPlanStatus } from '../types'

interface MonthlyPlanFormProps {
  quarterlyPlanId?: number
  quarterlyPlan?: any  // Quarterly plan object
  editingPlan?: any  // Monthly plan being edited (not used in new design)
  onPlanCreated: () => void
  onCancel?: () => void
}

const QUARTER_MONTHS: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', { months: number[], labels: string[] }> = {
  Q1: { months: [1, 2, 3], labels: ['January', 'February', 'March'] },
  Q2: { months: [4, 5, 6], labels: ['April', 'May', 'June'] },
  Q3: { months: [7, 8, 9], labels: ['July', 'August', 'September'] },
  Q4: { months: [10, 11, 12], labels: ['October', 'November', 'December'] },
}

// Get month name from number
const getMonthName = (month: number): string => {
  const date = new Date(2000, month - 1, 1)
  return date.toLocaleString('default', { month: 'long' })
}

// Determine quarter order based on contract start month
const getQuarterOrder = (startMonth: number): ('Q1' | 'Q2' | 'Q3' | 'Q4')[] => {
  if (startMonth >= 1 && startMonth <= 3) {
    // Jan-Mar: Q1, Q2, Q3, Q4
    return ['Q1', 'Q2', 'Q3', 'Q4']
  } else if (startMonth >= 4 && startMonth <= 6) {
    // Apr-Jun: Q2, Q3, Q4, Q1
    return ['Q2', 'Q3', 'Q4', 'Q1']
  } else if (startMonth >= 7 && startMonth <= 9) {
    // Jul-Sep: Q3, Q4, Q1, Q2
    return ['Q3', 'Q4', 'Q1', 'Q2']
  } else {
    // Oct-Dec: Q4, Q1, Q2, Q3
    return ['Q4', 'Q1', 'Q2', 'Q3']
  }
}

// Get all months in contract period with their years
const getContractMonths = (startPeriod: string, endPeriod: string): Array<{ month: number, year: number }> => {
  const start = new Date(startPeriod)
  const end = new Date(endPeriod)
  const months: Array<{ month: number, year: number }> = []
  
  const current = new Date(start)
  while (current <= end) {
    months.push({
      month: current.getMonth() + 1,
      year: current.getFullYear()
    })
    current.setMonth(current.getMonth() + 1)
  }
  
  return months
}

interface MonthlyPlanEntry {
  id?: number  // Existing plan ID (if editing)
  quantity: string
  laycan_5_days: string
  laycan_2_days: string
}

export default function MonthlyPlanForm({ quarterlyPlanId, quarterlyPlan, editingPlan: _editingPlan, onPlanCreated, onCancel: _onCancel }: MonthlyPlanFormProps) {
  // Changed to support multiple entries per month: key is "month-year", value is array of entries
  const [monthEntries, setMonthEntries] = useState<Record<string, MonthlyPlanEntry[]>>({})
  const [existingMonthlyPlans, setExistingMonthlyPlans] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [contractType, setContractType] = useState<'FOB' | 'CIF' | null>(null)
  const [contract, setContract] = useState<any>(null)
  const [quarterOrder, setQuarterOrder] = useState<('Q1' | 'Q2' | 'Q3' | 'Q4')[]>([])
  const [contractMonths, setContractMonths] = useState<Array<{ month: number, year: number }>>([])
  const [planStatuses, setPlanStatuses] = useState<Record<number, MonthlyPlanStatus>>({}) // plan_id -> status

  // Load contract and determine quarter order
  useEffect(() => {
    const loadContract = async () => {
      if (quarterlyPlan && quarterlyPlan.contract_id) {
        try {
          const contractRes = await contractAPI.getById(quarterlyPlan.contract_id)
          const contractData = contractRes.data
          setContract(contractData)
          setContractType(contractData.contract_type)
          
          // Parse start period to get start month
          const startDate = new Date(contractData.start_period)
          const startMonth = startDate.getMonth() + 1
          
          // Determine quarter order
          const order = getQuarterOrder(startMonth)
          setQuarterOrder(order)
          
          // Get all months in contract period
          const months = getContractMonths(contractData.start_period, contractData.end_period)
          setContractMonths(months)
        } catch (error) {
          console.error('Error loading contract:', error)
        }
      }
    }
    loadContract()
  }, [quarterlyPlan])

  // Load existing monthly plans
  useEffect(() => {
    const loadExistingMonthlyPlans = async () => {
      if (!quarterlyPlanId) return
      
      try {
        const monthlyRes = await monthlyPlanAPI.getAll(quarterlyPlanId)
        const allPlans = monthlyRes.data || []
        setExistingMonthlyPlans(allPlans)
        
        // Load status for each plan
        const statusMap: Record<number, MonthlyPlanStatus> = {}
        for (const plan of allPlans) {
          try {
            const statusRes = await monthlyPlanAPI.getStatus(plan.id)
            statusMap[plan.id] = statusRes.data
          } catch (error) {
            console.error(`Error loading status for plan ${plan.id}:`, error)
            // Default to unlocked if status can't be loaded
            statusMap[plan.id] = {
              monthly_plan_id: plan.id,
              month: plan.month,
              year: plan.year,
              is_locked: false,
              has_cargos: false,
              has_completed_cargos: false,
              total_cargos: 0,
              completed_cargos: 0,
              cargo_ids: [],
              completed_cargo_ids: []
            }
          }
        }
        setPlanStatuses(statusMap)
        
        // Group existing plans by month-year and convert to entries
        const entries: Record<string, MonthlyPlanEntry[]> = {}
        
        allPlans.forEach((plan: any) => {
          const key = `${plan.month}-${plan.year}`
          if (!entries[key]) {
            entries[key] = []
          }
          entries[key].push({
            id: plan.id,
            quantity: plan.month_quantity.toString(),
            laycan_5_days: plan.laycan_5_days || '',
            laycan_2_days: plan.laycan_2_days || '',
          })
        })
        
        setMonthEntries(entries)
      } catch (error) {
        console.error('Error loading existing monthly plans:', error)
      }
    }
    
    if (quarterlyPlanId) {
      loadExistingMonthlyPlans()
    }
  }, [quarterlyPlanId])

  const handleLaycanChange = (month: number, year: number, entryIndex: number, field: 'laycan_5_days' | 'laycan_2_days', value: string) => {
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    const updatedEntries = [...entries]
    updatedEntries[entryIndex] = {
      ...updatedEntries[entryIndex],
      [field]: value,
    }
    setMonthEntries({
      ...monthEntries,
      [key]: updatedEntries,
    })
  }

  const handleQuantityChange = (month: number, year: number, entryIndex: number, value: string) => {
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    const updatedEntries = [...entries]
    updatedEntries[entryIndex] = {
      ...updatedEntries[entryIndex],
      quantity: value,
    }
    // Clear laycans if quantity becomes 0
    if (parseFloat(value || '0') === 0) {
      updatedEntries[entryIndex] = {
        ...updatedEntries[entryIndex],
        laycan_5_days: '',
        laycan_2_days: '',
      }
    }
    setMonthEntries({
      ...monthEntries,
      [key]: updatedEntries,
    })
  }

  const handleAddEntry = (month: number, year: number) => {
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    setMonthEntries({
      ...monthEntries,
      [key]: [...entries, { quantity: '', laycan_5_days: '', laycan_2_days: '' }],
    })
  }

  const handleRemoveEntry = (month: number, year: number, entryIndex: number) => {
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    const updatedEntries = entries.filter((_, index) => index !== entryIndex)
    setMonthEntries({
      ...monthEntries,
      [key]: updatedEntries,
    })
  }

  // Get months for a quarter within the contract period
  // This correctly maps calendar quarters (Q1-Q4) to the actual months they represent
  // For example, Q4 always means Oct-Dec (months 10, 11, 12), regardless of contract start
  const getQuarterMonths = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): Array<{ month: number, year: number }> => {
    // Q1 = Jan-Mar (1,2,3), Q2 = Apr-Jun (4,5,6), Q3 = Jul-Sep (7,8,9), Q4 = Oct-Dec (10,11,12)
    // These are calendar quarters, not contract quarters
    const quarterMonths = QUARTER_MONTHS[quarter].months
    // Filter contract months to only include months that match this calendar quarter
    return contractMonths.filter(cm => quarterMonths.includes(cm.month))
  }

  // Get quarterly quantity for a quarter (mapped based on position in contract)
  // IMPORTANT: Database fields (q1_quantity, q2_quantity, q3_quantity, q4_quantity) represent CONTRACT quarters 1-4
  // NOT calendar quarters Q1-Q4
  // For July-June contract: quarterOrder = ['Q3', 'Q4', 'Q1', 'Q2']
  // position 0 = Q3 (Contract Q1) -> q1_quantity
  // position 1 = Q4 (Contract Q2) -> q2_quantity
  // position 2 = Q1 (Contract Q3) -> q3_quantity
  // position 3 = Q2 (Contract Q4) -> q4_quantity
  const getQuarterlyQuantity = (_quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4', position: number): number => {
    if (!quarterlyPlan) {
      return 0
    }
    
    // Read database values - these are contract quarters, not calendar quarters
    const quantities = [
      quarterlyPlan.q1_quantity || 0,  // Contract quarter 1
      quarterlyPlan.q2_quantity || 0,  // Contract quarter 2
      quarterlyPlan.q3_quantity || 0,  // Contract quarter 3
      quarterlyPlan.q4_quantity || 0,  // Contract quarter 4
    ]
    
    const quantity = quantities[position] || 0
    
    // Detailed debug log
    
    return quantity
  }

  // Get total entered for a quarter (sum of all entries across all months in the quarter)
  const getTotalEntered = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): number => {
    const quarterMonths = getQuarterMonths(quarter)
    return quarterMonths.reduce((sum, { month, year }) => {
      const key = `${month}-${year}`
      const entries = monthEntries[key] || []
      return sum + entries.reduce((entrySum, entry) => {
        return entrySum + (parseFloat(entry.quantity || '0') || 0)
      }, 0)
    }, 0)
  }

  const handleSave = async () => {
    if (!quarterlyPlanId || isSaving) {
      alert('Please wait...')
      return
    }

    // Load quarterly plan if not provided
    let qpData = quarterlyPlan
    if (!qpData) {
      try {
        const qpRes = await quarterlyPlanAPI.getById(quarterlyPlanId)
        qpData = qpRes.data
      } catch (error) {
        alert('Error loading quarterly plan details. Please try again.')
        return
      }
    }

    // Validate all quarters
    for (let i = 0; i < quarterOrder.length; i++) {
      const quarter = quarterOrder[i]
      const quarterlyQuantity = getQuarterlyQuantity(quarter, i)
      const totalMonthlyQuantity = getTotalEntered(quarter)

      // Validate that total equals quarterly quantity
      if (totalMonthlyQuantity !== quarterlyQuantity) {
        const quarterLabel = QUARTER_MONTHS[quarter].labels.join('-')
        alert(`Error: Total monthly quantities for Contract Quarter ${i + 1} (${quarter} - ${quarterLabel}) (${totalMonthlyQuantity.toLocaleString()} KT) must equal the quarterly quantity (${quarterlyQuantity.toLocaleString()} KT).`)
        return
      }
    }

    setIsSaving(true)
    try {
      // Collect all existing plan IDs that should be kept
      const plansToKeep = new Set<number>()
      const plansToCreate: Array<{ month: number, year: number, entry: MonthlyPlanEntry }> = []
      
      // Process all entries
      Object.keys(monthEntries).forEach(key => {
        const [month, year] = key.split('-').map(Number)
        const entries = monthEntries[key] || []
        
        entries.forEach(entry => {
          if (entry.id) {
            // Existing plan - keep it
            plansToKeep.add(entry.id)
          } else {
            // New plan - create it
            plansToCreate.push({ month, year, entry })
          }
        })
      })

      // Delete plans that are no longer in the form
      for (const existingPlan of existingMonthlyPlans) {
        if (!plansToKeep.has(existingPlan.id)) {
          // Check if plan is locked before attempting deletion
          const status = planStatuses[existingPlan.id]
          if (status?.is_locked || status?.has_cargos) {
            const errorMsg = status?.has_completed_cargos
              ? `Cannot delete monthly plan for ${getMonthName(existingPlan.month)} ${existingPlan.year}. It has ${status.completed_cargos} completed cargo(s): ${status.completed_cargo_ids.join(', ')}.`
              : `Cannot delete monthly plan for ${getMonthName(existingPlan.month)} ${existingPlan.year}. It has ${status?.total_cargos || 0} cargo(s). Please delete or move the cargos first.`
            alert(errorMsg)
            continue
          }
          
          try {
            await monthlyPlanAPI.delete(existingPlan.id)
          } catch (error: any) {
            const errorMsg = error?.response?.data?.detail || `Error deleting plan ${existingPlan.id}`
            console.error(`Error deleting plan ${existingPlan.id}:`, error)
            alert(errorMsg)
          }
        }
      }

      // Update existing plans
      for (const existingPlan of existingMonthlyPlans) {
        if (plansToKeep.has(existingPlan.id)) {
          const key = `${existingPlan.month}-${existingPlan.year}`
          const entries = monthEntries[key] || []
          const entry = entries.find(e => e.id === existingPlan.id)
          
          if (entry) {
            // Check if plan is locked - if so, prevent month/year changes
            const status = planStatuses[existingPlan.id]
            const updateData: any = {
              month_quantity: parseFloat(entry.quantity || '0'),
              number_of_liftings: 1,
              planned_lifting_sizes: undefined,
              laycan_5_days: contractType === 'FOB' && parseFloat(entry.quantity || '0') > 0 ? (entry.laycan_5_days || undefined) : undefined,
              laycan_2_days: contractType === 'FOB' && parseFloat(entry.quantity || '0') > 0 ? (entry.laycan_2_days || undefined) : undefined,
            }
            
            // Only allow month/year changes if plan is not locked
            if (!status?.is_locked) {
              // Check if month/year changed (entry moved to different key)
              const newKey = `${existingPlan.month}-${existingPlan.year}`
              if (key !== newKey) {
                // Month/year changed - this shouldn't happen in the current UI, but handle it
                const [newMonth, newYear] = newKey.split('-').map(Number)
                updateData.month = newMonth
                updateData.year = newYear
              }
            }
            
            try {
              await monthlyPlanAPI.update(existingPlan.id, updateData)
            } catch (error: any) {
              const errorMsg = error?.response?.data?.detail || `Error updating plan ${existingPlan.id}`
              console.error(`Error updating plan ${existingPlan.id}:`, error)
              alert(errorMsg)
            }
          }
        }
      }

      // Create new plans
      const createPromises = plansToCreate.map(async ({ month, year, entry }) => {
        const quantity = parseFloat(entry.quantity || '0')
        return monthlyPlanAPI.create({
          quarterly_plan_id: quarterlyPlanId,
          month: month,
          year: year,
          month_quantity: quantity,
          number_of_liftings: 1,
          planned_lifting_sizes: undefined,
          laycan_5_days: contractType === 'FOB' && quantity > 0 ? (entry.laycan_5_days || undefined) : undefined,
          laycan_2_days: contractType === 'FOB' && quantity > 0 ? (entry.laycan_2_days || undefined) : undefined,
        })
      })

      await Promise.all(createPromises)
      
      // Reload existing plans
      const monthlyRes = await monthlyPlanAPI.getAll(quarterlyPlanId)
      setExistingMonthlyPlans(monthlyRes.data || [])
      
      // Reload entries
      const allPlans = monthlyRes.data || []
      const entries: Record<string, MonthlyPlanEntry[]> = {}
      allPlans.forEach((plan: any) => {
        const key = `${plan.month}-${plan.year}`
        if (!entries[key]) {
          entries[key] = []
        }
        entries[key].push({
          id: plan.id,
          quantity: plan.month_quantity.toString(),
          laycan_5_days: plan.laycan_5_days || '',
          laycan_2_days: plan.laycan_2_days || '',
        })
      })
      setMonthEntries(entries)
      
      alert('All monthly plans saved successfully!')
      onPlanCreated()
    } catch (error: any) {
      console.error('Error saving monthly plans:', error)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error occurred'
      alert(`Error saving monthly plans: ${errorMessage}`)
    } finally {
      setIsSaving(false)
    }
  }

  if (!quarterlyPlanId) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="error" sx={{ mb: 2 }}>
          Please create a quarterly plan first
        </Typography>
      </Paper>
    )
  }

  if (!contract || quarterOrder.length === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography>Loading contract details...</Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Monthly Plan
      </Typography>
      {quarterlyPlan && (
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'info.light', borderRadius: 1 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom sx={{ color: '#000000' }}>Contract Period:</Typography>
          <Typography variant="body2" sx={{ mb: 1, color: '#000000' }}>
            {new Date(contract.start_period).toLocaleDateString()} - {new Date(contract.end_period).toLocaleDateString()}
          </Typography>
          <Typography variant="body2" fontWeight="bold" gutterBottom sx={{ color: '#000000' }}>Quarterly Plan Quantities:</Typography>
          <Typography variant="body2" sx={{ color: '#000000' }}>
            {quarterOrder.map((q, idx) => {
              const quarterLabel = QUARTER_MONTHS[q].labels.join('-')
              return (
                <span key={q}>
                  Contract Quarter {idx + 1} ({q} - {quarterLabel}): {(getQuarterlyQuantity(q, idx)).toLocaleString()} KT
                  {idx < quarterOrder.length - 1 ? ' | ' : ''}
                </span>
              )
            })}
          </Typography>
        </Box>
      )}
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {quarterOrder.map((quarter, quarterIndex) => {
          const quarterMonths = getQuarterMonths(quarter)
          if (quarterMonths.length === 0) return null
          
          const quarterlyQuantity = getQuarterlyQuantity(quarter, quarterIndex)
          const totalEntered = getTotalEntered(quarter)
          
          return (
            <Box key={quarter}>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Contract Quarter {quarterIndex + 1} ({quarter} - {QUARTER_MONTHS[quarter].labels.join('-')})
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Total: {quarterlyQuantity.toLocaleString()} KT | 
                  Entered: {totalEntered.toLocaleString()} KT | 
                  Remaining: {(quarterlyQuantity - totalEntered).toLocaleString()} KT
                </Typography>
              </Box>
              <Grid container spacing={2}>
                {quarterMonths.map(({ month, year }) => {
                  const key = `${month}-${year}`
                  const entries = monthEntries[key] || []
                  
                  return (
                    <Grid item xs={12} sm={4} key={key}>
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="subtitle2" fontWeight="bold">
                              {getMonthName(month)} {year}
                            </Typography>
                            {entries.some(e => e.id && planStatuses[e.id!]?.is_locked) && (
                              <Lock fontSize="small" color="warning" sx={{ ml: 0.5 }} />
                            )}
                          </Box>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleAddEntry(month, year)}
                            sx={{ ml: 1 }}
                          >
                            <Add fontSize="small" />
                          </IconButton>
                        </Box>
                        {entries.length === 0 && (
                          <Box sx={{ mb: 1 }}>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<Add />}
                              onClick={() => handleAddEntry(month, year)}
                              fullWidth
                            >
                              Add Entry
                            </Button>
                          </Box>
                        )}
                        {entries.map((entry, entryIndex) => {
                          const quantity = parseFloat(entry.quantity || '0')
                          const showLaycans = contractType === 'FOB' && quantity > 0
                          const status = entry.id ? planStatuses[entry.id] : null
                          const isLocked = status?.is_locked || false
                          const hasCargos = status?.has_cargos || false
                          
                          return (
                            <Box key={entryIndex} sx={{ mb: entries.length > 1 ? 2 : 0 }}>
                              <TextField
                                label={`${getMonthName(month)} ${year}${entries.length > 1 ? ` (${entryIndex + 1})` : ''}`}
                                type="number"
                                value={entry.quantity}
                                onChange={(e) => handleQuantityChange(month, year, entryIndex, e.target.value)}
                                required
                                fullWidth
                                disabled={isLocked}
                                helperText={
                                  entry.id 
                                    ? `Existing: ${parseFloat(entry.quantity || '0').toLocaleString()} KT${isLocked ? ' (Locked - has completed cargos)' : hasCargos ? ' (Has cargos)' : ''}`
                                    : ''
                                }
                                InputProps={{
                                  endAdornment: entries.length > 1 ? (
                                    <InputAdornment position="end">
                                      <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => handleRemoveEntry(month, year, entryIndex)}
                                        edge="end"
                                        disabled={isLocked || hasCargos}
                                        title={isLocked ? 'Cannot delete: plan has completed cargos' : hasCargos ? 'Cannot delete: plan has cargos' : 'Delete entry'}
                                      >
                                        <Delete fontSize="small" />
                                      </IconButton>
                                    </InputAdornment>
                                  ) : undefined,
                                }}
                              />
                              {showLaycans && (
                                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  <TextField
                                    label="5 Days:"
                                    size="small"
                                    value={entry.laycan_5_days}
                                    onChange={(e) => handleLaycanChange(month, year, entryIndex, 'laycan_5_days', e.target.value)}
                                    placeholder="User Entry"
                                    fullWidth
                                    disabled={isLocked}
                                    sx={{
                                      '& .MuiInputBase-root': {
                                        height: '32px',
                                        fontSize: '0.875rem',
                                      },
                                      '& .MuiInputBase-input': {
                                        padding: '6px 8px',
                                      },
                                    }}
                                  />
                                  <TextField
                                    label="2 Days:"
                                    size="small"
                                    value={entry.laycan_2_days}
                                    onChange={(e) => handleLaycanChange(month, year, entryIndex, 'laycan_2_days', e.target.value)}
                                    placeholder="User Entry"
                                    fullWidth
                                    disabled={isLocked}
                                    sx={{
                                      '& .MuiInputBase-root': {
                                        height: '32px',
                                        fontSize: '0.875rem',
                                      },
                                      '& .MuiInputBase-input': {
                                        padding: '6px 8px',
                                      },
                                    }}
                                  />
                                </Box>
                              )}
                            </Box>
                          )
                        })}
                      </Box>
                    </Grid>
                  )
                })}
              </Grid>
            </Box>
          )
        })}
        
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<Save />}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving All Monthly Plans...' : 'Save All Monthly Plans'}
          </Button>
        </Box>
      </Box>
    </Paper>
  )
}
