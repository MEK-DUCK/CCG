import { useState, useEffect, useRef } from 'react'
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Checkbox,
  FormControlLabel,
} from '@mui/material'
import { Save, Add, Delete, Lock } from '@mui/icons-material'
import { monthlyPlanAPI, contractAPI } from '../api/client'
import { MonthlyPlanStatus } from '../types'

// Simple UUID generator
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

interface MonthlyPlanFormProps {
  contractId: number
  contract?: any
  quarterlyPlans: any[]  // All quarterly plans for this contract
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
    return ['Q1', 'Q2', 'Q3', 'Q4']
  } else if (startMonth >= 4 && startMonth <= 6) {
    return ['Q2', 'Q3', 'Q4', 'Q1']
  } else if (startMonth >= 7 && startMonth <= 9) {
    return ['Q3', 'Q4', 'Q1', 'Q2']
  } else {
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
  id?: number
  quarterly_plan_id: number
  product_name: string  // Product name for this entry
  quantity: string
  laycan_5_days: string
  laycan_2_days: string
  laycan_2_days_remark: string
  loading_month: string
  loading_window: string
  delivery_month: string
  delivery_window: string
  delivery_window_remark: string
  // Combi cargo fields
  is_combi: boolean
  combi_group_id?: string
  combi_quantities: Record<string, string>  // For combi entries - quantity per product (e.g., { "GASOIL": "45", "JET A-1": "10" })
  _combi_plan_ids?: number[]  // For existing combi entries - all plan IDs in the group
}

export default function MonthlyPlanForm({ contractId, contract: propContract, quarterlyPlans, onPlanCreated }: MonthlyPlanFormProps) {
  const [monthEntries, setMonthEntries] = useState<Record<string, MonthlyPlanEntry[]>>({})
  const [existingMonthlyPlans, setExistingMonthlyPlans] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [contractType, setContractType] = useState<'FOB' | 'CIF' | null>(null)
  const [contract, setContract] = useState<any>(propContract)
  const [quarterOrder, setQuarterOrder] = useState<('Q1' | 'Q2' | 'Q3' | 'Q4')[]>([])
  const [contractMonths, setContractMonths] = useState<Array<{ month: number, year: number }>>([])
  const [planStatuses, setPlanStatuses] = useState<Record<number, MonthlyPlanStatus>>({})
  const autosaveTimersRef = useRef<Record<string, number>>({})

  // Get product list from contract
  const products = contract?.products ? (Array.isArray(contract.products) ? contract.products : JSON.parse(contract.products)) : []
  const isMultiProduct = products.length > 1

  // Map product names to their quarterly plans
  const productQuarterlyPlanMap = new Map<string, any>()
  quarterlyPlans.forEach(qp => {
    if (qp.product_name) {
      productQuarterlyPlanMap.set(qp.product_name, qp)
    }
  })
  // For single product contracts, map the first product to the first quarterly plan
  if (!isMultiProduct && products.length === 1 && quarterlyPlans.length > 0) {
    productQuarterlyPlanMap.set(products[0].name, quarterlyPlans[0])
  }

  const scheduleAutosave = (planId: number, data: any, keySuffix: string) => {
    const key = `${planId}:${keySuffix}`
    const existing = autosaveTimersRef.current[key]
    if (existing) {
      window.clearTimeout(existing)
    }
    autosaveTimersRef.current[key] = window.setTimeout(async () => {
      try {
        await monthlyPlanAPI.update(planId, data)
      } catch (error) {
        console.error('Error autosaving monthly plan field:', error)
      }
    }, 600)
  }

  // Load contract
  useEffect(() => {
    const loadContract = async () => {
      if (propContract) {
        setContract(propContract)
        setContractType(propContract.contract_type)
        
        const startDate = new Date(propContract.start_period)
        const startMonth = startDate.getMonth() + 1
        const order = getQuarterOrder(startMonth)
        setQuarterOrder(order)
        
        const months = getContractMonths(propContract.start_period, propContract.end_period)
        setContractMonths(months)
      } else if (contractId) {
        try {
          const contractRes = await contractAPI.getById(contractId)
          const contractData = contractRes.data
          setContract(contractData)
          setContractType(contractData.contract_type)
          
          const startDate = new Date(contractData.start_period)
          const startMonth = startDate.getMonth() + 1
          const order = getQuarterOrder(startMonth)
          setQuarterOrder(order)
          
          const months = getContractMonths(contractData.start_period, contractData.end_period)
          setContractMonths(months)
        } catch (error) {
          console.error('Error loading contract:', error)
        }
      }
    }
    loadContract()
  }, [propContract, contractId])

  // Load existing monthly plans from ALL quarterly plans
  useEffect(() => {
    const loadExistingMonthlyPlans = async () => {
      if (!quarterlyPlans || quarterlyPlans.length === 0) return
      
      try {
        // Load monthly plans from all quarterly plans
        const allPlans: any[] = []
        for (const qp of quarterlyPlans) {
          const monthlyRes = await monthlyPlanAPI.getAll(qp.id)
          const plans = (monthlyRes.data || []).map((p: any) => ({
            ...p,
            product_name: qp.product_name || products[0]?.name || 'Unknown'
          }))
          allPlans.push(...plans)
        }
        setExistingMonthlyPlans(allPlans)
        
        // Load status for each plan
        const statusMap: Record<number, MonthlyPlanStatus> = {}
        for (const plan of allPlans) {
          try {
            const statusRes = await monthlyPlanAPI.getStatus(plan.id)
            statusMap[plan.id] = statusRes.data
          } catch (error) {
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
        
        // Group plans by combi_group_id first
        const combiGroups = new Map<string, any[]>()
        const nonCombiPlans: any[] = []
        
        allPlans.forEach((plan: any) => {
          if (plan.combi_group_id) {
            const existing = combiGroups.get(plan.combi_group_id) || []
            existing.push(plan)
            combiGroups.set(plan.combi_group_id, existing)
          } else {
            nonCombiPlans.push(plan)
          }
        })
        
        // Group by month-year
        const entries: Record<string, MonthlyPlanEntry[]> = {}
        
        // Process combi groups - create unified entries
        combiGroups.forEach((combiPlans, combiGroupId) => {
          if (combiPlans.length === 0) return
          
          const firstPlan = combiPlans[0]
          const key = `${firstPlan.month}-${firstPlan.year}`
          if (!entries[key]) {
            entries[key] = []
          }
          
          // Build combi_quantities from all plans in the group
          const combiQuantities: Record<string, string> = {}
          const combiPlanIds: number[] = []
          combiPlans.forEach((plan: any) => {
            combiQuantities[plan.product_name] = plan.month_quantity.toString()
            combiPlanIds.push(plan.id)
          })
          
          // Calculate total quantity
          const totalQuantity = combiPlans.reduce((sum: number, p: any) => sum + p.month_quantity, 0)
          
          entries[key].push({
            id: firstPlan.id,  // Use first plan's ID as reference
            quarterly_plan_id: firstPlan.quarterly_plan_id,
            product_name: '',  // Combi entries don't have a single product
            quantity: totalQuantity.toString(),
            laycan_5_days: firstPlan.laycan_5_days || '',
            laycan_2_days: firstPlan.laycan_2_days || '',
            laycan_2_days_remark: firstPlan.laycan_2_days_remark || '',
            loading_month: firstPlan.loading_month || '',
            loading_window: firstPlan.loading_window || '',
            delivery_month: firstPlan.delivery_month || '',
            delivery_window: firstPlan.delivery_window || '',
            delivery_window_remark: firstPlan.delivery_window_remark || '',
            is_combi: true,
            combi_group_id: combiGroupId,
            combi_quantities: combiQuantities,
            // Store all plan IDs for updates/deletes
            _combi_plan_ids: combiPlanIds,
          } as MonthlyPlanEntry & { _combi_plan_ids?: number[] })
        })
        
        // Process non-combi plans individually
        nonCombiPlans.forEach((plan: any) => {
          const key = `${plan.month}-${plan.year}`
          if (!entries[key]) {
            entries[key] = []
          }
          entries[key].push({
            id: plan.id,
            quarterly_plan_id: plan.quarterly_plan_id,
            product_name: plan.product_name,
            quantity: plan.month_quantity.toString(),
            laycan_5_days: plan.laycan_5_days || '',
            laycan_2_days: plan.laycan_2_days || '',
            laycan_2_days_remark: plan.laycan_2_days_remark || '',
            loading_month: plan.loading_month || '',
            loading_window: plan.loading_window || '',
            delivery_month: plan.delivery_month || '',
            delivery_window: plan.delivery_window || '',
            delivery_window_remark: plan.delivery_window_remark || '',
            is_combi: false,
            combi_group_id: undefined,
            combi_quantities: {},
          })
        })
        
        setMonthEntries(entries)
      } catch (error) {
        console.error('Error loading existing monthly plans:', error)
      }
    }
    
    loadExistingMonthlyPlans()
  }, [quarterlyPlans, products])

  const handleProductChange = (month: number, year: number, entryIndex: number, productName: string) => {
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    const updatedEntries = [...entries]
    
    // Get the quarterly plan for this product
    const qp = productQuarterlyPlanMap.get(productName)
    
    updatedEntries[entryIndex] = {
      ...updatedEntries[entryIndex],
      product_name: productName,
      quarterly_plan_id: qp?.id || 0,
    }
    setMonthEntries({
      ...monthEntries,
      [key]: updatedEntries,
    })
  }

  const handleLaycanChange = (
    month: number,
    year: number,
    entryIndex: number,
    field: 'laycan_5_days' | 'laycan_2_days' | 'laycan_2_days_remark' | 'loading_month' | 'loading_window' | 'delivery_month' | 'delivery_window' | 'delivery_window_remark',
    value: string
  ) => {
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

    const planId = updatedEntries[entryIndex]?.id
    if (planId && (field === 'laycan_2_days_remark' || field === 'delivery_window_remark')) {
      scheduleAutosave(planId, { [field]: value }, field)
    }
  }

  const handleQuantityChange = (month: number, year: number, entryIndex: number, value: string) => {
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    const updatedEntries = [...entries]
    updatedEntries[entryIndex] = {
      ...updatedEntries[entryIndex],
      quantity: value,
    }
    if (parseFloat(value || '0') === 0) {
      updatedEntries[entryIndex] = {
        ...updatedEntries[entryIndex],
        laycan_5_days: '',
        laycan_2_days: '',
        laycan_2_days_remark: '',
        delivery_window_remark: '',
      }
    }
    setMonthEntries({
      ...monthEntries,
      [key]: updatedEntries,
    })
  }

  const handleAddEntry = (month: number, year: number, isCombi: boolean = false) => {
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    
    // For single product contracts, always use the first product
    // For multi-product contracts, default to first product unless combi
    const defaultProduct = products[0]?.name || ''
    const defaultQp = productQuarterlyPlanMap.get(defaultProduct)
    
    // Initialize combi quantities with empty values for all products
    const initialCombiQuantities: Record<string, string> = {}
    if (isCombi) {
      products.forEach((p: any) => {
        initialCombiQuantities[p.name] = ''
      })
    }
    
    setMonthEntries({
      ...monthEntries,
      [key]: [...entries, {
        quarterly_plan_id: isCombi ? 0 : (defaultQp?.id || 0),
        product_name: isMultiProduct ? (isCombi ? '' : defaultProduct) : defaultProduct,
        quantity: '',
        laycan_5_days: '',
        laycan_2_days: '',
        laycan_2_days_remark: '',
        loading_month: '',
        loading_window: '',
        delivery_month: '',
        delivery_window: '',
        delivery_window_remark: '',
        is_combi: isCombi,
        combi_group_id: isCombi ? generateUUID() : undefined,
        combi_quantities: initialCombiQuantities,
      }],
    })
  }

  const handleCombiChange = (month: number, year: number, entryIndex: number, isCombi: boolean) => {
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    const updatedEntries = [...entries]
    
    if (isCombi) {
      // Switching to combi mode - initialize quantities for all products
      const initialCombiQuantities: Record<string, string> = {}
      products.forEach((p: any) => {
        initialCombiQuantities[p.name] = ''
      })
      
      updatedEntries[entryIndex] = {
        ...updatedEntries[entryIndex],
        is_combi: true,
        combi_group_id: generateUUID(),
        combi_quantities: initialCombiQuantities,
        product_name: '',
        quarterly_plan_id: 0,
        quantity: '',  // Clear total quantity - will be calculated from combi quantities
      }
    } else {
      // Switching to single product mode
      const defaultProduct = products[0]?.name || ''
      const defaultQp = productQuarterlyPlanMap.get(defaultProduct)
      updatedEntries[entryIndex] = {
        ...updatedEntries[entryIndex],
        is_combi: false,
        combi_group_id: undefined,
        combi_quantities: {},
        product_name: defaultProduct,
        quarterly_plan_id: defaultQp?.id || 0,
      }
    }
    
    setMonthEntries({
      ...monthEntries,
      [key]: updatedEntries,
    })
  }

  const handleCombiQuantityChange = (month: number, year: number, entryIndex: number, productName: string, value: string) => {
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    const updatedEntries = [...entries]
    
    const newCombiQuantities = {
      ...updatedEntries[entryIndex].combi_quantities,
      [productName]: value,
    }
    
    // Calculate total quantity from all combi quantities
    const totalQuantity = Object.values(newCombiQuantities).reduce((sum, qty) => {
      return sum + (parseFloat(qty) || 0)
    }, 0)
    
    updatedEntries[entryIndex] = {
      ...updatedEntries[entryIndex],
      combi_quantities: newCombiQuantities,
      quantity: totalQuantity > 0 ? totalQuantity.toString() : '',
    }
    
    setMonthEntries({
      ...monthEntries,
      [key]: updatedEntries,
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

  const getQuarterMonths = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): Array<{ month: number, year: number }> => {
    const quarterMonths = QUARTER_MONTHS[quarter].months
    return contractMonths.filter(cm => quarterMonths.includes(cm.month))
  }

  // Get quarterly quantity for a product and quarter position
  const getQuarterlyQuantity = (productName: string, quarterPosition: number): number => {
    const qp = productQuarterlyPlanMap.get(productName)
    if (!qp) return 0
    
    const quantities = [
      qp.q1_quantity || 0,
      qp.q2_quantity || 0,
      qp.q3_quantity || 0,
      qp.q4_quantity || 0,
    ]
    
    return quantities[quarterPosition] || 0
  }

  // Get total entered for a quarter for a specific product
  const getTotalEntered = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4', productName: string): number => {
    const quarterMonths = getQuarterMonths(quarter)
    return quarterMonths.reduce((sum, { month, year }) => {
      const key = `${month}-${year}`
      const entries = monthEntries[key] || []
      return sum + entries.reduce((entrySum, entry) => {
        if (entry.is_combi) {
          // For combi entries, use the specific product's quantity
          const productQty = parseFloat(entry.combi_quantities[productName] || '0') || 0
          return entrySum + productQty
        } else if (entry.product_name === productName) {
          // Single product entry
          const qty = parseFloat(entry.quantity || '0') || 0
          return entrySum + qty
        }
        return entrySum
      }, 0)
    }, 0)
  }

  const handleSave = async () => {
    if (isSaving || quarterlyPlans.length === 0) {
      alert('Please wait...')
      return
    }

    // Validate quantities for each product and quarter
    for (const product of products) {
      for (let i = 0; i < quarterOrder.length; i++) {
        const quarter = quarterOrder[i]
        const quarterlyQuantity = getQuarterlyQuantity(product.name, i)
        const totalMonthlyQuantity = getTotalEntered(quarter, product.name)

        if (totalMonthlyQuantity !== quarterlyQuantity) {
          const quarterLabel = QUARTER_MONTHS[quarter].labels.join('-')
          alert(`Error: ${product.name} - Total monthly quantities for Contract Quarter ${i + 1} (${quarter} - ${quarterLabel}) (${totalMonthlyQuantity.toLocaleString()} KT) must equal the quarterly quantity (${quarterlyQuantity.toLocaleString()} KT).`)
          return
        }
      }
    }

    setIsSaving(true)
    try {
      const plansToKeep = new Set<number>()
      const plansToCreate: Array<{ month: number, year: number, entry: MonthlyPlanEntry }> = []
      const combiEntriesToUpdate: Array<{ entry: MonthlyPlanEntry, month: number, year: number }> = []
      
      Object.keys(monthEntries).forEach(key => {
        const [month, year] = key.split('-').map(Number)
        const entries = monthEntries[key] || []
        
        entries.forEach(entry => {
          if (entry.id) {
            // Existing entry
            if (entry.is_combi && entry._combi_plan_ids) {
              // Combi entry - keep all plan IDs in the group
              entry._combi_plan_ids.forEach(id => plansToKeep.add(id))
              combiEntriesToUpdate.push({ entry, month, year })
            } else {
              // Single product entry
              plansToKeep.add(entry.id)
            }
          } else if (entry.is_combi) {
            // New combi entry - check if any product has quantity
            const hasQuantity = Object.values(entry.combi_quantities).some(qty => parseFloat(qty) > 0)
            if (hasQuantity) {
              plansToCreate.push({ month, year, entry })
            }
          } else if (!entry.is_combi && entry.quarterly_plan_id && parseFloat(entry.quantity || '0') > 0) {
            // New single product entry
            plansToCreate.push({ month, year, entry })
          }
        })
      })

      // Delete plans that are no longer in the form
      for (const existingPlan of existingMonthlyPlans) {
        if (!plansToKeep.has(existingPlan.id)) {
          const status = planStatuses[existingPlan.id]
          if (status?.is_locked || status?.has_cargos) {
            continue
          }
          
          try {
            await monthlyPlanAPI.delete(existingPlan.id)
          } catch (error: any) {
            console.error(`Error deleting plan ${existingPlan.id}:`, error)
          }
        }
      }

      // Update existing combi entries - update each plan in the group with its product's quantity
      for (const { entry } of combiEntriesToUpdate) {
        if (!entry._combi_plan_ids) continue
        
        for (const planId of entry._combi_plan_ids) {
          const existingPlan = existingMonthlyPlans.find(p => p.id === planId)
          if (!existingPlan) continue
          
          // Get the quantity for this plan's product from combi_quantities
          const productQty = parseFloat(entry.combi_quantities[existingPlan.product_name] || '0')
          
          const updateData: any = {
            month_quantity: productQty,
            number_of_liftings: 1,
            laycan_5_days: contractType === 'FOB' && productQty > 0 ? (entry.laycan_5_days || undefined) : undefined,
            laycan_2_days: contractType === 'FOB' && productQty > 0 ? (entry.laycan_2_days || undefined) : undefined,
            laycan_2_days_remark: contractType === 'FOB' && productQty > 0 ? (entry.laycan_2_days_remark || undefined) : undefined,
            loading_month: contractType === 'CIF' && productQty > 0 ? (entry.loading_month || undefined) : undefined,
            loading_window: contractType === 'CIF' && productQty > 0 ? (entry.loading_window || undefined) : undefined,
            delivery_month: contractType === 'CIF' && productQty > 0 ? (entry.delivery_month || undefined) : undefined,
            delivery_window: contractType === 'CIF' && productQty > 0 ? (entry.delivery_window || undefined) : undefined,
            delivery_window_remark: contractType === 'CIF' && productQty > 0 ? (entry.delivery_window_remark || undefined) : undefined,
          }
          
          try {
            await monthlyPlanAPI.update(planId, updateData)
          } catch (error: any) {
            console.error(`Error updating combi plan ${planId}:`, error)
          }
        }
      }

      // Update existing non-combi plans
      for (const existingPlan of existingMonthlyPlans) {
        // Skip if already handled as combi or will be deleted
        if (!plansToKeep.has(existingPlan.id)) continue
        if (existingPlan.combi_group_id) continue  // Already handled above
        
        const key = `${existingPlan.month}-${existingPlan.year}`
        const entries = monthEntries[key] || []
        const entry = entries.find(e => e.id === existingPlan.id && !e.is_combi)
        
        if (entry) {
          const updateData: any = {
            month_quantity: parseFloat(entry.quantity || '0'),
            number_of_liftings: 1,
            laycan_5_days: contractType === 'FOB' && parseFloat(entry.quantity || '0') > 0 ? (entry.laycan_5_days || undefined) : undefined,
            laycan_2_days: contractType === 'FOB' && parseFloat(entry.quantity || '0') > 0 ? (entry.laycan_2_days || undefined) : undefined,
            laycan_2_days_remark: contractType === 'FOB' && parseFloat(entry.quantity || '0') > 0 ? (entry.laycan_2_days_remark || undefined) : undefined,
            loading_month: contractType === 'CIF' && parseFloat(entry.quantity || '0') > 0 ? (entry.loading_month || undefined) : undefined,
            loading_window: contractType === 'CIF' && parseFloat(entry.quantity || '0') > 0 ? (entry.loading_window || undefined) : undefined,
            delivery_month: contractType === 'CIF' && parseFloat(entry.quantity || '0') > 0 ? (entry.delivery_month || undefined) : undefined,
            delivery_window: contractType === 'CIF' && parseFloat(entry.quantity || '0') > 0 ? (entry.delivery_window || undefined) : undefined,
            delivery_window_remark: contractType === 'CIF' && parseFloat(entry.quantity || '0') > 0 ? (entry.delivery_window_remark || undefined) : undefined,
          }
          
          try {
            await monthlyPlanAPI.update(existingPlan.id, updateData)
          } catch (error: any) {
            console.error(`Error updating plan ${existingPlan.id}:`, error)
          }
        }
      }

      // Create new plans
      const createPromises: Promise<any>[] = []
      
      for (const { month, year, entry } of plansToCreate) {
        if (entry.is_combi) {
          // Combi entry: create one plan per product with its specific quantity
          const combiGroupId = entry.combi_group_id || generateUUID()
          
          for (const productName of products.map((p: any) => p.name)) {
            const productQty = parseFloat(entry.combi_quantities[productName] || '0')
            if (productQty <= 0) continue  // Skip products with no quantity
            
            const qp = productQuarterlyPlanMap.get(productName)
            if (!qp) continue
            
            createPromises.push(monthlyPlanAPI.create({
              quarterly_plan_id: qp.id,
              month: month,
              year: year,
              month_quantity: productQty,
              number_of_liftings: 1,
              laycan_5_days: contractType === 'FOB' ? (entry.laycan_5_days || undefined) : undefined,
              laycan_2_days: contractType === 'FOB' ? (entry.laycan_2_days || undefined) : undefined,
              laycan_2_days_remark: contractType === 'FOB' ? (entry.laycan_2_days_remark || undefined) : undefined,
              loading_month: contractType === 'CIF' ? (entry.loading_month || undefined) : undefined,
              loading_window: contractType === 'CIF' ? (entry.loading_window || undefined) : undefined,
              delivery_month: contractType === 'CIF' ? (entry.delivery_month || undefined) : undefined,
              delivery_window: contractType === 'CIF' ? (entry.delivery_window || undefined) : undefined,
              delivery_window_remark: contractType === 'CIF' ? (entry.delivery_window_remark || undefined) : undefined,
              combi_group_id: combiGroupId,
            }))
          }
        } else {
          // Single product entry
          const totalQuantity = parseFloat(entry.quantity || '0')
          createPromises.push(monthlyPlanAPI.create({
            quarterly_plan_id: entry.quarterly_plan_id,
            month: month,
            year: year,
            month_quantity: totalQuantity,
            number_of_liftings: 1,
            laycan_5_days: contractType === 'FOB' && totalQuantity > 0 ? (entry.laycan_5_days || undefined) : undefined,
            laycan_2_days: contractType === 'FOB' && totalQuantity > 0 ? (entry.laycan_2_days || undefined) : undefined,
            laycan_2_days_remark: contractType === 'FOB' && totalQuantity > 0 ? (entry.laycan_2_days_remark || undefined) : undefined,
            loading_month: contractType === 'CIF' && totalQuantity > 0 ? (entry.loading_month || undefined) : undefined,
            loading_window: contractType === 'CIF' && totalQuantity > 0 ? (entry.loading_window || undefined) : undefined,
            delivery_month: contractType === 'CIF' && totalQuantity > 0 ? (entry.delivery_month || undefined) : undefined,
            delivery_window: contractType === 'CIF' && totalQuantity > 0 ? (entry.delivery_window || undefined) : undefined,
            delivery_window_remark: contractType === 'CIF' && totalQuantity > 0 ? (entry.delivery_window_remark || undefined) : undefined,
          }))
        }
      }

      await Promise.all(createPromises)
      
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

  if (!quarterlyPlans || quarterlyPlans.length === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="error" sx={{ mb: 2 }}>
          Please create quarterly plan(s) first
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h6">
          Monthly Plan
        </Typography>
        {isMultiProduct && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {products.map((p: any) => (
              <Chip
                key={p.name}
                label={p.name}
                size="small"
                sx={{ bgcolor: '#DBEAFE', color: '#1D4ED8' }}
              />
            ))}
          </Box>
        )}
      </Box>
      
      {/* Quarterly Plan Summary */}
      <Box sx={{ mb: 2, p: 1.5, bgcolor: 'info.light', borderRadius: 1 }}>
        <Typography variant="body2" fontWeight="bold" gutterBottom sx={{ color: '#000000' }}>
          Quarterly Plan Quantities:
        </Typography>
        {products.map((product: any) => (
          <Box key={product.name} sx={{ mb: 1 }}>
            {isMultiProduct && (
              <Typography variant="body2" fontWeight="bold" sx={{ color: '#1D4ED8' }}>
                {product.name}:
              </Typography>
            )}
            <Typography variant="body2" sx={{ color: '#000000', pl: isMultiProduct ? 1 : 0 }}>
              {quarterOrder.map((q, idx) => {
                const quarterLabel = QUARTER_MONTHS[q].labels.join('-')
                const qty = getQuarterlyQuantity(product.name, idx)
                const entered = getTotalEntered(q, product.name)
                const isComplete = entered === qty
                return (
                  <span key={q} style={{ color: isComplete ? '#16a34a' : undefined }}>
                    {q} ({quarterLabel}): {entered.toLocaleString()}/{qty.toLocaleString()} KT
                    {isComplete && ' ✓'}
                    {idx < quarterOrder.length - 1 ? ' | ' : ''}
                  </span>
                )
              })}
            </Typography>
          </Box>
        ))}
      </Box>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {quarterOrder.map((quarter, quarterIndex) => {
          const quarterMonths = getQuarterMonths(quarter)
          if (quarterMonths.length === 0) return null
          
          return (
            <Box key={quarter}>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Contract Quarter {quarterIndex + 1} ({quarter} - {QUARTER_MONTHS[quarter].labels.join('-')})
                </Typography>
                {/* Product-wise summary for this quarter */}
                {products.map((product: any) => {
                  const quarterlyQuantity = getQuarterlyQuantity(product.name, quarterIndex)
                  const totalEntered = getTotalEntered(quarter, product.name)
                  const remaining = quarterlyQuantity - totalEntered
                  const isComplete = remaining === 0
                  
                  return (
                    <Typography 
                      key={product.name} 
                      variant="body2" 
                      sx={{ 
                        color: isComplete ? 'success.main' : 'text.secondary',
                        mb: 0.5
                      }}
                    >
                      {isMultiProduct && <strong>{product.name}: </strong>}
                      Total: {quarterlyQuantity.toLocaleString()} KT | 
                      Entered: {totalEntered.toLocaleString()} KT | 
                      Remaining: {remaining.toLocaleString()} KT
                      {isComplete && ' ✓'}
                    </Typography>
                  )
                })}
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
                          const showCifWindows = contractType === 'CIF' && quantity > 0
                          const status = entry.id ? planStatuses[entry.id] : null
                          const isLocked = status?.is_locked || false
                          const hasCargos = status?.has_cargos || false
                          
                          return (
                            <Box 
                              key={entryIndex} 
                              sx={{ 
                                mb: entries.length > 1 ? 2 : 0,
                                p: isMultiProduct ? 1.5 : 0,
                                bgcolor: entry.is_combi ? '#FEF3C7' : (isMultiProduct ? '#FAFBFC' : 'transparent'),
                                border: entry.is_combi ? '2px solid #F59E0B' : (isMultiProduct ? '1px solid #E5E7EB' : 'none'),
                                borderRadius: 1,
                              }}
                            >
                              {/* Combi Cargo option - only for multi-product contracts and new entries */}
                              {isMultiProduct && !entry.id && (
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      checked={entry.is_combi}
                                      onChange={(e) => handleCombiChange(month, year, entryIndex, e.target.checked)}
                                      disabled={isLocked}
                                      size="small"
                                    />
                                  }
                                  label={
                                    <Typography variant="body2" sx={{ fontWeight: entry.is_combi ? 600 : 400, color: entry.is_combi ? '#B45309' : 'inherit' }}>
                                      Combi Cargo (multiple products in one vessel)
                                    </Typography>
                                  }
                                  sx={{ mb: 1 }}
                                />
                              )}
                              
                              {/* Show combi badge for existing combi entries */}
                              {entry.is_combi && entry.id && (
                                <Chip 
                                  label="Combi Cargo"
                                  size="small" 
                                  sx={{ mb: 1, bgcolor: '#F59E0B', color: 'white' }} 
                                />
                              )}
                              
                              {/* Product selection - only for multi-product contracts and non-combi entries */}
                              {isMultiProduct && !entry.is_combi && !entry.id && (
                                <FormControl fullWidth size="small" sx={{ mb: 1 }} disabled={isLocked}>
                                  <InputLabel>Product</InputLabel>
                                  <Select
                                    value={entry.product_name}
                                    label="Product"
                                    onChange={(e) => handleProductChange(month, year, entryIndex, e.target.value)}
                                  >
                                    {products.map((p: any) => (
                                      <MenuItem key={p.name} value={p.name}>
                                        {p.name}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              )}
                              
                              {/* Show product name for existing non-combi entries in multi-product contracts */}
                              {isMultiProduct && !entry.is_combi && entry.id && (
                                <Chip 
                                  label={entry.product_name}
                                  size="small" 
                                  sx={{ mb: 1, bgcolor: '#DBEAFE', color: '#1D4ED8' }} 
                                />
                              )}
                              
                              {/* Combi cargo: individual quantity inputs for each product (both new and existing) */}
                              {entry.is_combi && (
                                <Box sx={{ mb: 1.5 }}>
                                  {products.map((p: any) => (
                                    <TextField
                                      key={p.name}
                                      label={`${p.name} (KT)`}
                                      type="number"
                                      size="small"
                                      value={entry.combi_quantities[p.name] || ''}
                                      onChange={(e) => handleCombiQuantityChange(month, year, entryIndex, p.name, e.target.value)}
                                      fullWidth
                                      disabled={isLocked || hasCargos}
                                      sx={{ mb: 0.5 }}
                                    />
                                  ))}
                                  {parseFloat(entry.quantity || '0') > 0 && (
                                    <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600, color: '#B45309' }}>
                                      Total: {parseFloat(entry.quantity).toLocaleString()} KT
                                    </Typography>
                                  )}
                                </Box>
                              )}
                              
                              {/* Single quantity input - for single product contracts OR multi-product non-combi */}
                              {!entry.is_combi && (
                                <TextField
                                  label={!isMultiProduct 
                                    ? `${getMonthName(month)} ${year}${entries.length > 1 ? ` (${entryIndex + 1})` : ''}`
                                    : 'Quantity (KT)'
                                  }
                                  type="number"
                                  value={entry.quantity}
                                  onChange={(e) => handleQuantityChange(month, year, entryIndex, e.target.value)}
                                  required
                                  fullWidth
                                  disabled={isLocked}
                                  helperText={
                                    entry.id 
                                      ? `${isLocked ? '(Locked)' : hasCargos ? '(Has cargos)' : ''}`
                                      : ''
                                  }
                                  InputProps={{
                                    endAdornment: (
                                      <InputAdornment position="end">
                                        {entries.length > 1 && !isLocked && !hasCargos && (
                                          <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() => handleRemoveEntry(month, year, entryIndex)}
                                            edge="end"
                                          >
                                            <Delete fontSize="small" />
                                          </IconButton>
                                        )}
                                      </InputAdornment>
                                    ),
                                  }}
                                />
                              )}
                              
                              {/* Delete button for combi entries */}
                              {entry.is_combi && !entry.id && entries.length > 1 && (
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleRemoveEntry(month, year, entryIndex)}
                                  >
                                    <Delete fontSize="small" />
                                  </IconButton>
                                </Box>
                              )}
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
                                      '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                      '& .MuiInputBase-input': { padding: '6px 8px' },
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
                                      '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                      '& .MuiInputBase-input': { padding: '6px 8px' },
                                    }}
                                  />
                                  <TextField
                                    label="Remark"
                                    size="small"
                                    value={entry.laycan_2_days_remark}
                                    onChange={(e) => handleLaycanChange(month, year, entryIndex, 'laycan_2_days_remark', e.target.value)}
                                    placeholder="Add remark..."
                                    fullWidth
                                    disabled={isLocked}
                                    multiline
                                    minRows={2}
                                  />
                                </Box>
                              )}
                              {showCifWindows && (
                                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <TextField
                                      label="Loading Month"
                                      size="small"
                                      value={entry.loading_month}
                                      onChange={(e) => handleLaycanChange(month, year, entryIndex, 'loading_month', e.target.value)}
                                      placeholder="e.g., Aug"
                                      disabled={isLocked}
                                      sx={{
                                        width: 140,
                                        '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                        '& .MuiInputBase-input': { padding: '6px 8px' },
                                      }}
                                    />
                                    <TextField
                                      label="Loading Window"
                                      size="small"
                                      value={entry.loading_window}
                                      onChange={(e) => handleLaycanChange(month, year, entryIndex, 'loading_window', e.target.value)}
                                      placeholder="User Entry"
                                      fullWidth
                                      disabled={isLocked}
                                      sx={{
                                        '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                        '& .MuiInputBase-input': { padding: '6px 8px' },
                                      }}
                                    />
                                  </Box>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <TextField
                                      label="Delivery Month"
                                      size="small"
                                      value={entry.delivery_month}
                                      onChange={(e) => handleLaycanChange(month, year, entryIndex, 'delivery_month', e.target.value)}
                                      placeholder="e.g., Sep"
                                      disabled={isLocked}
                                      sx={{
                                        width: 140,
                                        '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                        '& .MuiInputBase-input': { padding: '6px 8px' },
                                      }}
                                    />
                                    <TextField
                                      label="Delivery Window"
                                      size="small"
                                      value={entry.delivery_window}
                                      onChange={(e) => handleLaycanChange(month, year, entryIndex, 'delivery_window', e.target.value)}
                                      placeholder="User Entry"
                                      fullWidth
                                      disabled={isLocked}
                                      sx={{
                                        '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                        '& .MuiInputBase-input': { padding: '6px 8px' },
                                      }}
                                    />
                                  </Box>
                                  <TextField
                                    label="Remark"
                                    size="small"
                                    value={entry.delivery_window_remark}
                                    onChange={(e) => handleLaycanChange(month, year, entryIndex, 'delivery_window_remark', e.target.value)}
                                    placeholder="Add remark..."
                                    fullWidth
                                    disabled={isLocked}
                                    multiline
                                    minRows={2}
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
