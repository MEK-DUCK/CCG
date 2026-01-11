import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  TextField,
  Chip,
  Button,
  useMediaQuery,
  useTheme,
  Tabs,
  Tab,
  Snackbar,
  Alert,
  IconButton,
} from '@mui/material'
import { FileDownload, PictureAsPdf, CalendarMonth, ChevronLeft, ChevronRight } from '@mui/icons-material'
import { customerAPI, contractAPI, quarterlyPlanAPI, monthlyPlanAPI, cargoAPI } from '../api/client'
import type { Customer, Contract, QuarterlyPlan, MonthlyPlan, Cargo } from '../types'
import { getContractTypeColor, getProductColor, BADGE_COLORS } from '../utils/chipColors'
import { useToast } from '../contexts/ToastContext'

// Column configuration for resizable columns (base columns + dynamic month columns)
const BASE_COLUMN_CONFIG = [
  { id: 'customer', label: 'Customer', defaultWidth: 200, minWidth: 100 },
  { id: 'contract', label: 'Contract Number', defaultWidth: 200, minWidth: 100 },
  { id: 'products', label: 'Product(s)', defaultWidth: 220, minWidth: 100 },
  { id: 'type', label: 'Type', defaultWidth: 120, minWidth: 80 },
]

// Month columns (for 3 months in quarterly view)
const MONTH_COLUMN_CONFIG_3 = [
  { id: 'month1', label: 'Month 1', defaultWidth: 150, minWidth: 100 },
  { id: 'month2', label: 'Month 2', defaultWidth: 150, minWidth: 100 },
  { id: 'month3', label: 'Month 3', defaultWidth: 150, minWidth: 100 },
]

// Month columns (for 12 months in ALL view - narrower to fit)
const MONTH_COLUMN_CONFIG_12 = [
  { id: 'month1', label: 'Jan', defaultWidth: 100, minWidth: 80 },
  { id: 'month2', label: 'Feb', defaultWidth: 100, minWidth: 80 },
  { id: 'month3', label: 'Mar', defaultWidth: 100, minWidth: 80 },
  { id: 'month4', label: 'Apr', defaultWidth: 100, minWidth: 80 },
  { id: 'month5', label: 'May', defaultWidth: 100, minWidth: 80 },
  { id: 'month6', label: 'Jun', defaultWidth: 100, minWidth: 80 },
  { id: 'month7', label: 'Jul', defaultWidth: 100, minWidth: 80 },
  { id: 'month8', label: 'Aug', defaultWidth: 100, minWidth: 80 },
  { id: 'month9', label: 'Sep', defaultWidth: 100, minWidth: 80 },
  { id: 'month10', label: 'Oct', defaultWidth: 100, minWidth: 80 },
  { id: 'month11', label: 'Nov', defaultWidth: 100, minWidth: 80 },
  { id: 'month12', label: 'Dec', defaultWidth: 100, minWidth: 80 },
]

const END_COLUMN_CONFIG = [
  { id: 'total', label: 'Total', defaultWidth: 150, minWidth: 100 },
  { id: 'remark', label: 'Remark', defaultWidth: 250, minWidth: 150 },
]

// For backwards compatibility, keep COLUMN_CONFIG as the 3-month version
const COLUMN_CONFIG = [...BASE_COLUMN_CONFIG, ...MONTH_COLUMN_CONFIG_3, ...END_COLUMN_CONFIG]

interface MonthlyPlanEntry {
  monthlyPlanId: number
  month: number
  quantity: number
  laycan5Days?: string
  laycan2Days?: string
  loadingMonth?: string    // CIF: Loading month
  loadingWindow?: string   // CIF: Loading window
  deliveryMonth?: string   // CIF: Delivery month
  deliveryWindow?: string  // CIF: Delivery window
  isCombi?: boolean  // True if this is a combi entry (multiple products, same vessel/laycan)
  combiGroupId?: string  // UUID linking combi monthly plans together
  combiProducts?: { productName: string; quantity: number; topupQuantity?: number }[]  // List of products with quantities in the combi group
  topupQuantity?: number  // Authority top-up quantity
}

interface ContractQuarterlyData {
  customerId: number
  customerName: string
  contractId: number
  contractNumber: string
  productsText: string
  products: string[]  // Array of product names for chip rendering
  contractType: 'FOB' | 'CIF'
  year: number  // Add year to the interface
  month1Entries: MonthlyPlanEntry[]  // All entries for month 1
  month2Entries: MonthlyPlanEntry[]  // All entries for month 2
  month3Entries: MonthlyPlanEntry[]  // All entries for month 3
  // Additional months for ALL (full year) view
  month4Entries?: MonthlyPlanEntry[]
  month5Entries?: MonthlyPlanEntry[]
  month6Entries?: MonthlyPlanEntry[]
  month7Entries?: MonthlyPlanEntry[]
  month8Entries?: MonthlyPlanEntry[]
  month9Entries?: MonthlyPlanEntry[]
  month10Entries?: MonthlyPlanEntry[]
  month11Entries?: MonthlyPlanEntry[]
  month12Entries?: MonthlyPlanEntry[]
  total: number
  notes: string
}

// Helper to get current quarter
const getCurrentQuarter = (): 'Q1' | 'Q2' | 'Q3' | 'Q4' => {
  const month = new Date().getMonth() + 1 // 1-12
  if (month <= 3) return 'Q1'
  if (month <= 6) return 'Q2'
  if (month <= 9) return 'Q3'
  return 'Q4'
}

export default function LiftingPlanPage() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const { showError } = useToast()
  const PRODUCT_FILTERS = ['GASOIL', 'JET A-1', 'FUEL OIL'] as const
  const [selectedQuarter, setSelectedQuarter] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>(getCurrentQuarter())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear()) // Default to current year
  const [selectedProduct, setSelectedProduct] = useState<string>('GASOIL') // Product filter - defaults to first tab
  const [customers, setCustomers] = useState<Customer[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [quarterlyPlans, setQuarterlyPlans] = useState<QuarterlyPlan[]>([])
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([])
  const [cargos, setCargos] = useState<Cargo[]>([])  // To track combi cargos
  const [contractData, setContractData] = useState<Map<number, ContractQuarterlyData>>(new Map())
  const [notes, setNotes] = useState<Map<number, string>>(new Map()) // contractId -> notes
  const [loading, setLoading] = useState(true)
  const [dataChangedNotification, setDataChangedNotification] = useState<string | null>(null)
  
  // Resizable columns state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    // Initialize with default widths from config
    const widths: Record<string, number> = {}
    COLUMN_CONFIG.forEach(col => {
      widths[col.id] = col.defaultWidth
    })
    return widths
  })
  const resizingRef = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null)
  
  // Handle column resize start
  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = columnWidths[columnId] || COLUMN_CONFIG.find(c => c.id === columnId)?.defaultWidth || 150
    resizingRef.current = { columnId, startX, startWidth }
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return
      const diff = moveEvent.clientX - resizingRef.current.startX
      const minWidth = COLUMN_CONFIG.find(c => c.id === resizingRef.current!.columnId)?.minWidth || 80
      const newWidth = Math.max(minWidth, resizingRef.current.startWidth + diff)
      setColumnWidths(prev => ({
        ...prev,
        [resizingRef.current!.columnId]: newWidth
      }))
    }
    
    const handleMouseUp = () => {
      resizingRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [columnWidths])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    // Calculate data when we have customers, contracts, and monthly plans
    // Note: quarterlyPlans may be empty for range contracts (they don't have quarterly plans)
    if (customers.length > 0 && contracts.length > 0 && monthlyPlans.length > 0) {
      calculateQuarterlyData()
    }
  }, [selectedQuarter, selectedYear, selectedProduct, customers, contracts, quarterlyPlans, monthlyPlans, cargos, notes])

  const loadData = async () => {
    try {
      setLoading(true)
      const [customersRes, contractsRes, cargosRes] = await Promise.all([
        customerAPI.getAll(),
        contractAPI.getAll(),
        cargoAPI.getAll({}),  // Load all cargos to check for combi groups
      ])
      setCustomers(customersRes.data || [])
      setContracts(contractsRes.data || [])
      setCargos(cargosRes.data || [])

      // Load all quarterly plans
      const quarterlyRes = await quarterlyPlanAPI.getAll()
      setQuarterlyPlans(quarterlyRes.data || [])

      // Load all monthly plans
      const monthlyRes = await monthlyPlanAPI.getAll()
      setMonthlyPlans(monthlyRes.data || [])
    } catch (error) {
      console.error('Error loading lifting plan data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Helper function to normalize product names to categories
  const normalizeProductCategory = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null
    const v = raw.trim()
    if (!v) return null
    const u = v.toUpperCase()
    if (u === 'GASOIL' || u === 'GASOIL 10PPM') return 'GASOIL'
    if (u === 'HFO' || u === 'LSFO') return 'FUEL OIL'
    if (u === 'JET A-1' || u === 'JET A1') return 'JET A-1'
    return v
  }

  // Helper to check if a product name matches a category filter
  const productMatchesCategory = (productName: string | undefined, category: string): boolean => {
    if (!productName) return false
    const normalizedProduct = normalizeProductCategory(productName)
    return normalizedProduct === category
  }

  const calculateQuarterlyData = () => {
    // Original Map key: contract.id (number)
    const dataMap = new Map<number, ContractQuarterlyData>()
    
    // Determine months for selected quarter
    const quarterMonths: Record<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4', number[]> = {
      ALL: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // Full Year
      Q1: [1, 2, 3],   // Jan, Feb, Mar
      Q2: [4, 5, 6],   // Apr, May, Jun
      Q3: [7, 8, 9],   // Jul, Aug, Sep
      Q4: [10, 11, 12], // Oct, Nov, Dec
    }
    const months = quarterMonths[selectedQuarter]

    // Process each contract
    contracts.forEach(contract => {
      // Collect all monthly plans for this contract
      // This includes both:
      // 1. Monthly plans linked via quarterly plans (fixed quantity contracts)
      // 2. Monthly plans linked directly to contract (range contracts without quarterly plans)
      const allContractMonthlyPlans: (MonthlyPlan & { productName?: string })[] = []

      // Find quarterly plans for this contract (if any)
      const contractQuarterlyPlans = quarterlyPlans.filter(qp => qp.contract_id === contract.id)

      // Get monthly plans via quarterly plans
      contractQuarterlyPlans.forEach(qp => {
        const qpMonthlyPlans = monthlyPlans.filter(mp =>
          mp.quarterly_plan_id === qp.id && mp.year === selectedYear
        )
        qpMonthlyPlans.forEach(mp => {
          allContractMonthlyPlans.push({
            ...mp,
            productName: mp.product_name || undefined
          })
        })
      })

      // Also get monthly plans directly linked to this contract (for range contracts)
      // These may not have a quarterly_plan_id
      const directMonthlyPlans = monthlyPlans.filter(mp =>
        mp.contract_id === contract.id &&
        mp.year === selectedYear &&
        !mp.quarterly_plan_id // Not already included via quarterly plans
      )
      directMonthlyPlans.forEach(mp => {
        allContractMonthlyPlans.push({
          ...mp,
          productName: mp.product_name || undefined
        })
      })
      
      const customer = customers.find(c => c.id === contract.customer_id)
      if (!customer) return

      // Collect actual product names and their categories
      const productNames: string[] = []
      const productCategories = new Set<string>()
      if (Array.isArray(contract.products)) {
        contract.products.forEach((p) => {
          const name = (p as any)?.name
          if (name) {
            productNames.push(name)
            const cat = normalizeProductCategory(name)
            if (cat) productCategories.add(cat)
          }
        })
      }
      
      // When a product filter is selected, show the actual product name(s) that match the filter
      let productsText: string
      if (selectedProduct) {
        // Find actual product names that match the selected category
        const matchingProducts = productNames.filter(name => 
          normalizeProductCategory(name) === selectedProduct
        )
        productsText = matchingProducts.length > 0 ? matchingProducts.join(', ') : '-'
      } else {
        productsText = productNames.length > 0 ? productNames.join(', ') : '-'
      }

      // Determine which products to show based on filter
      const displayProducts = selectedProduct
        ? productNames.filter(name => normalizeProductCategory(name) === selectedProduct)
        : productNames

      // Initialize contract entry if not exists
      if (!dataMap.has(contract.id)) {
        const baseEntry: ContractQuarterlyData = {
          customerId: contract.customer_id,
          customerName: customer.name,
          contractId: contract.id,
          contractNumber: contract.contract_number,
          productsText,
          products: displayProducts,
          contractType: contract.contract_type,
          year: selectedYear,
          month1Entries: [],
          month2Entries: [],
          month3Entries: [],
          total: 0,
          notes: notes.get(contract.id) || '',
        }
        // Add month 4-12 entries for ALL (full year) view
        if (selectedQuarter === 'ALL') {
          baseEntry.month4Entries = []
          baseEntry.month5Entries = []
          baseEntry.month6Entries = []
          baseEntry.month7Entries = []
          baseEntry.month8Entries = []
          baseEntry.month9Entries = []
          baseEntry.month10Entries = []
          baseEntry.month11Entries = []
          baseEntry.month12Entries = []
        }
        dataMap.set(contract.id, baseEntry)
      }
      
      const contractData = dataMap.get(contract.id)!
      
      // Filter monthly plans to only those for the selected quarter months
      const filteredMonthlyPlans = allContractMonthlyPlans.filter(mp => 
        months.includes(mp.month)
      )

        // Group monthly plans by combi_group_id
        const combiGroups = new Map<string, (MonthlyPlan & { productName?: string })[]>()
        const nonCombiPlans: (MonthlyPlan & { productName?: string })[] = []
        
        filteredMonthlyPlans.forEach(mp => {
          if (mp.combi_group_id) {
            const existing = combiGroups.get(mp.combi_group_id) || []
            existing.push(mp)
            combiGroups.set(mp.combi_group_id, existing)
          } else {
            nonCombiPlans.push(mp)
          }
        })

        // Process combi groups - create one unified entry per group
        combiGroups.forEach((combiPlans, combiGroupId) => {
        if (combiPlans.length === 0) return
        
        // All plans in a combi group should have the same month, laycan, etc.
        const firstPlan = combiPlans[0]
        const monthIndex = months.indexOf(firstPlan.month)
        if (monthIndex === -1) return

        // Collect all product quantities in the combi group
        const allCombiProducts = combiPlans.map(mp => ({
          productName: mp.productName || 'Unknown',
          quantity: mp.month_quantity,
          topupQuantity: (mp as any).authority_topup_quantity || 0
        }))
        
        // Calculate total top-up for the combi group
        const totalTopup = combiPlans.reduce((sum, mp) => sum + ((mp as any).authority_topup_quantity || 0), 0)

        // If a product filter is selected, check if this combi contains the filtered product
        if (selectedProduct) {
          const matchingProduct = allCombiProducts.find(cp => productMatchesCategory(cp.productName, selectedProduct))
          if (!matchingProduct) return // Skip this combi if it doesn't contain the filtered product
          
          // Only show the filtered product's quantity, but indicate it's part of a combi
          const entry: MonthlyPlanEntry = {
            monthlyPlanId: firstPlan.id,
            month: firstPlan.month,
            quantity: matchingProduct.quantity,  // Only the filtered product's quantity
            laycan5Days: contract.contract_type === 'FOB' ? (firstPlan.laycan_5_days || undefined) : undefined,
            laycan2Days: contract.contract_type === 'FOB' ? (firstPlan.laycan_2_days || undefined) : undefined,
            loadingMonth: contract.contract_type === 'CIF' ? (firstPlan.loading_month || undefined) : undefined,
            loadingWindow: contract.contract_type === 'CIF' ? (firstPlan.loading_window || undefined) : undefined,
            deliveryMonth: contract.contract_type === 'CIF' ? (firstPlan.delivery_month || undefined) : undefined,
            deliveryWindow: contract.contract_type === 'CIF' ? (firstPlan.delivery_window || undefined) : undefined,
            isCombi: true,
            combiGroupId,
            combiProducts: undefined,  // Don't show other products when filtered
            topupQuantity: matchingProduct.topupQuantity,  // Only the filtered product's top-up
          }

          // Helper to add entry to correct month array
          const addToMonth = (idx: number, e: MonthlyPlanEntry) => {
            if (idx === 0) contractData.month1Entries.push(e)
            else if (idx === 1) contractData.month2Entries.push(e)
            else if (idx === 2) contractData.month3Entries.push(e)
            else if (idx === 3 && contractData.month4Entries) contractData.month4Entries.push(e)
            else if (idx === 4 && contractData.month5Entries) contractData.month5Entries.push(e)
            else if (idx === 5 && contractData.month6Entries) contractData.month6Entries.push(e)
            else if (idx === 6 && contractData.month7Entries) contractData.month7Entries.push(e)
            else if (idx === 7 && contractData.month8Entries) contractData.month8Entries.push(e)
            else if (idx === 8 && contractData.month9Entries) contractData.month9Entries.push(e)
            else if (idx === 9 && contractData.month10Entries) contractData.month10Entries.push(e)
            else if (idx === 10 && contractData.month11Entries) contractData.month11Entries.push(e)
            else if (idx === 11 && contractData.month12Entries) contractData.month12Entries.push(e)
          }

          addToMonth(monthIndex, entry)
        } else {
          // No filter - show all products in the combi
          const totalQuantity = combiPlans.reduce((sum, mp) => sum + mp.month_quantity, 0)

          const entry: MonthlyPlanEntry = {
            monthlyPlanId: firstPlan.id,  // Use first plan's ID as reference
            month: firstPlan.month,
            quantity: totalQuantity,
            laycan5Days: contract.contract_type === 'FOB' ? (firstPlan.laycan_5_days || undefined) : undefined,
            laycan2Days: contract.contract_type === 'FOB' ? (firstPlan.laycan_2_days || undefined) : undefined,
            loadingMonth: contract.contract_type === 'CIF' ? (firstPlan.loading_month || undefined) : undefined,
            loadingWindow: contract.contract_type === 'CIF' ? (firstPlan.loading_window || undefined) : undefined,
            deliveryMonth: contract.contract_type === 'CIF' ? (firstPlan.delivery_month || undefined) : undefined,
            deliveryWindow: contract.contract_type === 'CIF' ? (firstPlan.delivery_window || undefined) : undefined,
            isCombi: true,
            combiGroupId,
            combiProducts: allCombiProducts,
            topupQuantity: totalTopup,
          }

          // Helper to add entry to correct month array
          const addToMonth = (idx: number, e: MonthlyPlanEntry) => {
            if (idx === 0) contractData.month1Entries.push(e)
            else if (idx === 1) contractData.month2Entries.push(e)
            else if (idx === 2) contractData.month3Entries.push(e)
            else if (idx === 3 && contractData.month4Entries) contractData.month4Entries.push(e)
            else if (idx === 4 && contractData.month5Entries) contractData.month5Entries.push(e)
            else if (idx === 5 && contractData.month6Entries) contractData.month6Entries.push(e)
            else if (idx === 6 && contractData.month7Entries) contractData.month7Entries.push(e)
            else if (idx === 7 && contractData.month8Entries) contractData.month8Entries.push(e)
            else if (idx === 8 && contractData.month9Entries) contractData.month9Entries.push(e)
            else if (idx === 9 && contractData.month10Entries) contractData.month10Entries.push(e)
            else if (idx === 10 && contractData.month11Entries) contractData.month11Entries.push(e)
            else if (idx === 11 && contractData.month12Entries) contractData.month12Entries.push(e)
          }

          addToMonth(monthIndex, entry)
        }
      })

        // Process non-combi plans individually
        nonCombiPlans.forEach(mp => {
        // If a product filter is selected, skip plans that don't match the category
        if (selectedProduct && !productMatchesCategory(mp.productName, selectedProduct)) return

        const monthIndex = months.indexOf(mp.month)
        if (monthIndex === -1) return

              const entry: MonthlyPlanEntry = {
                monthlyPlanId: mp.id,
                month: mp.month,
                quantity: mp.month_quantity,
                laycan5Days: contract.contract_type === 'FOB' ? (mp.laycan_5_days || undefined) : undefined,
                laycan2Days: contract.contract_type === 'FOB' ? (mp.laycan_2_days || undefined) : undefined,
          loadingMonth: contract.contract_type === 'CIF' ? (mp.loading_month || undefined) : undefined,
                loadingWindow: contract.contract_type === 'CIF' ? (mp.loading_window || undefined) : undefined,
          deliveryMonth: contract.contract_type === 'CIF' ? (mp.delivery_month || undefined) : undefined,
                deliveryWindow: contract.contract_type === 'CIF' ? (mp.delivery_window || undefined) : undefined,
          isCombi: false,
          topupQuantity: (mp as any).authority_topup_quantity || 0,
              }

          // Helper to add entry to correct month array
          const addToMonth = (idx: number, e: MonthlyPlanEntry) => {
            if (idx === 0) contractData.month1Entries.push(e)
            else if (idx === 1) contractData.month2Entries.push(e)
            else if (idx === 2) contractData.month3Entries.push(e)
            else if (idx === 3 && contractData.month4Entries) contractData.month4Entries.push(e)
            else if (idx === 4 && contractData.month5Entries) contractData.month5Entries.push(e)
            else if (idx === 5 && contractData.month6Entries) contractData.month6Entries.push(e)
            else if (idx === 6 && contractData.month7Entries) contractData.month7Entries.push(e)
            else if (idx === 7 && contractData.month8Entries) contractData.month8Entries.push(e)
            else if (idx === 8 && contractData.month9Entries) contractData.month9Entries.push(e)
            else if (idx === 9 && contractData.month10Entries) contractData.month10Entries.push(e)
            else if (idx === 10 && contractData.month11Entries) contractData.month11Entries.push(e)
            else if (idx === 11 && contractData.month12Entries) contractData.month12Entries.push(e)
          }

          addToMonth(monthIndex, entry)
        })
              
        // Calculate total (include months 4-12 for ALL view)
        contractData.total =
          contractData.month1Entries.reduce((sum, e) => sum + e.quantity, 0) +
          contractData.month2Entries.reduce((sum, e) => sum + e.quantity, 0) +
          contractData.month3Entries.reduce((sum, e) => sum + e.quantity, 0) +
          (contractData.month4Entries?.reduce((sum, e) => sum + e.quantity, 0) || 0) +
          (contractData.month5Entries?.reduce((sum, e) => sum + e.quantity, 0) || 0) +
          (contractData.month6Entries?.reduce((sum, e) => sum + e.quantity, 0) || 0) +
          (contractData.month7Entries?.reduce((sum, e) => sum + e.quantity, 0) || 0) +
          (contractData.month8Entries?.reduce((sum, e) => sum + e.quantity, 0) || 0) +
          (contractData.month9Entries?.reduce((sum, e) => sum + e.quantity, 0) || 0) +
          (contractData.month10Entries?.reduce((sum, e) => sum + e.quantity, 0) || 0) +
          (contractData.month11Entries?.reduce((sum, e) => sum + e.quantity, 0) || 0) +
          (contractData.month12Entries?.reduce((sum, e) => sum + e.quantity, 0) || 0)
    })

    setContractData(dataMap)
  }

  const handleNotesChange = (contractId: number, value: string) => {
    const newNotes = new Map(notes)
    newNotes.set(contractId, value)
    setNotes(newNotes)
    
    // Update contract data for all contract-year combinations
    const updatedData = new Map(contractData)
    updatedData.forEach((data, key) => {
      if (data.contractId === contractId) {
        data.notes = value
        updatedData.set(key, data)
      }
    })
    setContractData(updatedData)
  }


  const getMonthName = (quarter: 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4', index: number): string => {
    const monthNames: Record<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4', string[]> = {
      ALL: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      Q1: ['January', 'February', 'March'],
      Q2: ['April', 'May', 'June'],
      Q3: ['July', 'August', 'September'],
      Q4: ['October', 'November', 'December'],
    }
    return monthNames[quarter][index]
  }

  const getFilteredDataArray = (): ContractQuarterlyData[] => {
    let result = Array.from(contractData.values())
      // Only show contracts that have entries for the selected product and selected quarter
      .filter((d) => {
        // Show contracts that have data for any month or have a total
        const hasMonth1to3 = d.month1Entries.length > 0 || d.month2Entries.length > 0 || d.month3Entries.length > 0
        const hasMonth4to12 = (d.month4Entries?.length || 0) > 0 || (d.month5Entries?.length || 0) > 0 ||
          (d.month6Entries?.length || 0) > 0 || (d.month7Entries?.length || 0) > 0 ||
          (d.month8Entries?.length || 0) > 0 || (d.month9Entries?.length || 0) > 0 ||
          (d.month10Entries?.length || 0) > 0 || (d.month11Entries?.length || 0) > 0 ||
          (d.month12Entries?.length || 0) > 0
        return hasMonth1to3 || hasMonth4to12 || d.total > 0
      })
      .sort((a, b) => {
        const customerCompare = a.customerName.localeCompare(b.customerName)
        if (customerCompare !== 0) return customerCompare
        return a.contractNumber.localeCompare(b.contractNumber)
      })

    return result
  }

  const handleExportToExcel = () => {
    // Dynamic import of xlsx-js-style for styled Excel export
    import('xlsx-js-style').then((XLSX) => {
      const dataArray = getFilteredDataArray()
      const isFullYear = selectedQuarter === 'ALL'
      const monthCount = isFullYear ? 12 : 3

      // Helper to get month entries array
      const getMonthEntriesArray = (data: ContractQuarterlyData): MonthlyPlanEntry[][] => [
        data.month1Entries,
        data.month2Entries,
        data.month3Entries,
        data.month4Entries || [],
        data.month5Entries || [],
        data.month6Entries || [],
        data.month7Entries || [],
        data.month8Entries || [],
        data.month9Entries || [],
        data.month10Entries || [],
        data.month11Entries || [],
        data.month12Entries || [],
      ]

      // Helper to format entry with combi info
      const formatEntry = (entry: MonthlyPlanEntry, contractType: string) => {
        let result = `${entry.quantity.toLocaleString()} KT`

        if (entry.isCombi && entry.combiProducts && entry.combiProducts.length > 0) {
          result += ' [Combi]'
          const productDetails = entry.combiProducts.map(cp => `${cp.productName}: ${cp.quantity.toLocaleString()} KT`).join(', ')
          result += `\n(${productDetails})`
        }

        if (contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) {
          if (entry.laycan5Days) result += `\n5 Days: ${entry.laycan5Days}`
          if (entry.laycan2Days) result += `\n2 Days: ${entry.laycan2Days}`
        }

        if (contractType === 'CIF' && (entry.loadingMonth || entry.loadingWindow || entry.deliveryMonth || entry.deliveryWindow)) {
          const parts: string[] = []
          if (entry.loadingMonth || entry.loadingWindow) {
            parts.push(`Loading: ${[entry.loadingMonth, entry.loadingWindow].filter(Boolean).join(' - ')}`)
          }
          if (entry.deliveryMonth || entry.deliveryWindow) {
            parts.push(`Delivery: ${[entry.deliveryMonth, entry.deliveryWindow].filter(Boolean).join(' - ')}`)
          }
          if (parts.length > 0) result += `\n${parts.join('\n')}`
        }

        return result
      }

      // Build headers
      const headers = ['Customer', 'Contract Number', 'Product(s)', 'Type']
      for (let i = 0; i < monthCount; i++) {
        headers.push(getMonthName(selectedQuarter, i))
      }
      headers.push(`Total (${selectedQuarter === 'ALL' ? 'Year' : selectedQuarter})`)
      headers.push('Remark')

      // Styles
      const titleStyle = {
        font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1E40AF' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      }
      const headerStyle = {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '3B82F6' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
      }
      const cellStyle = {
        font: { sz: 10 },
        alignment: { vertical: 'top', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: 'D1D5DB' } },
          bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
          left: { style: 'thin', color: { rgb: 'D1D5DB' } },
          right: { style: 'thin', color: { rgb: 'D1D5DB' } },
        },
      }
      const altRowStyle = {
        ...cellStyle,
        fill: { fgColor: { rgb: 'F8FAFC' } },
      }
      const totalCellStyle = {
        ...cellStyle,
        font: { bold: true, sz: 10 },
        fill: { fgColor: { rgb: 'EFF6FF' } },
      }
      const summaryStyle = {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1E40AF' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'medium', color: { rgb: '000000' } },
          bottom: { style: 'medium', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
      }

      // Build worksheet data
      const wsData: any[][] = []

      // Title row
      const titleText = `Lifting Plan - ${selectedQuarter === 'ALL' ? 'Full Year' : selectedQuarter} ${selectedYear} - ${selectedProduct}`
      wsData.push([{ v: titleText, s: titleStyle }])

      // Subtitle row
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      wsData.push([{ v: `Generated: ${dateStr}`, s: { font: { italic: true, sz: 9, color: { rgb: '6B7280' } } } }])

      // Empty row
      wsData.push([])

      // Header row
      wsData.push(headers.map(h => ({ v: h, s: headerStyle })))

      // Data rows
      let grandTotal = 0
      dataArray.forEach((data, rowIndex) => {
        const monthEntries = getMonthEntriesArray(data)
        const rowStyle = rowIndex % 2 === 0 ? cellStyle : altRowStyle

        const row: any[] = [
          { v: data.customerName, s: rowStyle },
          { v: data.contractNumber, s: rowStyle },
          { v: data.productsText || '-', s: rowStyle },
          { v: data.contractType, s: { ...rowStyle, alignment: { horizontal: 'center', vertical: 'top' } } },
        ]

        // Month columns
        for (let i = 0; i < monthCount; i++) {
          const entries = monthEntries[i]
          const monthText = entries.length > 0 ? entries.map(e => formatEntry(e, data.contractType)).join('\n\n') : '-'
          row.push({ v: monthText, s: rowStyle })
        }

        // Total column
        row.push({ v: `${data.total.toLocaleString()} KT`, s: totalCellStyle })
        grandTotal += data.total

        // Remark column
        row.push({ v: data.notes || '', s: rowStyle })

        wsData.push(row)
      })

      // Summary row
      const summaryRow: any[] = [
        { v: 'GRAND TOTAL', s: summaryStyle },
        { v: '', s: summaryStyle },
        { v: '', s: summaryStyle },
        { v: '', s: summaryStyle },
      ]
      for (let i = 0; i < monthCount; i++) {
        summaryRow.push({ v: '', s: summaryStyle })
      }
      summaryRow.push({ v: `${grandTotal.toLocaleString()} KT`, s: summaryStyle })
      summaryRow.push({ v: '', s: summaryStyle })
      wsData.push(summaryRow)

      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(wsData)

      // Merge title cell
      const totalCols = headers.length
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }, // Title row
        { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }, // Subtitle row
        { s: { r: wsData.length - 1, c: 0 }, e: { r: wsData.length - 1, c: 3 } }, // Summary label
      ]

      // Set column widths
      const baseColWidths = [
        { wch: 22 }, // Customer
        { wch: 18 }, // Contract Number
        { wch: 18 }, // Products
        { wch: 8 },  // Type
      ]
      const monthColWidths = Array(monthCount).fill({ wch: isFullYear ? 20 : 28 })
      const endColWidths = [
        { wch: 16 }, // Total
        { wch: 25 }, // Remark
      ]
      ws['!cols'] = [...baseColWidths, ...monthColWidths, ...endColWidths]

      // Set row heights
      ws['!rows'] = [
        { hpt: 30 }, // Title
        { hpt: 18 }, // Subtitle
        { hpt: 10 }, // Empty
        { hpt: 35 }, // Headers
      ]
      // Data rows - taller for wrapped text
      for (let i = 0; i < dataArray.length; i++) {
        ws['!rows'].push({ hpt: 60 })
      }
      ws['!rows'].push({ hpt: 25 }) // Summary row

      // Create workbook
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Lifting Plan')

      // Generate filename
      const fileDateStr = new Date().toISOString().split('T')[0]
      const filename = `Lifting_Plan_${selectedQuarter}_${selectedYear}_${fileDateStr}.xlsx`

      // Save file
      XLSX.writeFile(wb, filename)
    }).catch((error) => {
      console.error('Error exporting to Excel:', error)
      showError('Error exporting to Excel. Please make sure the xlsx-js-style package is installed.')
    })
  }

  const handleExportToPDF = async () => {
    try {
      // Dynamic import of jsPDF and jspdf-autotable
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const dataArray = getFilteredDataArray()
      const isFullYear = selectedQuarter === 'ALL'
      const monthCount = isFullYear ? 12 : 3

      // Helper to get month entries array
      const getMonthEntriesArray = (data: ContractQuarterlyData): MonthlyPlanEntry[][] => [
        data.month1Entries,
        data.month2Entries,
        data.month3Entries,
        data.month4Entries || [],
        data.month5Entries || [],
        data.month6Entries || [],
        data.month7Entries || [],
        data.month8Entries || [],
        data.month9Entries || [],
        data.month10Entries || [],
        data.month11Entries || [],
        data.month12Entries || [],
      ]

      // Use larger page for full year view
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: isFullYear ? 'a3' : 'a4'
      })

      // Add title
      doc.setFontSize(16)
      doc.text(`Lifting Plan - ${selectedQuarter === 'ALL' ? 'Full Year' : selectedQuarter} ${selectedYear}`, 14, 15)

      // Prepare table data
      const tableData = dataArray.map((data) => {
        // Helper to format entry (compact for full year)
        const formatEntry = (entry: MonthlyPlanEntry) => {
          if (isFullYear) {
            return `${entry.quantity.toLocaleString()}${entry.isCombi ? ' C' : ''}`
          }

          let result = `${entry.quantity.toLocaleString()} KT`

          if (entry.isCombi && entry.combiProducts && entry.combiProducts.length > 0) {
            result += ' [Combie]'
            const productDetails = entry.combiProducts.map(cp => `${cp.productName}: ${cp.quantity.toLocaleString()} KT`).join('\n')
            result += `\n(${productDetails})`
          }

          if (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) {
            const parts: string[] = []
            if (entry.laycan5Days) parts.push(`5 Days: ${entry.laycan5Days}`)
            if (entry.laycan2Days) parts.push(`2 Days: ${entry.laycan2Days}`)
            if (parts.length > 0) result += `\n${parts.join('\n')}`
          }

          if (data.contractType === 'CIF' && (entry.loadingWindow || entry.deliveryWindow)) {
            const parts: string[] = []
            if (entry.loadingWindow) parts.push(`Loading: ${entry.loadingWindow}`)
            if (entry.deliveryWindow) parts.push(`Delivery: ${entry.deliveryWindow}`)
            if (parts.length > 0) result += `\n${parts.join('\n')}`
          }

          return result
        }

        const monthEntries = getMonthEntriesArray(data)
        const row: string[] = [
          data.customerName,
          data.contractNumber,
          data.productsText || '-',
          data.contractType,
        ]

        // Add month data dynamically
        for (let i = 0; i < monthCount; i++) {
          const entries = monthEntries[i]
          const monthText = entries.length > 0 ? entries.map(formatEntry).join('\n') : '-'
          row.push(monthText)
        }

        row.push(`${data.total.toLocaleString()} KT`)
        row.push(data.notes || '')

        return row
      })

      // Build headers dynamically
      const headers = ['Customer', 'Contract Number', 'Product(s)', 'Type']
      for (let i = 0; i < monthCount; i++) {
        headers.push(getMonthName(selectedQuarter, i))
      }
      headers.push(`Total (${selectedQuarter === 'ALL' ? 'Year' : selectedQuarter})`)
      headers.push('Remark')

      // Build column styles dynamically
      const columnStyles: Record<number, { cellWidth: number }> = {
        0: { cellWidth: isFullYear ? 30 : 35 },
        1: { cellWidth: isFullYear ? 25 : 30 },
        2: { cellWidth: isFullYear ? 25 : 35 },
        3: { cellWidth: isFullYear ? 12 : 20 },
      }
      for (let i = 0; i < monthCount; i++) {
        columnStyles[4 + i] = { cellWidth: isFullYear ? 18 : 30 }
      }
      columnStyles[4 + monthCount] = { cellWidth: isFullYear ? 20 : 25 }
      columnStyles[5 + monthCount] = { cellWidth: isFullYear ? 30 : 40 }

      // Add table using autoTable
      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: 25,
        styles: { fontSize: isFullYear ? 6 : 8 },
        headStyles: { fillColor: [25, 118, 210], textColor: 255, fontStyle: 'bold' },
        columnStyles,
      })

      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0]
      const filename = `Lifting_Plan_${selectedQuarter}_${selectedYear}_${dateStr}.pdf`

      // Save file
      doc.save(filename)
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      showError(`Error exporting to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const renderTable = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )
    }

    const dataArray = getFilteredDataArray()

    if (dataArray.length === 0) {
      return (
        <Typography variant="body1" color="text.secondary" sx={{ p: 2 }}>
          {selectedProduct ? `No contracts found for product: ${selectedProduct}` : 'No contracts found'}
        </Typography>
      )
    }

    // Determine column config based on view mode
    const isFullYear = selectedQuarter === 'ALL'
    const monthColumns = isFullYear ? MONTH_COLUMN_CONFIG_12 : MONTH_COLUMN_CONFIG_3
    const allColumns = [...BASE_COLUMN_CONFIG, ...monthColumns, ...END_COLUMN_CONFIG]

    // Helper to get month entries for a given month index (0-11)
    const getMonthEntries = (data: ContractQuarterlyData, monthIndex: number): MonthlyPlanEntry[] => {
      const monthArrays = [
        data.month1Entries,
        data.month2Entries,
        data.month3Entries,
        data.month4Entries || [],
        data.month5Entries || [],
        data.month6Entries || [],
        data.month7Entries || [],
        data.month8Entries || [],
        data.month9Entries || [],
        data.month10Entries || [],
        data.month11Entries || [],
        data.month12Entries || [],
      ]
      return monthArrays[monthIndex]
    }

    // Helper to render resizable header cell
    const renderResizableHeader = (columnId: string, label: string) => {
      const colConfig = allColumns.find(c => c.id === columnId)
      return (
        <TableCell
          key={columnId}
          sx={{
            width: columnWidths[columnId] || colConfig?.defaultWidth || 100,
            minWidth: colConfig?.minWidth || 80,
            fontWeight: 'bold',
            position: 'relative',
            userSelect: 'none',
            fontSize: isFullYear ? '0.75rem' : undefined,
            px: isFullYear ? 1 : undefined,
            '&:hover .resize-handle': {
              opacity: 1,
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{label}</span>
            <Box
              className="resize-handle"
              onMouseDown={(e) => handleResizeStart(e, columnId)}
              sx={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 6,
                cursor: 'col-resize',
                opacity: 0,
                transition: 'opacity 0.2s',
                '&:hover': {
                  opacity: 1,
                  bgcolor: 'primary.main',
                },
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  right: 2,
                  top: '25%',
                  bottom: '25%',
                  width: 2,
                  bgcolor: 'divider',
                  borderRadius: 1,
                },
              }}
            />
          </Box>
        </TableCell>
      )
    }

    // Helper to render month entries (full details for all views)
    const renderMonthCell = (data: ContractQuarterlyData, monthIndex: number, columnId: string) => {
      const entries = getMonthEntries(data, monthIndex)
      const colConfig = allColumns.find(c => c.id === columnId)

      // Full detailed rendering for all views
      return (
        <TableCell key={columnId} sx={{ width: columnWidths[columnId] || colConfig?.defaultWidth || 150, fontSize: isFullYear ? '0.75rem' : undefined }}>
          <Box>
            {entries.length === 0 ? (
              <Typography variant="body2" color="text.secondary">-</Typography>
            ) : (
              entries.map((entry, idx) => (
                <Box key={entry.isCombi ? entry.combiGroupId : entry.monthlyPlanId} sx={{ mb: idx < entries.length - 1 ? 1.5 : 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={entry.isCombi ? 600 : 400}>
                      {entry.quantity.toLocaleString()} KT
                    </Typography>
                    {entry.isCombi && (
                      <Chip
                        label="Combie"
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          bgcolor: BADGE_COLORS.COMBI.bgcolor,
                          color: BADGE_COLORS.COMBI.color,
                          fontWeight: 600,
                        }}
                      />
                    )}
                  </Box>
                  {!entry.isCombi && (entry.topupQuantity || 0) > 0 && (
                    <Typography variant="caption" sx={{ display: 'block', color: '#10B981', mb: 0.5 }}>
                      ({(entry.quantity - (entry.topupQuantity || 0)).toLocaleString()} + {entry.topupQuantity?.toLocaleString()} top-up)
                    </Typography>
                  )}
                  {entry.isCombi && entry.combiProducts && entry.combiProducts.length > 0 && (
                    <Box sx={{ mb: 0.5, pl: 0.5 }}>
                      {entry.combiProducts.map((cp, cpIdx) => (
                        <Box key={cpIdx}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'inline' }}>
                            • {cp.productName}: {cp.quantity.toLocaleString()} KT
                          </Typography>
                          {(cp.topupQuantity || 0) > 0 && (
                            <Typography variant="caption" sx={{ color: '#10B981', ml: 0.5 }}>
                              (+{cp.topupQuantity?.toLocaleString()} top-up)
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                  {entry.isCombi && (entry.topupQuantity || 0) > 0 && (
                    <Typography variant="caption" sx={{ display: 'block', color: '#10B981', mb: 0.5 }}>
                      Total incl. {entry.topupQuantity?.toLocaleString()} top-up
                    </Typography>
                  )}
                  {data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days) && (
                    <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                      {entry.laycan5Days && (
                        <Typography variant="caption" color="text.secondary">
                          5 Days: {entry.laycan5Days}
                        </Typography>
                      )}
                      {entry.laycan2Days && (
                        <Typography variant="caption" color="text.secondary">
                          2 Days: {entry.laycan2Days}
                        </Typography>
                      )}
                    </Box>
                  )}
                  {data.contractType === 'CIF' && (entry.loadingMonth || entry.loadingWindow || entry.deliveryMonth || entry.deliveryWindow) && (
                    <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                      {(entry.loadingMonth || entry.loadingWindow) && (
                        <Typography variant="caption" color="text.secondary">
                          Loading: {[entry.loadingMonth, entry.loadingWindow].filter(Boolean).join(' - ')}
                        </Typography>
                      )}
                      {(entry.deliveryMonth || entry.deliveryWindow) && (
                        <Typography variant="caption" color="text.secondary">
                          Delivery: {[entry.deliveryMonth, entry.deliveryWindow].filter(Boolean).join(' - ')}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              ))
            )}
          </Box>
        </TableCell>
      )
    }

    const monthCount = isFullYear ? 12 : 3

    return (
      <TableContainer
        component={Paper}
        sx={{
          maxWidth: '100%',
          overflowX: 'auto',
          '& .MuiTable-root': {
            minWidth: isFullYear ? 1800 : (isMobile ? 1100 : 'auto'),
            tableLayout: 'fixed',
          },
        }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              {renderResizableHeader('customer', 'Customer')}
              {renderResizableHeader('contract', 'Contract Number')}
              {renderResizableHeader('products', 'Product(s)')}
              {renderResizableHeader('type', 'Type')}
              {monthColumns.map((col, idx) =>
                renderResizableHeader(col.id, getMonthName(selectedQuarter, idx))
              )}
              {renderResizableHeader('total', `Total (${selectedQuarter === 'ALL' ? 'Year' : selectedQuarter})`)}
              {renderResizableHeader('remark', 'Remark')}
            </TableRow>
          </TableHead>
          <TableBody>
            {dataArray.map((data) => (
              <TableRow
                key={data.contractId}
                sx={{
                  '& td': {
                    minHeight: isMobile ? 56 : 48,
                    py: isFullYear ? 0.5 : (isMobile ? 1.5 : 1),
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }
                }}
              >
                <TableCell sx={{ fontWeight: 'medium', width: columnWidths['customer'], fontSize: isFullYear ? '0.8rem' : undefined }}>{data.customerName}</TableCell>
                <TableCell sx={{ width: columnWidths['contract'], fontSize: isFullYear ? '0.75rem' : undefined }}>{data.contractNumber}</TableCell>
                <TableCell sx={{ width: columnWidths['products'] }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {data.products.length > 0 ? data.products.map((product, idx) => (
                      <Chip
                        key={idx}
                        label={product}
                        size="small"
                        sx={{ height: isFullYear ? 18 : 22, fontSize: isFullYear ? '0.6rem' : '0.7rem', fontWeight: 500, ...getProductColor(product) }}
                      />
                    )) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell sx={{ width: columnWidths['type'] }}>
                  <Chip
                    label={data.contractType}
                    size="small"
                    sx={{ ...getContractTypeColor(data.contractType), height: isFullYear ? 18 : undefined, fontSize: isFullYear ? '0.65rem' : undefined }}
                  />
                </TableCell>
                {Array.from({ length: monthCount }, (_, idx) =>
                  renderMonthCell(data, idx, `month${idx + 1}`)
                )}
                <TableCell sx={{ fontWeight: 'bold', width: columnWidths['total'], fontSize: isFullYear ? '0.8rem' : undefined }}>{data.total.toLocaleString()} KT</TableCell>
                <TableCell sx={{ width: columnWidths['remark'] }}>
                  <TextField
                    value={data.notes}
                    onChange={(e) => handleNotesChange(data.contractId, e.target.value)}
                    placeholder="Add remark..."
                    size="small"
                    fullWidth
                    multiline
                    maxRows={2}
                    sx={{
                      '& .MuiInputBase-root': {
                        fontSize: isFullYear ? '0.75rem' : (isMobile ? '0.875rem' : '0.9375rem'),
                      },
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  // Get product tab color
  const getProductTabColor = (product: string) => {
    switch (product) {
      case 'GASOIL': return { active: '#F59E0B', hover: '#D97706' }
      case 'JET A-1': return { active: '#3B82F6', hover: '#2563EB' }
      case 'FUEL OIL': return { active: '#8B5CF6', hover: '#7C3AED' }
      default: return { active: '#3B82F6', hover: '#2563EB' }
    }
  }

  const productColor = getProductTabColor(selectedProduct)

  return (
    <Box>
      {/* Notification when another user makes changes */}
      <Snackbar
        open={!!dataChangedNotification}
        autoHideDuration={5000}
        onClose={() => setDataChangedNotification(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity="info"
          onClose={() => setDataChangedNotification(null)}
          sx={{ width: '100%' }}
        >
          {dataChangedNotification} - Data may have changed. Consider refreshing.
        </Alert>
      </Snackbar>

      {/* Modern Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
            }}
          >
            <CalendarMonth sx={{ color: 'white', fontSize: 26 }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E293B', letterSpacing: '-0.02em' }}>
              Lifting Plan
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748B' }}>
              {selectedQuarter === 'ALL' ? 'Annual summary by product' : 'Quarterly summary by product'}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Modern Filter Bar */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          p: 2,
          borderRadius: 3,
          border: '1px solid #E2E8F0',
          background: 'linear-gradient(135deg, #FAFBFC 0%, #F8FAFC 100%)',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}>
          {/* Year Navigator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              size="small"
              onClick={() => setSelectedYear(selectedYear - 1)}
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'white',
                border: '1px solid #E2E8F0',
                '&:hover': { bgcolor: '#F1F5F9', borderColor: '#CBD5E1' },
              }}
            >
              <ChevronLeft sx={{ fontSize: 18, color: '#64748B' }} />
            </IconButton>
            <Box
              sx={{
                px: 2.5,
                py: 0.75,
                borderRadius: 2,
                bgcolor: 'white',
                border: '1px solid #E2E8F0',
                minWidth: 80,
                textAlign: 'center',
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1E293B', letterSpacing: '-0.01em' }}>
                {selectedYear}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() => setSelectedYear(selectedYear + 1)}
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'white',
                border: '1px solid #E2E8F0',
                '&:hover': { bgcolor: '#F1F5F9', borderColor: '#CBD5E1' },
              }}
            >
              <ChevronRight sx={{ fontSize: 18, color: '#64748B' }} />
            </IconButton>
          </Box>

          {/* Quarter Pills */}
          <Box sx={{ display: 'flex', gap: 0.75, justifyContent: { xs: 'flex-start', md: 'center' }, flex: 1 }}>
            {(['ALL', 'Q1', 'Q2', 'Q3', 'Q4'] as const).map((quarter) => {
              const isSelected = selectedQuarter === quarter
              const quarterLabels: Record<string, string> = { ALL: 'Full Year', Q1: 'Jan-Mar', Q2: 'Apr-Jun', Q3: 'Jul-Sep', Q4: 'Oct-Dec' }
              return (
                <Box
                  key={quarter}
                  onClick={() => setSelectedQuarter(quarter)}
                  sx={{
                    px: quarter === 'ALL' ? 1.5 : 2,
                    py: 0.75,
                    borderRadius: 2,
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                    border: isSelected ? '1.5px solid #3B82F6' : '1px solid #E2E8F0',
                    bgcolor: isSelected ? '#3B82F6' : 'white',
                    color: isSelected ? 'white' : '#64748B',
                    '&:hover': {
                      transform: 'scale(1.03)',
                      boxShadow: isSelected ? '0 2px 8px rgba(59, 130, 246, 0.35)' : '0 2px 8px rgba(0,0,0,0.08)',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
                    <span>{quarter}</span>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.8, mt: 0.25 }}>
                      {quarterLabels[quarter]}
                    </Typography>
                  </Box>
                </Box>
              )
            })}
          </Box>

          {/* Export Buttons */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownload sx={{ fontSize: 16 }} />}
              onClick={handleExportToExcel}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8125rem',
                px: 2,
                py: 0.75,
                borderColor: '#E2E8F0',
                color: '#475569',
                bgcolor: 'white',
                '&:hover': {
                  borderColor: '#10B981',
                  bgcolor: '#ECFDF5',
                  color: '#059669',
                },
              }}
            >
              Excel
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PictureAsPdf sx={{ fontSize: 16 }} />}
              onClick={handleExportToPDF}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8125rem',
                px: 2,
                py: 0.75,
                borderColor: '#E2E8F0',
                color: '#475569',
                bgcolor: 'white',
                '&:hover': {
                  borderColor: '#EF4444',
                  bgcolor: '#FEF2F2',
                  color: '#DC2626',
                },
              }}
            >
              PDF
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Product Tabs */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ borderBottom: '1px solid #E2E8F0', bgcolor: '#FAFBFC' }}>
          <Tabs
            value={PRODUCT_FILTERS.indexOf(selectedProduct as typeof PRODUCT_FILTERS[number])}
            onChange={(_, newValue) => setSelectedProduct(PRODUCT_FILTERS[newValue])}
            sx={{
              minHeight: 48,
              px: 2,
              '& .MuiTabs-indicator': {
                backgroundColor: productColor.active,
                height: 3,
                borderRadius: '3px 3px 0 0',
              },
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                color: '#64748B',
                minHeight: 48,
                minWidth: 100,
                px: 2.5,
                '&.Mui-selected': {
                  color: productColor.active,
                },
                '&:hover': {
                  color: '#1E293B',
                  backgroundColor: 'rgba(0,0,0,0.02)',
                },
              },
            }}
          >
            <Tab label="GASOIL" />
            <Tab label="JET A-1" />
            <Tab label="FUEL OIL" />
          </Tabs>
        </Box>

        <Box sx={{ bgcolor: 'white' }}>
          {renderTable()}
        </Box>
      </Paper>
    </Box>
  )
}
