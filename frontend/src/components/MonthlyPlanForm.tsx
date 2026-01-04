import { useState, useEffect, useRef, useCallback } from 'react'
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  ListItemIcon,
  ListItemText,
  Tabs,
  Tab,
} from '@mui/material'
import { Save, Add, Delete, Lock, MoreVert, ArrowForward, ArrowBack, TrendingUp, CalendarMonth, History, ViewModule, ViewList } from '@mui/icons-material'
import { ToggleButton, ToggleButtonGroup } from '@mui/material'
import { monthlyPlanAPI, contractAPI, cargoAPI, MonthlyPlanTopUpRequest } from '../api/client'
import { MonthlyPlanStatus } from '../types'
import { usePresence, PresenceUser } from '../hooks/usePresence'
import { EditingWarningBanner, ActiveUsersIndicator } from './Presence'
import { VersionHistoryDialog } from './VersionHistory'
import { CIF_ROUTES, calculateDeliveryWindow, calculateETA } from '../utils/voyageDuration'
import { BADGE_COLORS, getProductColor } from '../utils/chipColors'

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
  isSpotContract?: boolean  // If true, this is a SPOT contract (skip quarterly plan)
  isRangeContract?: boolean  // If true, this is a Range contract with min/max quantities (skip quarterly plan)
}

const QUARTER_MONTHS: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', { months: number[], labels: string[] }> = {
  Q1: { months: [1, 2, 3], labels: ['January', 'February', 'March'] },
  Q2: { months: [4, 5, 6], labels: ['April', 'May', 'June'] },
  Q3: { months: [7, 8, 9], labels: ['July', 'August', 'September'] },
  Q4: { months: [10, 11, 12], labels: ['October', 'November', 'December'] },
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Get month name from number
const getMonthName = (month: number): string => {
  const date = new Date(2000, month - 1, 1)
  return date.toLocaleString('default', { month: 'long' })
}

// Generate delivery month options for CIF contracts
// Shows months AFTER the loading month (delivery cannot be same month as loading)
// Typically shows next 3 months after loading month
const getDeliveryMonthOptions = (loadingMonth: number, loadingYear: number): Array<{ value: string, label: string }> => {
  const options: Array<{ value: string, label: string }> = []
  
  // Generate options for 3 months AFTER loading month (i starts at 1, not 0)
  // Delivery is always after loading, so skip the loading month itself
  for (let i = 1; i <= 3; i++) {
    const date = new Date(loadingYear, loadingMonth - 1 + i, 1)
    const month = date.getMonth() + 1
    const year = date.getFullYear()
    const monthName = MONTH_NAMES[month - 1]
    options.push({
      value: `${monthName} ${year}`,
      label: `${monthName} ${year}`
    })
  }
  
  return options
}

// Round quantity to avoid floating-point precision issues
// Rounds to 3 decimal places which is sufficient for KT measurements
const roundQuantity = (qty: number | string | undefined | null): string => {
  if (qty === undefined || qty === null || qty === '') return ''
  const num = typeof qty === 'string' ? parseFloat(qty) : qty
  if (isNaN(num)) return ''
  // Round to 3 decimal places to avoid floating-point issues
  return Math.round(num * 1000) / 1000 + ''
}

// Get the loading month option for a specific month/year (single option dropdown)
const getLoadingMonthOption = (loadingMonth: number, loadingYear: number): { value: string, label: string } => {
  const monthName = MONTH_NAMES[loadingMonth - 1]
  return {
    value: `${monthName} ${loadingYear}`,
    label: `${monthName} ${loadingYear}`
  }
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
// For CIF contracts, include one month BEFORE contract start (for loadings that deliver in first month)
const getContractMonths = (startPeriod: string, endPeriod: string, isCIF: boolean = false): Array<{ month: number, year: number }> => {
  const start = new Date(startPeriod)
  const end = new Date(endPeriod)
  const months: Array<{ month: number, year: number }> = []
  
  // For CIF contracts, start one month earlier to allow pre-contract loadings
  const current = new Date(start)
  if (isCIF) {
    current.setMonth(current.getMonth() - 1)
  }
  
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
  quarterly_plan_id: number | null  // Can be null for SPOT/Range contracts
  product_name: string  // Product name for this entry
  quantity: string
  laycan_5_days: string
  laycan_2_days: string
  laycan_2_days_remark: string
  loading_month: string
  loading_window: string
  cif_route: string  // SUEZ or CAPE - for delivery window calculation
  delivery_month: string
  delivery_window: string
  delivery_window_remark: string
  // Combi cargo fields
  is_combi: boolean
  combi_group_id?: string
  combi_quantities: Record<string, string>  // For combi entries - quantity per product (e.g., { "GASOIL": "45", "JET A-1": "10" })
  _combi_plan_ids?: number[]  // For existing combi entries - all plan IDs in the group
  _combi_product_plan_map?: Record<string, number>  // Map of product name to plan ID for combi entries
  // Authority top-up tracking
  authority_topup_quantity?: number  // Top-up quantity in KT
  authority_topup_reference?: string  // Reference number
  // Optimistic locking
  version?: number
}

export default function MonthlyPlanForm({ contractId, contract: propContract, quarterlyPlans, onPlanCreated, isSpotContract = false, isRangeContract = false }: MonthlyPlanFormProps) {
  const [monthEntries, setMonthEntries] = useState<Record<string, MonthlyPlanEntry[]>>({})
  const [existingMonthlyPlans, setExistingMonthlyPlans] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [contractType, setContractType] = useState<'FOB' | 'CIF' | null>(null)
  const [contract, setContract] = useState<any>(propContract)
  const [quarterOrder, setQuarterOrder] = useState<('Q1' | 'Q2' | 'Q3' | 'Q4')[]>([])
  const [contractMonths, setContractMonths] = useState<Array<{ month: number, year: number }>>([])
  const [planStatuses, setPlanStatuses] = useState<Record<number, MonthlyPlanStatus>>({})
  const autosaveTimersRef = useRef<Record<string, number>>({})
  const [editingUser, setEditingUser] = useState<{ user: PresenceUser; field: string } | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  
  // Real-time presence tracking for this contract's monthly plan
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
    'contract-monthly-plans',  // Use contract-specific resource type since we're editing monthly plans for a contract
    contractId.toString(),
    {
      onDataChanged: handleDataChanged,
      onUserEditing: handleUserEditing,
      onUserStoppedEditing: () => setEditingUser(null),
    }
  )
  
  // Notify when user stops editing (on blur)
  const handleFieldBlur = () => {
    notifyStoppedEditing()
  }
  
  // Year tab state for multi-year contracts
  const [selectedYear, setSelectedYear] = useState(1)
  
  // Calculate number of contract years and filter quarterly plans by year
  const getContractYears = (): number => {
    if (!contract?.start_period || !contract?.end_period) return 1
    const start = new Date(contract.start_period)
    const end = new Date(contract.end_period)
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
    return Math.max(1, Math.ceil(months / 12))
  }
  const numContractYears = getContractYears()
  
  // Filter quarterly plans for selected year
  const yearQuarterlyPlans = quarterlyPlans.filter(qp => (qp.contract_year || 1) === selectedYear)
  
  // Get year label for tabs
  const getYearLabel = (contractYear: number): string => {
    if (!contract?.start_period) return `Year ${contractYear}`
    const startYear = new Date(contract.start_period).getFullYear()
    const calendarYear = startYear + (contractYear - 1)
    return `Year ${contractYear} (${calendarYear})`
  }
  
  // Filter contract months for the selected contract year
  // A contract year runs from fiscal_start_month for 12 months
  // Example: Feb start -> Year 1 = Feb 2026 to Jan 2027, Year 2 = Feb 2027 to Jan 2028
  // For CIF contracts in Year 1, also include the pre-month (month before contract start)
  const getYearContractMonths = (): Array<{ month: number, year: number }> => {
    if (!contract?.start_period || contractMonths.length === 0) return contractMonths
    
    const fiscalStartMonth = contract.fiscal_start_month || new Date(contract.start_period).getMonth() + 1
    const contractStartYear = new Date(contract.start_period).getFullYear()
    
    // For the selected contract year, calculate which 12 calendar months it covers
    // Year 1 starts at contract start, Year 2 starts 12 months later, etc.
    const baseYear = contractStartYear + (selectedYear - 1)
    
    // Generate the 12 months for this contract year
    const yearMonths: Array<{ month: number, year: number }> = []
    for (let i = 0; i < 12; i++) {
      let month = fiscalStartMonth + i
      let year = baseYear
      if (month > 12) {
        month -= 12
        year += 1
      }
      yearMonths.push({ month, year })
    }
    
    // For CIF contracts in Year 1, also include the pre-month (for loadings that deliver in first month)
    if (contractType === 'CIF' && selectedYear === 1) {
      let preMonth = fiscalStartMonth - 1
      let preYear = baseYear
      if (preMonth < 1) {
        preMonth = 12
        preYear -= 1
      }
      yearMonths.unshift({ month: preMonth, year: preYear })
    }
    
    // Filter contractMonths to only include months that are in this contract year
    return contractMonths.filter(cm => {
      return yearMonths.some(ym => ym.month === cm.month && ym.year === cm.year)
    })
  }
  
  const yearContractMonths = getYearContractMonths()
  
  // Move dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [moveAction, setMoveAction] = useState<'DEFER' | 'ADVANCE' | null>(null)
  const [moveEntryData, setMoveEntryData] = useState<{ month: number; year: number; entryIndex: number; entry: MonthlyPlanEntry } | null>(null)
  const [moveTargetMonth, setMoveTargetMonth] = useState<number>(1)
  const [moveTargetYear, setMoveTargetYear] = useState<number>(new Date().getFullYear())
  const [moveReason, setMoveReason] = useState('')
  const [isMoving, setIsMoving] = useState(false)
  
  // Action menu state
  const [actionMenuAnchor, setActionMenuAnchor] = useState<null | HTMLElement>(null)
  const [actionMenuEntry, setActionMenuEntry] = useState<{ month: number; year: number; entryIndex: number; entry: MonthlyPlanEntry; hasCargos: boolean } | null>(null)
  
  // Version History dialog state
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [historyEntryId, setHistoryEntryId] = useState<number | null>(null)
  
  // Top-Up dialog state
  const [topupDialogOpen, setTopupDialogOpen] = useState(false)
  const [topupEntry, setTopupEntry] = useState<{ month: number; year: number; entry: MonthlyPlanEntry } | null>(null)
  const [topupForm, setTopupForm] = useState({
    quantity: '',
    authority_reference: '',
    reason: '',
    date: new Date().toISOString().split('T')[0],
    selected_product: '',  // For combie cargos - which product the top-up is for
  })
  const [isAddingTopup, setIsAddingTopup] = useState(false)

  // Get product list from contract
  const products = contract?.products ? (Array.isArray(contract.products) ? contract.products : JSON.parse(contract.products)) : []
  const isMultiProduct = products.length > 1
  
  // Use prop or derive from products if not provided
  const skipQuarterlyPlan = isSpotContract || isRangeContract

  // Map product names to their quarterly plans for the selected year
  const productQuarterlyPlanMap = new Map<string, any>()
  yearQuarterlyPlans.forEach(qp => {
    if (qp.product_name) {
      productQuarterlyPlanMap.set(qp.product_name, qp)
    }
  })
  // For single product contracts, map the first product to the first quarterly plan
  if (!isMultiProduct && products.length === 1 && yearQuarterlyPlans.length > 0) {
    productQuarterlyPlanMap.set(products[0].name, yearQuarterlyPlans[0])
  }

  // Pending changes accumulator - batches multiple field changes into one save
  // Using a module-level variable to avoid React Strict Mode issues with refs
  const pendingChangesRef = useRef<Record<number, { data: any; version?: number; monthKey?: string; entryIndex?: number }>>({})
  
  const scheduleAutosave = useCallback((planId: number, data: any, _keySuffix: string, version?: number, monthKey?: string, entryIndex?: number) => {
    // Use a single timer key per plan to batch all changes together
    const key = `plan:${planId}`
    
    // Accumulate changes for this plan - merge with existing pending changes
    const existing = pendingChangesRef.current[planId] || { data: {} }
    const newData = { ...existing.data, ...data }
    
    pendingChangesRef.current[planId] = {
      data: newData,
      version: version ?? existing.version,
      monthKey: monthKey ?? existing.monthKey,
      entryIndex: entryIndex !== undefined ? entryIndex : existing.entryIndex,
    }
    
    console.log(`[Autosave] Accumulated changes for plan ${planId}:`, Object.keys(newData))
    
    // Clear existing timer for this plan
    const existingTimer = autosaveTimersRef.current[key]
    if (existingTimer) {
      console.log(`[Autosave] Clearing existing timer for plan ${planId}`)
      window.clearTimeout(existingTimer)
      delete autosaveTimersRef.current[key]
    }
    
    // Set new timer - will save all accumulated changes after 1200ms of no activity
    autosaveTimersRef.current[key] = window.setTimeout(async () => {
      const pending = pendingChangesRef.current[planId]
      if (!pending || Object.keys(pending.data).length === 0) return
      
      // Clear pending changes before saving
      delete pendingChangesRef.current[planId]
      delete autosaveTimersRef.current[key]
      
      console.log(`[Autosave] Saving batched changes for plan ${planId}:`, Object.keys(pending.data))
      
      try {
        // Include version for optimistic locking
        const updateData = { ...pending.data, version: pending.version || 1 }
        const result = await monthlyPlanAPI.update(planId, updateData)
        
        // Update local state with new version to prevent conflicts on subsequent saves
        if (pending.monthKey !== undefined && pending.entryIndex !== undefined && result.data?.version) {
          setMonthEntries(prev => {
            const entries = [...(prev[pending.monthKey!] || [])]
            if (entries[pending.entryIndex!]) {
              entries[pending.entryIndex!] = { ...entries[pending.entryIndex!], version: result.data.version }
            }
            return { ...prev, [pending.monthKey!]: entries }
          })
          // Also update existingMonthlyPlans
          setExistingMonthlyPlans(prev => prev.map(p => 
            p.id === planId ? { ...p, version: result.data.version } : p
          ))
        }
      } catch (error) {
        console.error('Error autosaving monthly plan field:', error)
      }
    }, 120000)  // 120 second (2 min) delay to allow batching multiple field changes
  }, [])

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
        
        const isCIF = propContract.contract_type === 'CIF'
        const months = getContractMonths(propContract.start_period, propContract.end_period, isCIF)
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
          
          const isCIF = contractData.contract_type === 'CIF'
          const months = getContractMonths(contractData.start_period, contractData.end_period, isCIF)
          setContractMonths(months)
        } catch (error) {
          console.error('Error loading contract:', error)
        }
      }
    }
    loadContract()
  }, [propContract, contractId])

  useEffect(() => {
    const loadExistingMonthlyPlans = async () => {
      // For SPOT/Range contracts, load by contract_id; for term contracts, load by quarterly plans
      if (skipQuarterlyPlan) {
        if (!contractId) return
        
        try {
          const monthlyRes = await monthlyPlanAPI.getByContractId(contractId)
          console.log('Loaded SPOT monthly plans for contract', contractId, ':', monthlyRes.data)
          const allPlans = (monthlyRes.data || []).map((p: any) => ({
            ...p,
            product_name: p.product_name || products[0]?.name || 'Unknown'
          }))
          console.log('All loaded SPOT plans:', allPlans.map((p: any) => ({ id: p.id, month: p.month, year: p.year, product: p.product_name })))
          setExistingMonthlyPlans(allPlans)
          
          // Load status for all plans
          const statusMap: Record<number, MonthlyPlanStatus> = {}
          const planIds = allPlans.map((p: any) => p.id).filter((id: number) => id != null)
          
          if (planIds.length > 0) {
            try {
              const bulkStatusRes = await monthlyPlanAPI.getStatusBulk(planIds)
              for (const status of bulkStatusRes.data || []) {
                statusMap[status.monthly_plan_id] = status
              }
            } catch (error) {
              console.error('Error fetching bulk status:', error)
            }
            
            for (const plan of allPlans) {
              if (!statusMap[plan.id]) {
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
          }
          setPlanStatuses(statusMap)
          
          // Group plans by combi_group_id first (same as term contracts)
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
            const combiProductPlanMap: Record<string, number> = {}
            combiPlans.forEach((plan: any) => {
              combiQuantities[plan.product_name] = roundQuantity(plan.month_quantity)
              combiPlanIds.push(plan.id)
              combiProductPlanMap[plan.product_name] = plan.id
            })
            
            // Calculate total quantity
            const totalQuantity = combiPlans.reduce((sum: number, p: any) => sum + p.month_quantity, 0)
            
            // Calculate total top-up for combi entries
            const totalTopup = combiPlans.reduce((sum: number, p: any) => sum + (p.authority_topup_quantity || 0), 0)
            
            console.log('Creating Range/SPOT combi entry with id:', firstPlan.id, 'combi_group_id:', combiGroupId)
            entries[key].push({
              id: firstPlan.id,  // Use first plan's ID as reference
              quarterly_plan_id: null,
              product_name: '',  // Combi entries don't have a single product
              quantity: roundQuantity(totalQuantity),
              laycan_5_days: firstPlan.laycan_5_days || '',
              laycan_2_days: firstPlan.laycan_2_days || '',
              laycan_2_days_remark: firstPlan.laycan_2_days_remark || '',
              loading_month: firstPlan.loading_month || '',
              loading_window: firstPlan.loading_window || '',
              cif_route: firstPlan.cif_route || '',
              delivery_month: firstPlan.delivery_month || '',
              delivery_window: firstPlan.delivery_window || '',
              delivery_window_remark: firstPlan.delivery_window_remark || '',
              is_combi: true,
              combi_group_id: combiGroupId,
              combi_quantities: combiQuantities,
              // Store all plan IDs for updates/deletes
              _combi_plan_ids: combiPlanIds,
              _combi_product_plan_map: combiProductPlanMap,
              authority_topup_quantity: totalTopup,
              authority_topup_reference: firstPlan.authority_topup_reference || '',
              version: firstPlan.version || 1,
            } as MonthlyPlanEntry & { _combi_plan_ids?: number[]; _combi_product_plan_map?: Record<string, number> })
          })
          
          // Process non-combi plans individually
          nonCombiPlans.forEach((plan: any) => {
            const key = `${plan.month}-${plan.year}`
            if (!entries[key]) {
              entries[key] = []
            }
            console.log('Creating Range/SPOT non-combi entry with id:', plan.id, 'from plan:', plan)
            entries[key].push({
              id: plan.id,
              quarterly_plan_id: null,
              product_name: plan.product_name,
              quantity: roundQuantity(plan.month_quantity),
              laycan_5_days: plan.laycan_5_days || '',
              laycan_2_days: plan.laycan_2_days || '',
              laycan_2_days_remark: plan.laycan_2_days_remark || '',
              loading_month: plan.loading_month || '',
              loading_window: plan.loading_window || '',
              cif_route: plan.cif_route || '',
              delivery_month: plan.delivery_month || '',
              delivery_window: plan.delivery_window || '',
              delivery_window_remark: plan.delivery_window_remark || '',
              is_combi: false,
              combi_group_id: undefined,
              combi_quantities: {},
              authority_topup_quantity: plan.authority_topup_quantity || 0,
              authority_topup_reference: plan.authority_topup_reference || '',
              version: plan.version || 1,
            })
          })
          
          setMonthEntries(entries)
        } catch (error) {
          console.error('Error loading Range/SPOT monthly plans:', error)
        }
        return
      }
      
      // Term contracts - load from quarterly plans
      if (!quarterlyPlans || quarterlyPlans.length === 0) return
      
      try {
        // Load monthly plans from all quarterly plans
        const allPlans: any[] = []
        for (const qp of quarterlyPlans) {
          const monthlyRes = await monthlyPlanAPI.getAll(qp.id)
          console.log('Loaded monthly plans for QP', qp.id, ':', monthlyRes.data)
          const plans = (monthlyRes.data || []).map((p: any) => ({
            ...p,
            product_name: qp.product_name || products[0]?.name || 'Unknown'
          }))
          allPlans.push(...plans)
        }
        console.log('All loaded plans:', allPlans.map(p => ({ id: p.id, month: p.month, year: p.year, product: p.product_name })))
        setExistingMonthlyPlans(allPlans)
        
        // Load status for all plans in a single bulk request (optimization)
        const statusMap: Record<number, MonthlyPlanStatus> = {}
        const planIds = allPlans.map(p => p.id).filter(id => id != null)
        
        if (planIds.length > 0) {
          try {
            const bulkStatusRes = await monthlyPlanAPI.getStatusBulk(planIds)
            // Map the results by plan ID
            for (const status of bulkStatusRes.data || []) {
              statusMap[status.monthly_plan_id] = status
            }
          } catch (error) {
            console.error('Error fetching bulk status:', error)
          }
          
          // Fill in defaults for any plans that didn't get status
          for (const plan of allPlans) {
            if (!statusMap[plan.id]) {
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
          const combiProductPlanMap: Record<string, number> = {}
          combiPlans.forEach((plan: any) => {
            combiQuantities[plan.product_name] = roundQuantity(plan.month_quantity)
            combiPlanIds.push(plan.id)
            combiProductPlanMap[plan.product_name] = plan.id
          })
          
          // Calculate total quantity
          const totalQuantity = combiPlans.reduce((sum: number, p: any) => sum + p.month_quantity, 0)
          
          // Calculate total top-up for combi entries
          const totalTopup = combiPlans.reduce((sum: number, p: any) => sum + (p.authority_topup_quantity || 0), 0)
          
          console.log('Creating combi entry with id:', firstPlan.id, 'from firstPlan:', firstPlan)
          entries[key].push({
            id: firstPlan.id,  // Use first plan's ID as reference
            quarterly_plan_id: firstPlan.quarterly_plan_id,
            product_name: '',  // Combi entries don't have a single product
            quantity: roundQuantity(totalQuantity),
            laycan_5_days: firstPlan.laycan_5_days || '',
            laycan_2_days: firstPlan.laycan_2_days || '',
            laycan_2_days_remark: firstPlan.laycan_2_days_remark || '',
            loading_month: firstPlan.loading_month || '',
            loading_window: firstPlan.loading_window || '',
            cif_route: firstPlan.cif_route || '',
            delivery_month: firstPlan.delivery_month || '',
            delivery_window: firstPlan.delivery_window || '',
            delivery_window_remark: firstPlan.delivery_window_remark || '',
            is_combi: true,
            combi_group_id: combiGroupId,
            combi_quantities: combiQuantities,
            // Store all plan IDs for updates/deletes
            _combi_plan_ids: combiPlanIds,
            _combi_product_plan_map: combiProductPlanMap,
            authority_topup_quantity: totalTopup,
            authority_topup_reference: firstPlan.authority_topup_reference || '',
            version: firstPlan.version || 1,
          } as MonthlyPlanEntry & { _combi_plan_ids?: number[]; _combi_product_plan_map?: Record<string, number> })
        })
        
        // Process non-combi plans individually
        nonCombiPlans.forEach((plan: any) => {
          const key = `${plan.month}-${plan.year}`
          if (!entries[key]) {
            entries[key] = []
          }
          console.log('Creating non-combi entry with id:', plan.id, 'from plan:', plan)
          entries[key].push({
            id: plan.id,
            quarterly_plan_id: plan.quarterly_plan_id,
            product_name: plan.product_name,
            quantity: roundQuantity(plan.month_quantity),
            laycan_5_days: plan.laycan_5_days || '',
            laycan_2_days: plan.laycan_2_days || '',
            laycan_2_days_remark: plan.laycan_2_days_remark || '',
            loading_month: plan.loading_month || '',
            loading_window: plan.loading_window || '',
            cif_route: plan.cif_route || '',
            delivery_month: plan.delivery_month || '',
            delivery_window: plan.delivery_window || '',
            delivery_window_remark: plan.delivery_window_remark || '',
            is_combi: false,
            combi_group_id: undefined,
            combi_quantities: {},
            authority_topup_quantity: plan.authority_topup_quantity || 0,
            authority_topup_reference: plan.authority_topup_reference || '',
            version: plan.version || 1,
          })
        })
        
        setMonthEntries(entries)
      } catch (error) {
        console.error('Error loading existing monthly plans:', error)
      }
    }
    
    loadExistingMonthlyPlans()
  }, [quarterlyPlans, products, skipQuarterlyPlan, contractId])

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
    field: 'laycan_5_days' | 'laycan_2_days' | 'laycan_2_days_remark' | 'loading_month' | 'loading_window' | 'cif_route' | 'delivery_month' | 'delivery_window' | 'delivery_window_remark',
    value: string
  ) => {
    // Notify others that we're editing this field
    const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    notifyEditing(`${getMonthName(month)} ${year} ${fieldLabel}`)
    
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    const updatedEntries = [...entries]
    const currentEntry = updatedEntries[entryIndex]
    
    // Update the field
    updatedEntries[entryIndex] = {
      ...currentEntry,
      [field]: value,
    }
    
    // Auto-calculate delivery window when loading_window or cif_route changes for CIF contracts
    if (contractType === 'CIF' && (field === 'loading_window' || field === 'cif_route')) {
      const loadingWindow = field === 'loading_window' ? value : currentEntry.loading_window
      const route = field === 'cif_route' ? value : currentEntry.cif_route
      const destination = contract?.cif_destination
      
      if (loadingWindow && route && destination) {
        const calculatedDeliveryWindow = calculateDeliveryWindow(loadingWindow, destination, route, month, year)
        if (calculatedDeliveryWindow) {
          updatedEntries[entryIndex].delivery_window = calculatedDeliveryWindow
        }
      }
    }
    
    setMonthEntries({
      ...monthEntries,
      [key]: updatedEntries,
    })

    const planId = updatedEntries[entryIndex]?.id
    const version = updatedEntries[entryIndex]?.version
    
    // Build update payload - include delivery_window if it was auto-calculated
    const updatePayload: Record<string, string> = { [field]: value }
    if (contractType === 'CIF' && (field === 'loading_window' || field === 'cif_route')) {
      if (updatedEntries[entryIndex].delivery_window !== currentEntry.delivery_window) {
        updatePayload.delivery_window = updatedEntries[entryIndex].delivery_window
      }
    }
    
    // Autosave all laycan and delivery fields for existing plans
    if (planId) {
      scheduleAutosave(planId, updatePayload, field, version, key, entryIndex)
    }
  }

  const handleQuantityChange = (month: number, year: number, entryIndex: number, value: string) => {
    // Notify others that we're editing this field
    notifyEditing(`${getMonthName(month)} ${year} quantity`)
    
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
    // For SPOT contracts, there's no quarterly plan - use 0
    const defaultQp = skipQuarterlyPlan ? null : productQuarterlyPlanMap.get(defaultProduct)
    
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
        cif_route: '',
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

  const handleRemoveEntry = async (month: number, year: number, entryIndex: number) => {
    const key = `${month}-${year}`
    const entries = monthEntries[key] || []
    const entry = entries[entryIndex]
    
    // Check if this entry has cargos that need to be deleted first
    if (entry?.id) {
      const status = planStatuses[entry.id]
      if (status?.has_cargos && status.cargo_ids && status.cargo_ids.length > 0) {
        // Ask for confirmation to delete cargos
        const confirmed = window.confirm(
          `This monthly plan has ${status.cargo_ids.length} cargo(s) associated with it.\n\n` +
          `To delete this entry, the cargo(s) must be deleted first.\n\n` +
          `Do you want to delete the cargo(s) and the monthly plan entry?`
        )
        
        if (!confirmed) {
          return
        }
        
        // Delete all cargos associated with this monthly plan
        try {
          for (const cargoId of status.cargo_ids) {
            await cargoAPI.delete(cargoId)
          }
          // Update the status to reflect no cargos
          setPlanStatuses(prev => ({
            ...prev,
            [entry.id!]: {
              ...prev[entry.id!],
              has_cargos: false,
              total_cargos: 0,
              cargo_ids: []
            }
          }))
        } catch (error: any) {
          console.error('Error deleting cargos:', error)
          alert(`Failed to delete cargo(s): ${error?.response?.data?.detail || error?.message || 'Unknown error'}`)
          return
        }
      }
    }
    
    const updatedEntries = entries.filter((_, index) => index !== entryIndex)
    setMonthEntries({
      ...monthEntries,
      [key]: updatedEntries,
    })
  }

  // Action menu handlers
  const handleActionMenuOpen = (event: React.MouseEvent<HTMLElement>, month: number, year: number, entryIndex: number, entry: MonthlyPlanEntry, hasCargos: boolean) => {
    console.log('Opening action menu for entry - ID:', entry.id, 'Type:', typeof entry.id, 'Truthy:', !!entry.id, 'Has cargos:', hasCargos)
    console.log('Full entry:', JSON.stringify(entry, null, 2))
    setActionMenuAnchor(event.currentTarget)
    setActionMenuEntry({ month, year, entryIndex, entry, hasCargos })
  }

  const handleActionMenuClose = () => {
    setActionMenuAnchor(null)
    setActionMenuEntry(null)
  }

  // Move dialog handlers
  const handleOpenMoveDialog = (action: 'DEFER' | 'ADVANCE') => {
    if (!actionMenuEntry) return
    setMoveAction(action)
    setMoveEntryData(actionMenuEntry)
    // Set default target month to current + 1 for defer, current - 1 for advance
    if (action === 'DEFER') {
      const nextMonth = actionMenuEntry.month === 12 ? 1 : actionMenuEntry.month + 1
      const nextYear = actionMenuEntry.month === 12 ? actionMenuEntry.year + 1 : actionMenuEntry.year
      setMoveTargetMonth(nextMonth)
      setMoveTargetYear(nextYear)
    } else {
      const prevMonth = actionMenuEntry.month === 1 ? 12 : actionMenuEntry.month - 1
      const prevYear = actionMenuEntry.month === 1 ? actionMenuEntry.year - 1 : actionMenuEntry.year
      setMoveTargetMonth(prevMonth)
      setMoveTargetYear(prevYear)
    }
    setMoveReason('')
    setMoveDialogOpen(true)
    handleActionMenuClose()
  }

  const handleCloseMoveDialog = () => {
    setMoveDialogOpen(false)
    setMoveAction(null)
    setMoveEntryData(null)
    setMoveReason('')
  }

  const handleExecuteMove = async () => {
    if (!moveEntryData || !moveAction || !moveEntryData.entry.id) return
    
    setIsMoving(true)
    try {
      // For combi entries, we need to move all plans in the group
      const planIds = moveEntryData.entry._combi_plan_ids || [moveEntryData.entry.id]
      
      for (const planId of planIds) {
        await monthlyPlanAPI.move(planId, {
          action: moveAction,
          target_month: moveTargetMonth,
          target_year: moveTargetYear,
          reason: moveReason || undefined,
        })
      }
      
      handleCloseMoveDialog()
      onPlanCreated() // Refresh the data
    } catch (error: any) {
      console.error('Error moving monthly plan:', error)
      alert(error.response?.data?.detail || 'Failed to move cargo. Please try again.')
    } finally {
      setIsMoving(false)
    }
  }

  const getQuarterMonths = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): Array<{ month: number, year: number }> => {
    const quarterMonths = QUARTER_MONTHS[quarter].months
    
    // For CIF contracts, calculate the pre-month to handle it specially
    let preMonth = 0
    let preYear = 0
    if (contractType === 'CIF' && selectedYear === 1) {
      const fiscalStartMonth = contract?.fiscal_start_month || new Date(contract?.start_period || '').getMonth() + 1
      const contractStartYear = new Date(contract?.start_period || '').getFullYear()
      preMonth = fiscalStartMonth - 1
      preYear = contractStartYear
      if (preMonth < 1) {
        preMonth = 12
        preYear -= 1
      }
    }
    
    // Use yearContractMonths to only show months for the selected contract year
    // For CIF contracts, EXCLUDE the pre-month from its natural quarter (it will be added to the first quarter)
    const result = yearContractMonths.filter(cm => {
      // Check if this month belongs to this quarter by month number
      if (!quarterMonths.includes(cm.month)) return false
      
      // For CIF contracts, exclude the pre-month from its natural quarter
      // (it will be added to the quarter containing the first contract month instead)
      if (contractType === 'CIF' && selectedYear === 1 && cm.month === preMonth && cm.year === preYear) {
        // Check if this is NOT the quarter where the pre-month should appear
        const fiscalStartMonth = contract?.fiscal_start_month || new Date(contract?.start_period || '').getMonth() + 1
        const firstMonthInThisQuarter = quarterMonths.includes(fiscalStartMonth)
        if (!firstMonthInThisQuarter) {
          return false // Exclude pre-month from its natural quarter
        }
      }
      
      return true
    })
    
    // For CIF contracts, the pre-month (month before contract start) should appear in the quarter
    // that contains the FIRST month of the contract (since pre-month delivers to first month)
    // Example: Jan-Dec contract -> Dec pre-month goes with Q1 (Jan is in Q1)
    // Example: Jul-Jun contract -> Jun pre-month goes with Q3 (Jul is in Q3)
    if (contractType === 'CIF' && selectedYear === 1) {
      const fiscalStartMonth = contract?.fiscal_start_month || new Date(contract?.start_period || '').getMonth() + 1
      
      // Check if the first month of the contract is in THIS quarter
      const firstMonthInThisQuarter = quarterMonths.includes(fiscalStartMonth)
      
      if (firstMonthInThisQuarter && preMonth > 0) {
        // Check if pre-month exists in yearContractMonths and add it to the beginning if not already included
        const preMonthExists = result.some(cm => cm.month === preMonth && cm.year === preYear)
        if (!preMonthExists) {
          const preMonthInYear = yearContractMonths.find(cm => cm.month === preMonth && cm.year === preYear)
          if (preMonthInYear) {
            result.unshift(preMonthInYear)
          }
        }
      }
    }
    
    return result
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

  // Get quarterly top-up amount for a product and quarter position
  const getQuarterlyTopup = (productName: string, quarterPosition: number): number => {
    const qp = productQuarterlyPlanMap.get(productName)
    if (!qp) return 0
    
    const topups = [
      (qp as any).q1_topup || 0,
      (qp as any).q2_topup || 0,
      (qp as any).q3_topup || 0,
      (qp as any).q4_topup || 0,
    ]
    
    return topups[quarterPosition] || 0
  }

  // Get original quarterly quantity (total - topup)
  const getQuarterlyOriginal = (productName: string, quarterPosition: number): number => {
    return getQuarterlyQuantity(productName, quarterPosition) - getQuarterlyTopup(productName, quarterPosition)
  }

  // Parse delivery month string (e.g., "February 2025") into { month, year }
  const parseDeliveryMonth = (deliveryMonth: string): { month: number, year: number } | null => {
    if (!deliveryMonth) return null
    const parts = deliveryMonth.split(' ')
    if (parts.length !== 2) return null
    const monthIndex = MONTH_NAMES.indexOf(parts[0])
    const year = parseInt(parts[1], 10)
    if (monthIndex === -1 || isNaN(year)) return null
    return { month: monthIndex + 1, year }
  }

  // Get total entered for a quarter for a specific product
  // For FOB: uses loading month (the month the entry is in)
  // For CIF: uses delivery month (from the delivery_month field)
  const getTotalEntered = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4', productName: string): number => {
    const quarterMonths = getQuarterMonths(quarter)
    
    if (contractType === 'CIF') {
      // For CIF, sum quantities where delivery_month falls in this quarter
      let total = 0
      Object.keys(monthEntries).forEach(key => {
        const entries = monthEntries[key] || []
        entries.forEach(entry => {
          const deliveryMonthParsed = parseDeliveryMonth(entry.delivery_month)
          if (!deliveryMonthParsed) return
          
          // Check if delivery month falls in this quarter
          const isInQuarter = quarterMonths.some(qm => 
            qm.month === deliveryMonthParsed.month && qm.year === deliveryMonthParsed.year
          )
          if (!isInQuarter) return
          
          if (entry.is_combi) {
            const productQty = parseFloat(entry.combi_quantities[productName] || '0') || 0
            total += productQty
          } else if (entry.product_name === productName) {
            const qty = parseFloat(entry.quantity || '0') || 0
            total += qty
          }
        })
      })
      return total
    }
    
    // For FOB, use loading month (original logic)
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
    if (isSaving) {
      alert('Please wait...')
      return
    }
    
    // For non-SPOT/Range contracts, require quarterly plans
    if (!skipQuarterlyPlan && quarterlyPlans.length === 0) {
      alert('Please create quarterly plans first.')
      return
    }

    // For CIF contracts, validate that delivery_month is set for all entries with quantity
    if (contractType === 'CIF') {
      for (const key of Object.keys(monthEntries)) {
        const entries = monthEntries[key] || []
        for (const entry of entries) {
          const quantity = parseFloat(entry.quantity || '0')
          if (quantity > 0 && !entry.delivery_month) {
            const [month, year] = key.split('-').map(Number)
            alert(`Error: Delivery Month is required for CIF contracts. Please select a delivery month for ${getMonthName(month)} ${year}.`)
            return
          }
        }
      }
    }

    // Validate quantities for each product and quarter (skip for SPOT/Range contracts)
    if (!skipQuarterlyPlan) {
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
          } else if (!entry.is_combi && parseFloat(entry.quantity || '0') > 0) {
            // New single product entry - for SPOT contracts, quarterly_plan_id may be 0
            if (skipQuarterlyPlan || entry.quarterly_plan_id) {
              plansToCreate.push({ month, year, entry })
            }
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
            // Always send the field values (even empty string) to allow clearing
            laycan_5_days: contractType === 'FOB' ? (entry.laycan_5_days ?? null) : null,
            laycan_2_days: contractType === 'FOB' ? (entry.laycan_2_days ?? null) : null,
            laycan_2_days_remark: contractType === 'FOB' ? (entry.laycan_2_days_remark ?? null) : null,
            loading_month: contractType === 'CIF' ? (entry.loading_month ?? null) : null,
            loading_window: contractType === 'CIF' ? (entry.loading_window ?? null) : null,
            cif_route: contractType === 'CIF' ? (entry.cif_route ?? null) : null,
            delivery_month: contractType === 'CIF' ? (entry.delivery_month ?? null) : null,
            delivery_window: contractType === 'CIF' ? (entry.delivery_window ?? null) : null,
            delivery_window_remark: contractType === 'CIF' ? (entry.delivery_window_remark ?? null) : null,
            version: existingPlan.version || 1,
          }
          
          try {
            const result = await monthlyPlanAPI.update(planId, updateData)
            // Update local version after successful save
            existingPlan.version = result.data.version
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
            const qty = parseFloat(entry.quantity || '0')
            const updateData: any = {
              month_quantity: qty,
              number_of_liftings: 1,
              // Always send the field values (even empty string) to allow clearing
              laycan_5_days: contractType === 'FOB' ? (entry.laycan_5_days ?? null) : null,
              laycan_2_days: contractType === 'FOB' ? (entry.laycan_2_days ?? null) : null,
              laycan_2_days_remark: contractType === 'FOB' ? (entry.laycan_2_days_remark ?? null) : null,
              loading_month: contractType === 'CIF' ? (entry.loading_month ?? null) : null,
              loading_window: contractType === 'CIF' ? (entry.loading_window ?? null) : null,
              cif_route: contractType === 'CIF' ? (entry.cif_route ?? null) : null,
              delivery_month: contractType === 'CIF' ? (entry.delivery_month ?? null) : null,
              delivery_window: contractType === 'CIF' ? (entry.delivery_window ?? null) : null,
              delivery_window_remark: contractType === 'CIF' ? (entry.delivery_window_remark ?? null) : null,
              version: entry.version || existingPlan.version || 1,
            }
            
            try {
              const result = await monthlyPlanAPI.update(existingPlan.id, updateData)
              // Update local version after successful save
              entry.version = result.data.version
              existingPlan.version = result.data.version
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
            
            // For SPOT/Range contracts, use contract_id instead of quarterly_plan_id
            if (skipQuarterlyPlan) {
              createPromises.push(monthlyPlanAPI.create({
                contract_id: contractId,
                product_name: productName,
                month: month,
                year: year,
                month_quantity: productQty,
                number_of_liftings: 1,
                laycan_5_days: contractType === 'FOB' ? (entry.laycan_5_days || undefined) : undefined,
                laycan_2_days: contractType === 'FOB' ? (entry.laycan_2_days || undefined) : undefined,
                laycan_2_days_remark: contractType === 'FOB' ? (entry.laycan_2_days_remark || undefined) : undefined,
                loading_month: contractType === 'CIF' ? (entry.loading_month || undefined) : undefined,
                loading_window: contractType === 'CIF' ? (entry.loading_window || undefined) : undefined,
                cif_route: contractType === 'CIF' ? (entry.cif_route || undefined) : undefined,
                delivery_month: contractType === 'CIF' ? (entry.delivery_month || undefined) : undefined,
                delivery_window: contractType === 'CIF' ? (entry.delivery_window || undefined) : undefined,
                delivery_window_remark: contractType === 'CIF' ? (entry.delivery_window_remark || undefined) : undefined,
                combi_group_id: combiGroupId,
              }))
            } else {
              // Regular contracts with quarterly plans
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
                cif_route: contractType === 'CIF' ? (entry.cif_route || undefined) : undefined,
                delivery_month: contractType === 'CIF' ? (entry.delivery_month || undefined) : undefined,
                delivery_window: contractType === 'CIF' ? (entry.delivery_window || undefined) : undefined,
                delivery_window_remark: contractType === 'CIF' ? (entry.delivery_window_remark || undefined) : undefined,
                combi_group_id: combiGroupId,
              }))
            }
          }
        } else {
          // Single product entry
          const totalQuantity = parseFloat(entry.quantity || '0')
          const createPayload: any = {
            month: month,
            year: year,
            month_quantity: totalQuantity,
            number_of_liftings: 1,
            laycan_5_days: contractType === 'FOB' && totalQuantity > 0 ? (entry.laycan_5_days || undefined) : undefined,
            laycan_2_days: contractType === 'FOB' && totalQuantity > 0 ? (entry.laycan_2_days || undefined) : undefined,
            laycan_2_days_remark: contractType === 'FOB' && totalQuantity > 0 ? (entry.laycan_2_days_remark || undefined) : undefined,
            loading_month: contractType === 'CIF' && totalQuantity > 0 ? (entry.loading_month || undefined) : undefined,
            loading_window: contractType === 'CIF' && totalQuantity > 0 ? (entry.loading_window || undefined) : undefined,
            cif_route: contractType === 'CIF' && totalQuantity > 0 ? (entry.cif_route || undefined) : undefined,
            delivery_month: contractType === 'CIF' && totalQuantity > 0 ? (entry.delivery_month || undefined) : undefined,
            delivery_window: contractType === 'CIF' && totalQuantity > 0 ? (entry.delivery_window || undefined) : undefined,
            delivery_window_remark: contractType === 'CIF' && totalQuantity > 0 ? (entry.delivery_window_remark || undefined) : undefined,
          }
          
          // For SPOT/Range contracts, use contract_id instead of quarterly_plan_id
          if (skipQuarterlyPlan) {
            createPayload.contract_id = contractId
            createPayload.product_name = entry.product_name
          } else {
            createPayload.quarterly_plan_id = entry.quarterly_plan_id
          }
          
          createPromises.push(monthlyPlanAPI.create(createPayload))
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

  // SPOT/Range contracts don't need quarterly plans
  if (!skipQuarterlyPlan && (!quarterlyPlans || quarterlyPlans.length === 0)) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="error" sx={{ mb: 2 }}>
          Please create quarterly plan(s) first
        </Typography>
      </Paper>
    )
  }

  if (!contract) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography>Loading contract details...</Typography>
      </Paper>
    )
  }
  
  // For non-SPOT/Range contracts without quarterly plans, skip quarterly-based rendering
  if (!skipQuarterlyPlan && quarterOrder.length === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography>Loading contract details...</Typography>
      </Paper>
    )
  }

  // For SPOT/Range contracts, render a simplified view with just the contract months
  if (skipQuarterlyPlan) {
    return (
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">
              {isRangeContract 
                ? 'Range Contract' 
                : isSpotContract 
                  ? 'Spot Contract' 
                  : 'Contract'} - Monthly Plan
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
          resourceType="monthly plan"
          onRefresh={onPlanCreated}
          editingUser={editingUser}
        />
        
        {/* Contract Period Info with Quantity Validation */}
        <Box sx={{ mb: 3, p: 2, bgcolor: '#F8FAFC', borderRadius: 2, border: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ color: '#64748B', mb: 2 }}>
            Contract Period: <strong>{new Date(contract.start_period).toLocaleDateString()} - {new Date(contract.end_period).toLocaleDateString()}</strong>
          </Typography>
          
          {/* Monthly Plan Progress - Enhanced for Range Contracts */}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1E293B', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            📊 Monthly Plan Progress
          </Typography>
          
          {/* Quantity validation for each product */}
          {products.map((p: any) => {
            // Support both fixed quantity mode and min/max range mode
            // Use != null to check for both null and undefined, and ensure value > 0
            const isMinMaxMode = (p.min_quantity != null && p.min_quantity > 0) || (p.max_quantity != null && p.max_quantity > 0)
            const minQuantity = p.min_quantity || 0
            const optionalQuantity = p.optional_quantity || 0  // Optional quantity - works for both modes
            
            // For range contracts: max is the max_quantity, optional is on top of max
            // For fixed contracts: max is total + optional
            const maxQuantity = isMinMaxMode 
              ? (p.max_quantity || 0) + optionalQuantity  // Range: max + optional
              : (p.total_quantity || 0) + optionalQuantity  // Fixed: total + optional
            
            const firmQuantity = isMinMaxMode 
              ? (p.max_quantity || 0)  // For range mode - max is the "firm" ceiling before optional
              : (p.total_quantity || 0)  // For fixed mode - firm quantity without optional
            
            const totalQuantity = maxQuantity  // Total possible = firm + optional
            
            // Calculate total allocated across all months for this product
            const allocated = Object.values(monthEntries).reduce((sum, entries) => {
              return sum + entries.reduce((entrySum, entry) => {
                if (entry.is_combi) {
                  return entrySum + (parseFloat(entry.combi_quantities[p.name] || '0') || 0)
                } else if (entry.product_name === p.name) {
                  return entrySum + (parseFloat(entry.quantity || '0') || 0)
                }
                return entrySum
              }, 0)
            }, 0)
            
            // For min/max mode: valid when allocated is between min and max (or max + optional)
            // For fixed mode: valid when allocated equals total (firm + optional)
            const remaining = maxQuantity - allocated
            const isComplete = isMinMaxMode 
              ? (allocated >= minQuantity && allocated <= maxQuantity)
              : remaining === 0
            const isBelowMin = isMinMaxMode && allocated < minQuantity
            const isAboveMax = allocated > maxQuantity
            
            // Calculate percentages for the progress bar
            const percentage = maxQuantity > 0 ? (allocated / maxQuantity) * 100 : 0
            const minPercentage = maxQuantity > 0 ? (minQuantity / maxQuantity) * 100 : 0
            
            // Track if we're in optional territory (works for both modes now)
            const isUsingOptional = optionalQuantity > 0 && allocated > firmQuantity
            const optionalUsed = isUsingOptional ? Math.min(allocated - firmQuantity, optionalQuantity) : 0
            const firmPercentage = optionalQuantity > 0 && totalQuantity > 0 
              ? (firmQuantity / totalQuantity) * 100 
              : 100
            
            // For range mode: calculate max percentage (where optional starts)
            const maxPercentage = isMinMaxMode && optionalQuantity > 0 && maxQuantity > 0
              ? ((p.max_quantity || 0) / maxQuantity) * 100
              : 100
            
            // Determine status color and icon
            const getStatusColor = () => {
              if (isAboveMax) return '#EF4444'  // Red - over max + optional
              if (isUsingOptional) return '#8B5CF6'  // Purple - using optional
              if (isComplete) return '#22C55E'  // Green - complete/within range
              if (isBelowMin) return '#F59E0B'  // Amber - below min
              return '#3B82F6'  // Blue - in progress
            }
            
            const getStatusIcon = () => {
              if (isAboveMax) return '⚠️'
              if (isUsingOptional) return '🔷'
              if (isComplete) return '✅'
              if (isBelowMin) return '⏳'
              return '📈'
            }
            
            const getStatusText = () => {
              if (isAboveMax) return `Over Maximum! (${(allocated - maxQuantity).toLocaleString()} KT over)`
              if (isUsingOptional) {
                return `🔷 Tapping Optional: ${optionalUsed.toLocaleString()} of ${optionalQuantity.toLocaleString()} KT`
              }
              if (isMinMaxMode) {
                if (isComplete) return 'Within Range ✓'
                if (isBelowMin) return `${(minQuantity - allocated).toLocaleString()} KT below minimum`
                return 'In Progress'
              } else {
                if (isComplete) return 'Complete ✓'
                return `${remaining.toLocaleString()} KT remaining`
              }
            }
            
            return (
              <Box 
                key={p.name} 
                sx={{ 
                  mt: 2, 
                  p: 2, 
                  bgcolor: isComplete ? 'rgba(34, 197, 94, 0.06)' : isAboveMax ? 'rgba(239, 68, 68, 0.06)' : isUsingOptional ? 'rgba(139, 92, 246, 0.06)' : '#FFFFFF', 
                  borderRadius: 2, 
                  border: `1px solid ${isComplete ? '#86EFAC' : isAboveMax ? '#FECACA' : isUsingOptional ? '#C4B5FD' : '#E2E8F0'}`,
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Header with product name and status */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body1" fontWeight="bold" sx={{ color: '#1E293B' }}>
                      {p.name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: getStatusColor() }}>
                      {getStatusIcon()}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="h6" fontWeight="bold" sx={{ color: getStatusColor(), lineHeight: 1 }}>
                      {allocated.toLocaleString()} KT
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748B' }}>
                      of {maxQuantity.toLocaleString()} KT
                    </Typography>
                  </Box>
                </Box>
                
                {/* Enhanced Progress Bar */}
                <Box sx={{ position: 'relative', mb: 1.5 }}>
                  {/* Background track */}
                  <Box sx={{ 
                    height: 12, 
                    bgcolor: '#E2E8F0', 
                    borderRadius: 2, 
                    overflow: 'visible',
                    position: 'relative'
                  }}>
                    {/* For fixed mode with optional: show firm quantity zone */}
                    {!isMinMaxMode && optionalQuantity > 0 && (
                      <Box sx={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${firmPercentage}%`,
                        bgcolor: 'rgba(59, 130, 246, 0.15)',
                        borderRadius: '8px 0 0 8px',
                        borderRight: '2px dashed #3B82F6'
                      }} />
                    )}
                    
                    {/* For range mode with optional: show optional zone (after max) */}
                    {isMinMaxMode && optionalQuantity > 0 && (
                      <Box sx={{
                        position: 'absolute',
                        left: `${maxPercentage}%`,
                        top: 0,
                        bottom: 0,
                        right: 0,
                        bgcolor: 'rgba(139, 92, 246, 0.15)',
                        borderRadius: '0 8px 8px 0',
                        borderLeft: '2px dashed #8B5CF6'
                      }} />
                    )}
                    
                    {/* Min threshold marker for min/max mode */}
                    {isMinMaxMode && minQuantity > 0 && (
                      <>
                        <Box sx={{
                          position: 'absolute',
                          left: `${minPercentage}%`,
                          top: -4,
                          bottom: -4,
                          width: 3,
                          bgcolor: isBelowMin ? '#F59E0B' : '#22C55E',
                          borderRadius: 1,
                          zIndex: 3,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }} />
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            position: 'absolute', 
                            left: `${minPercentage}%`, 
                            top: -20, 
                            transform: 'translateX(-50%)',
                            color: isBelowMin ? '#F59E0B' : '#22C55E',
                            fontWeight: 600,
                            fontSize: '0.65rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          MIN
                        </Typography>
                      </>
                    )}
                    
                    {/* Max threshold marker for min/max mode with optional */}
                    {isMinMaxMode && optionalQuantity > 0 && (
                      <>
                        <Box sx={{
                          position: 'absolute',
                          left: `${maxPercentage}%`,
                          top: -4,
                          bottom: -4,
                          width: 3,
                          bgcolor: isUsingOptional ? '#8B5CF6' : '#3B82F6',
                          borderRadius: 1,
                          zIndex: 3,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }} />
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            position: 'absolute', 
                            left: `${maxPercentage}%`, 
                            top: -20, 
                            transform: 'translateX(-50%)',
                            color: isUsingOptional ? '#8B5CF6' : '#3B82F6',
                            fontWeight: 600,
                            fontSize: '0.65rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          MAX
                        </Typography>
                      </>
                    )}
                    
                    {/* Progress fill */}
                    <Box sx={{ 
                      height: '100%', 
                      width: `${Math.min(percentage, 100)}%`, 
                      bgcolor: getStatusColor(),
                      borderRadius: percentage >= 100 ? 2 : '8px 0 0 8px',
                      transition: 'width 0.3s ease',
                      position: 'relative',
                      zIndex: 1
                    }}>
                      {/* Optional quantity indicator within progress bar */}
                      {isUsingOptional && (
                        <Box sx={{
                          position: 'absolute',
                          left: `${(firmQuantity / allocated) * 100}%`,
                          top: 0,
                          bottom: 0,
                          right: 0,
                          bgcolor: '#A78BFA',
                          borderRadius: '0 8px 8px 0'
                        }} />
                      )}
                    </Box>
                  </Box>
                  
                  {/* Scale markers */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, px: 0.5 }}>
                    <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.65rem' }}>0</Typography>
                    {isMinMaxMode && minQuantity > 0 && minPercentage > 15 && minPercentage < 85 && (
                      <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.65rem', position: 'absolute', left: `${minPercentage}%`, transform: 'translateX(-50%)' }}>
                        {minQuantity.toLocaleString()}
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.65rem' }}>{maxQuantity.toLocaleString()}</Typography>
                  </Box>
                </Box>
                
                {/* Status text and details */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="body2" sx={{ color: getStatusColor(), fontWeight: 500 }}>
                    {getStatusText()}
                  </Typography>
                  
                  {/* Additional info chips */}
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {isMinMaxMode ? (
                      <>
                        <Chip 
                          label={`Range: ${minQuantity.toLocaleString()} - ${(p.max_quantity || 0).toLocaleString()} KT`}
                          size="small"
                          sx={{ 
                            bgcolor: 'rgba(139, 92, 246, 0.1)', 
                            color: '#7C3AED',
                            fontWeight: 500,
                            fontSize: '0.7rem',
                            height: 22
                          }}
                        />
                        {optionalQuantity > 0 && (
                          <Chip 
                            label={`Optional: +${optionalQuantity.toLocaleString()} KT`}
                            size="small"
                            sx={{ 
                              bgcolor: isUsingOptional ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.1)', 
                              color: '#7C3AED',
                              fontWeight: 500,
                              fontSize: '0.7rem',
                              height: 22,
                              border: isUsingOptional ? '1px solid #A78BFA' : 'none'
                            }}
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <Chip 
                          label={`Firm: ${firmQuantity.toLocaleString()} KT`}
                          size="small"
                          sx={{ 
                            bgcolor: 'rgba(59, 130, 246, 0.1)', 
                            color: '#2563EB',
                            fontWeight: 500,
                            fontSize: '0.7rem',
                            height: 22
                          }}
                        />
                        {optionalQuantity > 0 && (
                          <Chip 
                            label={`Optional: ${optionalQuantity.toLocaleString()} KT`}
                            size="small"
                            sx={{ 
                              bgcolor: isUsingOptional ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)', 
                              color: '#7C3AED',
                              fontWeight: 500,
                              fontSize: '0.7rem',
                              height: 22,
                              border: isUsingOptional ? '1px solid #A78BFA' : 'none'
                            }}
                          />
                        )}
                      </>
                    )}
                    <Chip 
                      label={`${Math.round(percentage)}%`}
                      size="small"
                      sx={{ 
                        bgcolor: getStatusColor(), 
                        color: '#FFFFFF',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        height: 22
                      }}
                    />
                  </Box>
                </Box>
                
                {/* Optional quantity warning/info */}
                {isUsingOptional && (
                  <Box sx={{ 
                    mt: 1.5, 
                    p: 1, 
                    bgcolor: 'rgba(139, 92, 246, 0.1)', 
                    borderRadius: 1,
                    border: '1px solid #C4B5FD'
                  }}>
                    <Typography variant="caption" sx={{ color: '#7C3AED', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      🔷 Tapping into optional quantity: {optionalUsed.toLocaleString()} of {optionalQuantity.toLocaleString()} KT used
                    </Typography>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
        
        {/* Monthly entries for SPOT contract */}
        <Grid container spacing={2}>
          {contractMonths.map(({ month, year }) => {
            const key = `${month}-${year}`
            const entries = monthEntries[key] || []
            
            return (
              <Grid item xs={12} sm={6} md={4} key={key}>
                <Box sx={{ 
                  p: 2, 
                  bgcolor: '#FFFFFF', 
                  borderRadius: 2, 
                  border: '1px solid #E2E8F0',
                  minHeight: 150
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {getMonthName(month)} {year}
                    </Typography>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleAddEntry(month, year)}
                    >
                      <Add fontSize="small" />
                    </IconButton>
                  </Box>
                  
                  {entries.length === 0 && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Add />}
                      onClick={() => handleAddEntry(month, year)}
                      fullWidth
                    >
                      Add Entry
                    </Button>
                  )}
                  
                  {entries.map((entry, entryIndex) => {
                    const quantity = entry.is_combi 
                      ? Object.values(entry.combi_quantities).reduce((sum, q) => sum + (parseFloat(q) || 0), 0)
                      : parseFloat(entry.quantity || '0')
                    const showLaycans = contractType === 'FOB' && quantity > 0
                    const showCifWindows = contractType === 'CIF' && quantity > 0
                    
                    return (
                      <Box 
                        key={entryIndex} 
                        sx={{ 
                          mb: 1,
                          p: 1,
                          bgcolor: entry.is_combi ? '#FFFBEB' : '#FAFBFC',
                          border: `1px solid ${entry.is_combi ? '#F59E0B' : '#E5E7EB'}`,
                          borderRadius: 1,
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleRemoveEntry(month, year, entryIndex)}
                            sx={{ color: '#EF4444' }}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Box>
                        
                        {/* Combi Cargo option - only for multi-product contracts and new entries */}
                        {isMultiProduct && !entry.id && (
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={entry.is_combi}
                                onChange={(e) => handleCombiChange(month, year, entryIndex, e.target.checked)}
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
                            sx={{ mb: 1, bgcolor: BADGE_COLORS.COMBI.bgcolor, color: BADGE_COLORS.COMBI.color }} 
                          />
                        )}
                        
                        {/* Product selection for multi-product non-combi entries */}
                        {isMultiProduct && !entry.is_combi && !entry.id && (
                          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                            <InputLabel>Product</InputLabel>
                            <Select
                              value={entry.product_name || ''}
                              label="Product"
                              onChange={(e) => handleProductChange(month, year, entryIndex, e.target.value)}
                            >
                              {products.map((p: any) => (
                                <MenuItem key={p.name} value={p.name}>{p.name}</MenuItem>
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
                        
                        {/* Combi cargo: individual quantity inputs for each product */}
                        {entry.is_combi ? (
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
                                sx={{ mb: 1 }}
                                inputProps={{ min: 0, step: 0.01 }}
                              />
                            ))}
                            <Typography variant="caption" sx={{ color: '#64748B' }}>
                              Total: {quantity.toLocaleString()} KT
                            </Typography>
                          </Box>
                        ) : (
                          /* Single product quantity */
                          <TextField
                            size="small"
                            label="Quantity (KT)"
                            type="number"
                            value={entry.quantity}
                            onChange={(e) => handleQuantityChange(month, year, entryIndex, e.target.value)}
                            onBlur={handleFieldBlur}
                            fullWidth
                            sx={{ mb: 1 }}
                          />
                        )}
                        
                        {/* FOB Laycans */}
                        {showLaycans && (
                          <>
                            <TextField
                              size="small"
                              label="5-Day Laycan"
                              value={entry.laycan_5_days}
                              onChange={(e) => handleLaycanChange(month, year, entryIndex, 'laycan_5_days', e.target.value)}
                              fullWidth
                              sx={{ mb: 1 }}
                            />
                            <TextField
                              size="small"
                              label="2-Day Laycan"
                              value={entry.laycan_2_days}
                              onChange={(e) => handleLaycanChange(month, year, entryIndex, 'laycan_2_days', e.target.value)}
                              fullWidth
                              sx={{ mb: 1 }}
                            />
                          </>
                        )}
                        
                        {/* CIF Windows */}
                        {showCifWindows && (
                          <>
                            <TextField
                              size="small"
                              label="Loading Month"
                              value={entry.loading_month || getLoadingMonthOption(month, year).value}
                              onChange={(e) => handleLaycanChange(month, year, entryIndex, 'loading_month', e.target.value)}
                              select
                              fullWidth
                              sx={{ mb: 1 }}
                            >
                              <MenuItem value={getLoadingMonthOption(month, year).value}>
                                {getLoadingMonthOption(month, year).label}
                              </MenuItem>
                            </TextField>
                            <TextField
                              size="small"
                              label="Loading Window"
                              value={entry.loading_window}
                              onChange={(e) => handleLaycanChange(month, year, entryIndex, 'loading_window', e.target.value)}
                              fullWidth
                              sx={{ mb: 1 }}
                            />
                            <TextField
                              size="small"
                              label="Route"
                              value={entry.cif_route}
                              onChange={(e) => handleLaycanChange(month, year, entryIndex, 'cif_route', e.target.value)}
                              select
                              fullWidth
                              sx={{ mb: 1 }}
                            >
                              <MenuItem value="">
                                <em>Select route</em>
                              </MenuItem>
                              {CIF_ROUTES.map((route) => (
                                <MenuItem key={route} value={route}>Via {route}</MenuItem>
                              ))}
                            </TextField>
                            <TextField
                              size="small"
                              label="Delivery Month *"
                              value={entry.delivery_month}
                              onChange={(e) => handleLaycanChange(month, year, entryIndex, 'delivery_month', e.target.value)}
                              select
                              required
                              fullWidth
                              sx={{ mb: 1 }}
                            >
                              <MenuItem value="">
                                <em>Select month</em>
                              </MenuItem>
                              {getDeliveryMonthOptions(month, year).map((opt) => (
                                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                              ))}
                            </TextField>
                            <TextField
                              size="small"
                              label="Delivery Window"
                              value={entry.delivery_window}
                              onChange={(e) => handleLaycanChange(month, year, entryIndex, 'delivery_window', e.target.value)}
                              fullWidth
                              sx={{ 
                                mb: 1,
                                '& .MuiFormHelperText-root': { 
                                  color: entry.loading_window && entry.cif_route ? '#6366F1' : undefined,
                                  fontStyle: 'italic',
                                },
                              }}
                              helperText={
                                entry.loading_window && entry.cif_route && contract?.cif_destination
                                  ? `ETA: ${calculateETA(entry.loading_window, contract.cif_destination, entry.cif_route, month, year) || '-'}`
                                  : (contract?.cif_destination ? `Basis ${contract.cif_destination}` : 'Set destination in contract')
                              }
                            />
                          </>
                        )}
                      </Box>
                    )
                  })}
                </Box>
              </Grid>
            )
          })}
        </Grid>
        
        {/* Save Button */}
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={handleSave}
            disabled={isSaving}
            sx={{ bgcolor: '#2563EB', '&:hover': { bgcolor: '#1D4ED8' } }}
          >
            {isSaving ? 'Saving...' : 'Save All Monthly Plans'}
          </Button>
        </Box>
      </Paper>
    )
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, newMode) => newMode && setViewMode(newMode)}
            size="small"
          >
            <ToggleButton value="grid" aria-label="grid view">
              <ViewModule fontSize="small" />
            </ToggleButton>
            <ToggleButton value="table" aria-label="table view">
              <ViewList fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
          <ActiveUsersIndicator 
            users={otherUsers} 
            isConnected={isConnected}
            variant="avatars"
            showConnectionStatus
            label="Also editing"
          />
        </Box>
      </Box>
      
      {/* Warning banner when others are editing */}
      <EditingWarningBanner
        otherUsers={otherUsers}
        isConnected={isConnected}
        resourceType="monthly plan"
        onRefresh={onPlanCreated}
        editingUser={editingUser}
      />
      
      {/* Year Tabs for multi-year contracts */}
      {numContractYears > 1 && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
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
      
      {/* Quarterly Plan Summary - Modern Card Design */}
      <Box sx={{ 
        mb: 3, 
        p: 2, 
        bgcolor: '#F8FAFC', 
        borderRadius: 2,
        border: '1px solid #E2E8F0',
      }}>
        <Typography variant="subtitle2" sx={{ color: '#64748B', fontWeight: 600, mb: 2, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.75rem' }}>
          Quarterly Plan Progress
        </Typography>
        
        <Grid container spacing={2}>
        {products.map((product: any) => (
            <Grid item xs={12} key={product.name}>
            {isMultiProduct && (
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', mb: 1.5 }}>
                  {product.name}
              </Typography>
            )}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {quarterOrder.map((q, idx) => {
                  const quarterLabel = QUARTER_MONTHS[q].labels.join(', ')
                const qty = getQuarterlyQuantity(product.name, idx)
                const entered = getTotalEntered(q, product.name)
                const isComplete = entered === qty
                  const percentage = qty > 0 ? Math.round((entered / qty) * 100) : 0
                  
                return (
                    <Box 
                      key={q} 
                      sx={{ 
                        flex: '1 1 200px',
                        p: 1.5,
                        bgcolor: isComplete ? 'rgba(34, 197, 94, 0.08)' : '#FFFFFF',
                        borderRadius: 1.5,
                        border: isComplete ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid #E2E8F0',
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>
                          {q}
                        </Typography>
                        {isComplete && qty > 0 && (
                          <Chip 
                            label="Allocated" 
                            size="small" 
                            sx={{ 
                              height: 20, 
                              fontSize: '0.65rem', 
                              bgcolor: 'rgba(34, 197, 94, 0.15)', 
                              color: '#16A34A',
                              fontWeight: 600,
                            }} 
                          />
                        )}
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', mb: 0.5 }}>
                        {entered.toLocaleString()} / {qty.toLocaleString()} KT
                      </Typography>
                      <Box sx={{ width: '100%', height: 4, bgcolor: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                        <Box 
                          sx={{ 
                            width: `${percentage}%`, 
                            height: '100%', 
                            bgcolor: isComplete ? '#22C55E' : '#3B82F6',
                            borderRadius: 2,
                            transition: 'width 0.3s ease',
                          }} 
                        />
                      </Box>
                      <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.65rem', mt: 0.5, display: 'block' }}>
                        {quarterLabel}
            </Typography>
                    </Box>
                  )
                })}
          </Box>
            </Grid>
        ))}
        </Grid>
      </Box>
      
      {/* Table View - Compact list of all cargos */}
      {viewMode === 'table' && (
        <Box sx={{ mt: 2 }}>
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: contractType === 'CIF' 
                ? 'minmax(100px, 1fr) minmax(80px, 0.8fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(80px, 0.6fr)'
                : 'minmax(100px, 1fr) minmax(80px, 0.8fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(80px, 0.6fr)',
              bgcolor: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
              px: 2,
              py: 1,
            }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>Loading Month</Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>Quantity</Typography>
              {contractType === 'FOB' ? (
                <>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>5-Day Laycan</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>2-Day Laycan</Typography>
                </>
              ) : (
                <>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>Loading Window</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>Delivery Month</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>Delivery Window</Typography>
                </>
              )}
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>Actions</Typography>
            </Box>
            {/* Table rows */}
            {Object.entries(monthEntries)
              .sort(([a], [b]) => {
                const [aMonth, aYear] = a.split('-').map(Number)
                const [bMonth, bYear] = b.split('-').map(Number)
                return aYear !== bYear ? aYear - bYear : aMonth - bMonth
              })
              .flatMap(([key, entries]) => {
                const [month, year] = key.split('-').map(Number)
                return entries.map((entry, idx) => {
                  const quantity = entry.is_combi 
                    ? Object.values(entry.combi_quantities).reduce((sum, q) => sum + (parseFloat(q) || 0), 0)
                    : parseFloat(entry.quantity || '0')
                  if (quantity === 0) return null
                  
                  return (
                    <Box 
                      key={`${key}-${idx}`}
                      sx={{ 
                        display: 'grid', 
                        gridTemplateColumns: contractType === 'CIF' 
                          ? 'minmax(100px, 1fr) minmax(80px, 0.8fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(80px, 0.6fr)'
                          : 'minmax(100px, 1fr) minmax(80px, 0.8fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(80px, 0.6fr)',
                        px: 2,
                        py: 1.5,
                        borderBottom: '1px solid #F1F5F9',
                        '&:hover': { bgcolor: '#F8FAFC' },
                        alignItems: 'center',
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {getMonthName(month)} {year}
                        </Typography>
                        {entry.is_combi && (
                          <Chip label="Combi" size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: BADGE_COLORS.COMBI.bgcolor, color: BADGE_COLORS.COMBI.color, mt: 0.5 }} />
                        )}
                        {!entry.is_combi && isMultiProduct && (
                          <Typography variant="caption" sx={{ color: '#64748B' }}>{entry.product_name}</Typography>
                        )}
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B' }}>
                        {quantity.toLocaleString()} KT
                      </Typography>
                      {contractType === 'FOB' ? (
                        <>
                          <Typography variant="body2" sx={{ color: entry.laycan_5_days ? '#1E293B' : '#94A3B8' }}>
                            {entry.laycan_5_days || '-'}
                          </Typography>
                          <Typography variant="body2" sx={{ color: entry.laycan_2_days ? '#1E293B' : '#94A3B8' }}>
                            {entry.laycan_2_days || '-'}
                          </Typography>
                        </>
                      ) : (
                        <>
                          <Typography variant="body2" sx={{ color: entry.loading_window ? '#1E293B' : '#94A3B8', fontStyle: entry.loading_window ? 'normal' : 'italic' }}>
                            {entry.loading_window || `${getMonthName(month)} ${year}`}
                          </Typography>
                          <Typography variant="body2" sx={{ color: entry.delivery_month ? '#1E293B' : '#94A3B8' }}>
                            {entry.delivery_month || '-'}
                          </Typography>
                          <Box>
                            <Typography variant="body2" sx={{ color: entry.delivery_window ? '#1E293B' : '#94A3B8', fontStyle: entry.delivery_window ? 'normal' : 'italic' }}>
                              {entry.delivery_window || (entry.delivery_month || '-')}
                            </Typography>
                            {/* Show ETA if loading window, route, and destination are available */}
                            {entry.loading_window && entry.cif_route && contract?.cif_destination && (
                              <Typography variant="caption" sx={{ color: '#6366F1', fontStyle: 'italic', display: 'block' }}>
                                ETA: {calculateETA(entry.loading_window, contract.cif_destination, entry.cif_route, month, year) || '-'}
                              </Typography>
                            )}
                          </Box>
                        </>
                      )}
                      <Button 
                        size="small" 
                        onClick={() => setViewMode('grid')}
                        sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
                      >
                        Edit
                      </Button>
                    </Box>
                  )
                }).filter(Boolean)
              })}
            {/* Empty state */}
            {Object.values(monthEntries).every(entries => 
              entries.every(e => {
                const qty = e.is_combi 
                  ? Object.values(e.combi_quantities).reduce((sum, q) => sum + (parseFloat(q) || 0), 0)
                  : parseFloat(e.quantity || '0')
                return qty === 0
              })
            ) && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No cargos planned yet. Switch to Grid View to add cargos.</Typography>
              </Box>
            )}
          </Paper>
          
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
      )}
      
      {/* Grid View - Detailed editing by quarter */}
      {viewMode === 'grid' && (
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
                  const quarterlyTopup = getQuarterlyTopup(product.name, quarterIndex)
                  const quarterlyOriginal = getQuarterlyOriginal(product.name, quarterIndex)
                  const totalEntered = getTotalEntered(quarter, product.name)
                  const remaining = quarterlyQuantity - totalEntered
                  const isComplete = remaining === 0
                  
                  return (
                    <Box key={product.name} sx={{ mb: 0.5 }}>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        color: isComplete ? 'success.main' : 'text.secondary',
                      }}
                    >
                      {isMultiProduct && <strong>{product.name}: </strong>}
                        Total: {quarterlyQuantity.toLocaleString()} KT
                        {quarterlyTopup > 0 && (
                          <span style={{ color: '#10B981', fontWeight: 500 }}>
                            {' '}({quarterlyOriginal.toLocaleString()} + <span style={{ backgroundColor: '#D1FAE5', padding: '1px 4px', borderRadius: '4px' }}>{quarterlyTopup.toLocaleString()} top-up</span>)
                          </span>
                        )}
                        {' | '}Entered: {totalEntered.toLocaleString()} KT | 
                      Remaining: {remaining.toLocaleString()} KT
                      {isComplete && ' ✓'}
                    </Typography>
                    </Box>
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
                              {/* Action buttons for entries - show menu for saved entries */}
                              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleActionMenuOpen(e, month, year, entryIndex, entry, hasCargos)}
                                  sx={{ color: '#64748B' }}
                                  disabled={!entry.id}
                                  title={!entry.id ? 'Save entry first' : 'Actions (Defer, Advance, Top-Up)'}
                                >
                                  <MoreVert fontSize="small" />
                                </IconButton>
                              </Box>
                              
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
                                      Combie Cargo (multiple products in one vessel)
                                    </Typography>
                                  }
                                  sx={{ mb: 1 }}
                                />
                              )}
                              
                              {/* Show combi badge for existing combi entries */}
                              {entry.is_combi && entry.id && (
                                <Chip 
                                  label="Combie Cargo"
                                  size="small" 
                                  sx={{ mb: 1, bgcolor: BADGE_COLORS.COMBI.bgcolor, color: BADGE_COLORS.COMBI.color }} 
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
                                    <Box sx={{ mt: 0.5 }}>
                                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#B45309' }}>
                                      Total: {parseFloat(entry.quantity).toLocaleString()} KT
                                        {(entry.authority_topup_quantity || 0) > 0 && (
                                          <span style={{ color: '#10B981', fontWeight: 500, marginLeft: 8 }}>
                                            (incl. {entry.authority_topup_quantity?.toLocaleString()} top-up)
                                          </span>
                                        )}
                                    </Typography>
                                      {/* Show top-up breakdown for combi entries */}
                                      {(entry.authority_topup_quantity || 0) > 0 && (
                                        <Box sx={{ 
                                          mt: 0.5, 
                                          p: 0.75, 
                                          bgcolor: '#F0FDF4', 
                                          borderRadius: 1,
                                          border: '1px solid #D1FAE5'
                                        }}>
                                          <Typography variant="caption" sx={{ color: '#166534', display: 'block' }}>
                                            📊 Original: {(parseFloat(entry.quantity) - (entry.authority_topup_quantity || 0)).toLocaleString()} KT
                                          </Typography>
                                          <Typography variant="caption" sx={{ color: '#10B981', display: 'block' }}>
                                            ➕ Top-up: {(entry.authority_topup_quantity || 0).toLocaleString()} KT
                                            {entry.authority_topup_reference && (
                                              <span style={{ marginLeft: 8, color: '#6B7280', fontSize: '0.7rem' }}>
                                                (Ref: {entry.authority_topup_reference})
                                              </span>
                                            )}
                                          </Typography>
                                        </Box>
                                      )}
                                    </Box>
                                  )}
                                </Box>
                              )}
                              
                              {/* Single quantity input - for single product contracts OR multi-product non-combi */}
                              {!entry.is_combi && (
                                <>
                                <TextField
                                  label={!isMultiProduct 
                                      ? `${getMonthName(month)} ${year}${entries.length > 1 ? ` (${entryIndex + 1})` : ''}`
                                    : 'Quantity (KT)'
                                  }
                                  type="number"
                                  value={entry.quantity}
                                  onChange={(e) => handleQuantityChange(month, year, entryIndex, e.target.value)}
                                  onBlur={handleFieldBlur}
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
                                  {/* Show top-up breakdown if there's a top-up */}
                                  {(entry.authority_topup_quantity || 0) > 0 && (
                                    <Box sx={{ 
                                      mt: 0.5, 
                                      p: 1, 
                                      bgcolor: '#F0FDF4', 
                                      borderRadius: 1,
                                      border: '1px solid #D1FAE5'
                                    }}>
                                      <Typography variant="caption" sx={{ color: '#166534', display: 'block' }}>
                                        📊 <strong>Original:</strong> {(parseFloat(entry.quantity) - (entry.authority_topup_quantity || 0)).toLocaleString()} KT
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: '#10B981', display: 'block' }}>
                                        ➕ <strong>Top-up:</strong> {(entry.authority_topup_quantity || 0).toLocaleString()} KT
                                        {entry.authority_topup_reference && (
                                          <span style={{ marginLeft: 8, color: '#6B7280', fontSize: '0.7rem' }}>
                                            (Ref: {entry.authority_topup_reference})
                                          </span>
                                        )}
                                      </Typography>
                                    </Box>
                                  )}
                                </>
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
                                      value={entry.loading_month || getLoadingMonthOption(month, year).value}
                                      onChange={(e) => handleLaycanChange(month, year, entryIndex, 'loading_month', e.target.value)}
                                      select
                                      disabled={isLocked}
                                      sx={{
                                        flex: 1.2,
                                        minWidth: 140,
                                        '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                      }}
                                    >
                                      <MenuItem value={getLoadingMonthOption(month, year).value}>
                                        {getLoadingMonthOption(month, year).label}
                                      </MenuItem>
                                    </TextField>
                                    <TextField
                                      label="Loading Window"
                                      size="small"
                                      value={entry.loading_window}
                                      onChange={(e) => handleLaycanChange(month, year, entryIndex, 'loading_window', e.target.value)}
                                      placeholder="e.g., 1-5/1"
                                      disabled={isLocked}
                                      sx={{
                                        flex: 0.8,
                                        minWidth: 100,
                                        '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                        '& .MuiInputBase-input': { padding: '6px 8px' },
                                      }}
                                    />
                                  </Box>
                                  <TextField
                                    label="Route"
                                    size="small"
                                    value={entry.cif_route}
                                    onChange={(e) => handleLaycanChange(month, year, entryIndex, 'cif_route', e.target.value)}
                                    select
                                    disabled={isLocked}
                                    sx={{
                                      '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                    }}
                                  >
                                    <MenuItem value="">
                                      <em>Select route</em>
                                    </MenuItem>
                                    {CIF_ROUTES.map((route) => (
                                      <MenuItem key={route} value={route}>Via {route}</MenuItem>
                                    ))}
                                  </TextField>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <TextField
                                      label="Delivery Month *"
                                      size="small"
                                      value={entry.delivery_month}
                                      onChange={(e) => handleLaycanChange(month, year, entryIndex, 'delivery_month', e.target.value)}
                                      select
                                      required
                                      disabled={isLocked}
                                      sx={{
                                        flex: 1.2,
                                        minWidth: 140,
                                        '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                      }}
                                    >
                                      <MenuItem value="">
                                        <em>Select month</em>
                                      </MenuItem>
                                      {getDeliveryMonthOptions(month, year).map((opt) => (
                                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                                      ))}
                                    </TextField>
                                    <TextField
                                      label="Del Window"
                                      size="small"
                                      value={entry.delivery_window}
                                      onChange={(e) => handleLaycanChange(month, year, entryIndex, 'delivery_window', e.target.value)}
                                      placeholder="Auto"
                                      disabled={isLocked}
                                      helperText={
                                        entry.loading_window && entry.cif_route && contract?.cif_destination
                                          ? `ETA: ${calculateETA(entry.loading_window, contract.cif_destination, entry.cif_route, month, year) || '-'}`
                                          : (contract?.cif_destination ? `Basis ${contract.cif_destination}` : '')
                                      }
                                      sx={{
                                        flex: 0.8,
                                        minWidth: 100,
                                        '& .MuiInputBase-root': { height: '32px', fontSize: '0.875rem' },
                                        '& .MuiInputBase-input': { padding: '6px 8px' },
                                        '& .MuiFormHelperText-root': { 
                                          color: entry.loading_window && entry.cif_route ? '#6366F1' : undefined,
                                          fontStyle: 'italic',
                                        },
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
      )}
      
      {/* Action Menu for existing entries */}
      <Menu
        anchorEl={actionMenuAnchor}
        open={Boolean(actionMenuAnchor)}
        onClose={handleActionMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => handleOpenMoveDialog('DEFER')}>
          <ListItemIcon>
            <ArrowForward fontSize="small" sx={{ color: '#2563EB' }} />
          </ListItemIcon>
          <ListItemText primary="Defer to Later Month" />
        </MenuItem>
        <MenuItem onClick={() => handleOpenMoveDialog('ADVANCE')}>
          <ListItemIcon>
            <ArrowBack fontSize="small" sx={{ color: '#7C3AED' }} />
          </ListItemIcon>
          <ListItemText primary="Advance to Earlier Month" />
        </MenuItem>
        <MenuItem 
          onClick={() => {
            if (!actionMenuEntry?.entry.id) {
              alert('Please save the cargo entry first before adding an authority top-up.')
              handleActionMenuClose()
              return
            }
            // Store the entry data BEFORE closing the menu
            setTopupEntry({
              month: actionMenuEntry.month,
              year: actionMenuEntry.year,
              entry: actionMenuEntry.entry,
            })
            setTopupForm({
              quantity: '',
              authority_reference: '',
              reason: '',
              date: new Date().toISOString().split('T')[0],
              selected_product: '',  // Reset product selection for combie cargos
            })
            setTopupDialogOpen(true)
            handleActionMenuClose()
          }}
          disabled={!actionMenuEntry?.entry.id}
          sx={{ 
            opacity: !actionMenuEntry?.entry.id ? 0.5 : 1,
          }}
        >
          <ListItemIcon>
            <TrendingUp fontSize="small" sx={{ color: !actionMenuEntry?.entry.id ? '#9CA3AF' : '#10B981' }} />
          </ListItemIcon>
          <ListItemText 
            primary="Authority Top-Up" 
            secondary={!actionMenuEntry?.entry.id ? '(Save entry first)' : undefined}
          />
        </MenuItem>
        <MenuItem 
          onClick={() => {
            if (actionMenuEntry?.entry.id) {
              setHistoryEntryId(actionMenuEntry.entry.id)
              setHistoryDialogOpen(true)
            }
            handleActionMenuClose()
          }}
          disabled={!actionMenuEntry?.entry.id}
          sx={{ 
            opacity: !actionMenuEntry?.entry.id ? 0.5 : 1,
          }}
        >
          <ListItemIcon>
            <History fontSize="small" sx={{ color: !actionMenuEntry?.entry.id ? '#9CA3AF' : '#6366F1' }} />
          </ListItemIcon>
          <ListItemText 
            primary="View History" 
            secondary={!actionMenuEntry?.entry.id ? '(Save entry first)' : undefined}
          />
        </MenuItem>
        <Divider />
        <MenuItem 
          onClick={async () => {
            if (actionMenuEntry) {
              await handleRemoveEntry(actionMenuEntry.month, actionMenuEntry.year, actionMenuEntry.entryIndex)
            }
            handleActionMenuClose()
          }}
          sx={{ 
            color: 'error.main'
          }}
        >
          <ListItemIcon>
            <Delete fontSize="small" sx={{ color: 'error.main' }} />
          </ListItemIcon>
          <ListItemText 
            primary="Delete Entry" 
            secondary={actionMenuEntry?.hasCargos ? '(Will also delete associated cargos)' : undefined}
          />
        </MenuItem>
      </Menu>
      
      {/* Move Dialog */}
      <Dialog open={moveDialogOpen} onClose={handleCloseMoveDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {moveAction === 'DEFER' ? 'Defer Cargo to Later Month' : 'Advance Cargo to Earlier Month'}
        </DialogTitle>
        <DialogContent>
          {moveEntryData && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ color: '#64748B', mb: 2 }}>
                Moving {moveEntryData.entry.is_combi ? 'combi cargo' : 'cargo'} from{' '}
                <strong>{getMonthName(moveEntryData.month)} {moveEntryData.year}</strong>
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel>Target Month</InputLabel>
                  <Select
                    value={moveTargetMonth}
                    label="Target Month"
                    onChange={(e) => setMoveTargetMonth(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <MenuItem key={m} value={m}>
                        {getMonthName(m)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label="Year"
                  type="number"
                  value={moveTargetYear}
                  onChange={(e) => setMoveTargetYear(Number(e.target.value))}
                  sx={{ width: 100 }}
                  inputProps={{ min: 2020, max: 2100 }}
                />
              </Box>
              
              <TextField
                size="small"
                label="Reason (optional)"
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
                fullWidth
                multiline
                rows={2}
                placeholder="e.g., Customer request, Authority approval"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseMoveDialog} disabled={isMoving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleExecuteMove}
            disabled={isMoving}
            sx={{
              bgcolor: moveAction === 'DEFER' ? '#2563EB' : '#7C3AED',
              '&:hover': { bgcolor: moveAction === 'DEFER' ? '#1D4ED8' : '#6D28D9' },
            }}
          >
            {isMoving ? 'Moving...' : moveAction === 'DEFER' ? 'Defer Cargo' : 'Advance Cargo'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Authority Top-Up Dialog */}
      <Dialog open={topupDialogOpen} onClose={() => { setTopupDialogOpen(false); setTopupEntry(null); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#F0FDF4', borderBottom: '1px solid #D1FAE5' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUp sx={{ color: '#10B981' }} />
            <Typography variant="h6">Authority Top-Up</Typography>
          </Box>
          {topupEntry && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Add authorized quantity increase for{' '}
              <strong>
                {getMonthName(topupEntry.month)} {topupEntry.year}
                {topupEntry.entry.is_combi ? ' (Combie)' : ` - ${topupEntry.entry.product_name}`}
              </strong>
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Product selector for combie cargos */}
            {topupEntry?.entry.is_combi && (
              <FormControl fullWidth required>
                <InputLabel>Select Product for Top-Up</InputLabel>
                <Select
                  value={topupForm.selected_product}
                  label="Select Product for Top-Up"
                  onChange={(e) => setTopupForm({ ...topupForm, selected_product: e.target.value })}
                >
                  {Object.keys(topupEntry.entry.combi_quantities || {}).map((productName) => (
                    <MenuItem key={productName} value={productName}>
                      {productName} (Current: {topupEntry.entry.combi_quantities[productName] || 0} KT)
                    </MenuItem>
                  ))}
                </Select>
                <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary' }}>
                  Choose which product this top-up is for
                </Typography>
              </FormControl>
            )}
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
              helperText={topupEntry ? (
                topupEntry.entry.is_combi && topupForm.selected_product 
                  ? `Current: ${topupEntry.entry.combi_quantities[topupForm.selected_product] || 0} KT → New: ${(parseFloat(topupEntry.entry.combi_quantities[topupForm.selected_product]) || 0) + (parseFloat(topupForm.quantity) || 0)} KT`
                  : topupEntry.entry.is_combi 
                    ? 'Select a product first'
                    : `Current quantity: ${topupEntry.entry.quantity || 0} KT → New: ${(parseFloat(topupEntry.entry.quantity) || 0) + (parseFloat(topupForm.quantity) || 0)} KT`
              ) : ''}
            />
            <TextField
              label="Authority Reference"
              value={topupForm.authority_reference}
              onChange={(e) => setTopupForm({ ...topupForm, authority_reference: e.target.value })}
              required
              fullWidth
              placeholder="e.g., AUTH-2025-001"
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
          <Button onClick={() => { setTopupDialogOpen(false); setTopupEntry(null); }} disabled={isAddingTopup}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (!topupForm.quantity || !topupForm.authority_reference) {
                alert('Please fill in quantity and authority reference')
                return
              }
              
              if (!topupEntry || !topupEntry.entry.id) {
                alert('No monthly plan selected. This should not happen - please close the dialog and try again.')
                return
              }
              
              // For combie cargos, require product selection
              if (topupEntry.entry.is_combi && !topupForm.selected_product) {
                alert('Please select which product the top-up is for')
                return
              }
              
              setIsAddingTopup(true)
              try {
                const topupData: MonthlyPlanTopUpRequest = {
                  quantity: parseFloat(topupForm.quantity),
                  authority_reference: topupForm.authority_reference,
                  reason: topupForm.reason || undefined,
                  authorization_date: topupForm.date || undefined,
                }
                
                // Determine which plan ID to use
                let planIdToUpdate: number
                if (topupEntry.entry.is_combi && topupEntry.entry._combi_product_plan_map && topupForm.selected_product) {
                  // For combie entries, use the specific product's plan ID
                  planIdToUpdate = topupEntry.entry._combi_product_plan_map[topupForm.selected_product]
                  if (!planIdToUpdate) {
                    throw new Error(`Could not find plan ID for product ${topupForm.selected_product}`)
                  }
                } else {
                  // For single product entries, use the entry's ID
                  planIdToUpdate = topupEntry.entry.id
                }
                
                await monthlyPlanAPI.addAuthorityTopup(planIdToUpdate, topupData)
                
                setTopupDialogOpen(false)
                setTopupEntry(null)
                const productInfo = topupEntry.entry.is_combi ? ` for ${topupForm.selected_product}` : ''
                alert(`Authority top-up of ${parseFloat(topupForm.quantity).toLocaleString()} KT${productInfo} added successfully!`)
                
                // Reload data
                onPlanCreated()
              } catch (error: any) {
                console.error('Error adding authority top-up:', error)
                const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error'
                alert(`Error adding top-up: ${errorMessage}`)
              } finally {
                setIsAddingTopup(false)
              }
            }}
            disabled={isAddingTopup || !topupForm.quantity || !topupForm.authority_reference || (topupEntry?.entry.is_combi && !topupForm.selected_product)}
            sx={{ 
              bgcolor: '#10B981', 
              '&:hover': { bgcolor: '#059669' } 
            }}
          >
            {isAddingTopup ? 'Adding...' : 'Add Top-Up'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Version History Dialog */}
      {historyEntryId && (
        <VersionHistoryDialog
          open={historyDialogOpen}
          onClose={() => {
            setHistoryDialogOpen(false)
            setHistoryEntryId(null)
          }}
          entityType="monthly_plan"
          entityId={historyEntryId}
          entityName={`Monthly Plan ${historyEntryId}`}
          onRestore={() => {
            // Reload data after restore
            onPlanCreated()
          }}
        />
      )}
    </Paper>
  )
}
