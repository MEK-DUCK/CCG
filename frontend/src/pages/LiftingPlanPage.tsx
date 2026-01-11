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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  Button,
  useMediaQuery,
  useTheme,
  Tabs,
  Tab,
  Snackbar,
  Alert,
} from '@mui/material'
import { FileDownload, PictureAsPdf } from '@mui/icons-material'
import { customerAPI, contractAPI, quarterlyPlanAPI, monthlyPlanAPI, cargoAPI } from '../api/client'
import type { Customer, Contract, QuarterlyPlan, MonthlyPlan, Cargo } from '../types'
import { getContractTypeColor, BADGE_COLORS } from '../utils/chipColors'
import { useToast } from '../contexts/ToastContext'

// Column configuration for resizable columns
const COLUMN_CONFIG = [
  { id: 'customer', label: 'Customer', defaultWidth: 200, minWidth: 100 },
  { id: 'contract', label: 'Contract Number', defaultWidth: 200, minWidth: 100 },
  { id: 'products', label: 'Product(s)', defaultWidth: 220, minWidth: 100 },
  { id: 'type', label: 'Type', defaultWidth: 120, minWidth: 80 },
  { id: 'month1', label: 'Month 1', defaultWidth: 150, minWidth: 100 },
  { id: 'month2', label: 'Month 2', defaultWidth: 150, minWidth: 100 },
  { id: 'month3', label: 'Month 3', defaultWidth: 150, minWidth: 100 },
  { id: 'total', label: 'Total', defaultWidth: 150, minWidth: 100 },
  { id: 'remark', label: 'Remark', defaultWidth: 250, minWidth: 150 },
]

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
  contractType: 'FOB' | 'CIF'
  year: number  // Add year to the interface
  month1Entries: MonthlyPlanEntry[]  // All entries for month 1
  month2Entries: MonthlyPlanEntry[]  // All entries for month 2
  month3Entries: MonthlyPlanEntry[]  // All entries for month 3
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
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>(getCurrentQuarter())
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
    const quarterMonths: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number[]> = {
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

      // Initialize contract entry if not exists
      if (!dataMap.has(contract.id)) {
        dataMap.set(contract.id, {
          customerId: contract.customer_id,
          customerName: customer.name,
          contractId: contract.id,
          contractNumber: contract.contract_number,
          productsText,
          contractType: contract.contract_type,
          year: selectedYear,
          month1Entries: [],
          month2Entries: [],
          month3Entries: [],
          total: 0,
          notes: notes.get(contract.id) || '',
        })
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

          if (monthIndex === 0) {
            contractData.month1Entries.push(entry)
          } else if (monthIndex === 1) {
            contractData.month2Entries.push(entry)
          } else if (monthIndex === 2) {
            contractData.month3Entries.push(entry)
          }
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

          if (monthIndex === 0) {
            contractData.month1Entries.push(entry)
          } else if (monthIndex === 1) {
            contractData.month2Entries.push(entry)
          } else if (monthIndex === 2) {
            contractData.month3Entries.push(entry)
          }
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

              if (monthIndex === 0) {
                contractData.month1Entries.push(entry)
              } else if (monthIndex === 1) {
                contractData.month2Entries.push(entry)
              } else if (monthIndex === 2) {
                contractData.month3Entries.push(entry)
              }
        })
              
        // Calculate total
        contractData.total = 
          contractData.month1Entries.reduce((sum, e) => sum + e.quantity, 0) +
          contractData.month2Entries.reduce((sum, e) => sum + e.quantity, 0) +
          contractData.month3Entries.reduce((sum, e) => sum + e.quantity, 0)
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


  const getMonthName = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4', index: number): string => {
    const monthNames: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', string[]> = {
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
        // Show all years that have data for the selected quarter months
        return d.month1Entries.length > 0 || d.month2Entries.length > 0 || d.month3Entries.length > 0 || d.total > 0
      })
      .sort((a, b) => {
        const customerCompare = a.customerName.localeCompare(b.customerName)
        if (customerCompare !== 0) return customerCompare
        return a.contractNumber.localeCompare(b.contractNumber)
      })

    return result
  }

  const handleExportToExcel = () => {
    // Dynamic import of xlsx to avoid issues if not installed
    import('xlsx').then((XLSX) => {
      const dataArray = getFilteredDataArray()

      const exportData: any[] = dataArray.map((data) => {
        // Helper to format entry with combi info
        const formatEntry = (entry: MonthlyPlanEntry) => {
          let result = `${entry.quantity.toLocaleString()} KT`
          
          if (entry.isCombi && entry.combiProducts && entry.combiProducts.length > 0) {
            result += ' [Combie]'
            const productDetails = entry.combiProducts.map(cp => `${cp.productName}: ${cp.quantity.toLocaleString()} KT`).join(', ')
            result += `\n(${productDetails})`
          }
          
          if (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) {
            const parts: string[] = []
            if (entry.laycan5Days) parts.push(`5 Days: ${entry.laycan5Days}`)
            if (entry.laycan2Days) parts.push(`2 Days: ${entry.laycan2Days}`)
            if (parts.length > 0) result += `\n${parts.join(', ')}`
          }
          
          if (data.contractType === 'CIF' && (entry.loadingWindow || entry.deliveryWindow)) {
            const parts: string[] = []
            if (entry.loadingWindow) parts.push(`Loading: ${entry.loadingWindow}`)
            if (entry.deliveryWindow) parts.push(`Delivery: ${entry.deliveryWindow}`)
            if (parts.length > 0) result += `\n${parts.join(', ')}`
          }
          
          return result
        }

        // Format month 1 entries
        const month1Parts = data.month1Entries.map(formatEntry)
        const month1Text = month1Parts.length > 0 ? month1Parts.join('\n\n') : '-'
        
        // Format month 2 entries
        const month2Parts = data.month2Entries.map(formatEntry)
        const month2Text = month2Parts.length > 0 ? month2Parts.join('\n\n') : '-'
        
        // Format month 3 entries
        const month3Parts = data.month3Entries.map(formatEntry)
        const month3Text = month3Parts.length > 0 ? month3Parts.join('\n\n') : '-'

        return {
          'Customer': data.customerName,
          'Contract Number': data.contractNumber,
          'Product(s)': data.productsText || '-',
          'Type': data.contractType,
          [getMonthName(selectedQuarter, 0)]: month1Text,
          [getMonthName(selectedQuarter, 1)]: month2Text,
          [getMonthName(selectedQuarter, 2)]: month3Text,
          [`Total (${selectedQuarter})`]: `${data.total.toLocaleString()} KT`,
          'Remark': data.notes || '',
        }
      })

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(exportData)

      // Set column widths
      const colWidths = [
        { wch: 20 }, // Customer
        { wch: 18 }, // Contract Number
        { wch: 20 }, // Products
        { wch: 10 }, // Type
        { wch: 18 }, // Month 1
        { wch: 18 }, // Month 2
        { wch: 18 }, // Month 3
        { wch: 15 }, // Total
        { wch: 30 }, // Remark
      ]
      ws['!cols'] = colWidths

      // Create workbook
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Lifting Plan')

      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0]
      const filename = `Lifting_Plan_${selectedQuarter}_${selectedYear}_${dateStr}.xlsx`

      // Save file
      XLSX.writeFile(wb, filename)
    }).catch((error) => {
      console.error('Error exporting to Excel:', error)
      showError('Error exporting to Excel. Please make sure the xlsx package is installed.')
    })
  }

  const handleExportToPDF = async () => {
    try {
      // Dynamic import of jsPDF and jspdf-autotable
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default
      
      const dataArray = getFilteredDataArray()

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      
      // Add title
      doc.setFontSize(16)
      doc.text(`Lifting Plan - ${selectedQuarter} ${selectedYear}`, 14, 15)

      // Prepare table data
      const tableData = dataArray.map((data) => {
        // Helper to format entry with combi info
        const formatEntry = (entry: MonthlyPlanEntry) => {
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

        // Format month 1 entries
        const month1Parts = data.month1Entries.map(formatEntry)
        const month1Text = month1Parts.length > 0 ? month1Parts.join('\n\n') : '-'
        
        // Format month 2 entries
        const month2Parts = data.month2Entries.map(formatEntry)
        const month2Text = month2Parts.length > 0 ? month2Parts.join('\n\n') : '-'
        
        // Format month 3 entries
        const month3Parts = data.month3Entries.map(formatEntry)
        const month3Text = month3Parts.length > 0 ? month3Parts.join('\n\n') : '-'

        return [
          data.customerName,
          data.contractNumber,
          data.productsText || '-',
          data.contractType,
          month1Text,
          month2Text,
          month3Text,
          `${data.total.toLocaleString()} KT`,
          data.notes || '',
        ]
      })

      // Add table using autoTable
      autoTable(doc, {
        head: [['Customer', 'Contract Number', 'Product(s)', 'Type', getMonthName(selectedQuarter, 0), getMonthName(selectedQuarter, 1), getMonthName(selectedQuarter, 2), `Total (${selectedQuarter})`, 'Remark']],
        body: tableData,
        startY: 25,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [25, 118, 210], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 30 },
          2: { cellWidth: 35 },
          3: { cellWidth: 20 },
          4: { cellWidth: 30 },
          5: { cellWidth: 30 },
          6: { cellWidth: 30 },
          7: { cellWidth: 25 },
          8: { cellWidth: 40 },
        },
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

    // Helper to render resizable header cell
    const renderResizableHeader = (columnId: string, label: string) => (
      <TableCell 
        sx={{ 
          width: columnWidths[columnId], 
          minWidth: COLUMN_CONFIG.find(c => c.id === columnId)?.minWidth || 80,
          fontWeight: 'bold',
          position: 'relative',
          userSelect: 'none',
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

    return (
      <TableContainer 
        component={Paper}
        sx={{
          maxWidth: '100%',
          overflowX: 'auto',
          '& .MuiTable-root': {
            minWidth: isMobile ? 1100 : 'auto',
            tableLayout: 'fixed', // Fixed layout for consistent column widths
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
              {renderResizableHeader('month1', getMonthName(selectedQuarter, 0))}
              {renderResizableHeader('month2', getMonthName(selectedQuarter, 1))}
              {renderResizableHeader('month3', getMonthName(selectedQuarter, 2))}
              {renderResizableHeader('total', `Total (${selectedQuarter})`)}
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
                    py: isMobile ? 1.5 : 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }
                }}
              >
                <TableCell sx={{ fontWeight: 'medium', width: columnWidths['customer'] }}>{data.customerName}</TableCell>
                <TableCell sx={{ width: columnWidths['contract'] }}>{data.contractNumber}</TableCell>
                <TableCell sx={{ width: columnWidths['products'] }}>{data.productsText || '-'}</TableCell>
                <TableCell sx={{ width: columnWidths['type'] }}>
                  <Chip 
                    label={data.contractType} 
                    size="small"
                    sx={getContractTypeColor(data.contractType)}
                  />
                </TableCell>
                <TableCell sx={{ width: columnWidths['month1'] }}>
                  <Box>
                    {data.month1Entries.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    ) : (
                      data.month1Entries.map((entry, idx) => (
                        <Box key={entry.isCombi ? entry.combiGroupId : entry.monthlyPlanId} sx={{ mb: idx < data.month1Entries.length - 1 ? 1.5 : 0 }}>
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
                          {/* Top-up indicator for non-combi */}
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
                          {/* Total top-up for combi */}
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
                <TableCell sx={{ width: columnWidths['month2'] }}>
                  <Box>
                    {data.month2Entries.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    ) : (
                      data.month2Entries.map((entry, idx) => (
                        <Box key={entry.isCombi ? entry.combiGroupId : entry.monthlyPlanId} sx={{ mb: idx < data.month2Entries.length - 1 ? 1.5 : 0 }}>
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
                          {/* Top-up indicator for non-combi */}
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
                          {/* Total top-up for combi */}
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
                <TableCell sx={{ width: columnWidths['month3'] }}>
                  <Box>
                    {data.month3Entries.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    ) : (
                      data.month3Entries.map((entry, idx) => (
                        <Box key={entry.isCombi ? entry.combiGroupId : entry.monthlyPlanId} sx={{ mb: idx < data.month3Entries.length - 1 ? 1.5 : 0 }}>
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
                          {/* Top-up indicator for non-combi */}
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
                          {/* Total top-up for combi */}
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
                <TableCell sx={{ fontWeight: 'bold', width: columnWidths['total'] }}>{data.total.toLocaleString()} KT</TableCell>
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
                        fontSize: isMobile ? '0.875rem' : '0.9375rem',
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

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
      <Typography 
        variant="h4" 
        gutterBottom
        sx={{
          fontWeight: 700,
          color: '#000000',
            mb: 0,
          fontSize: { xs: '1.75rem', md: '2rem' },
          letterSpacing: '-0.02em',
        }}
      >
        Lifting Plan - Quarterly Summary
      </Typography>
      </Box>
      
      <Box 
        sx={{ 
          mb: 4, 
          p: 3,
          bgcolor: '#FFFFFF',
          borderRadius: 3,
          boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
          display: 'flex', 
          gap: 2, 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          justifyContent: 'space-between' 
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Quarter</InputLabel>
            <Select
              value={selectedQuarter}
              label="Quarter"
              onChange={(e) => setSelectedQuarter(e.target.value as 'Q1' | 'Q2' | 'Q3' | 'Q4')}
            >
              <MenuItem value="Q1">Q1 (Jan - Mar)</MenuItem>
              <MenuItem value="Q2">Q2 (Apr - Jun)</MenuItem>
              <MenuItem value="Q3">Q3 (Jul - Sep)</MenuItem>
              <MenuItem value="Q4">Q4 (Oct - Dec)</MenuItem>
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Year</InputLabel>
            <Select
              value={selectedYear}
              label="Year"
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = 2024 + i  // Start from 2024 to match test data (2024-2028)
                return (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                )
              })}
            </Select>
          </FormControl>

        </Box>
        
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownload />}
            onClick={handleExportToExcel}
            sx={{ 
              fontSize: isMobile ? '0.75rem' : '0.875rem',
              minHeight: isMobile ? 40 : 36,
              px: isMobile ? 1.5 : 2,
              borderColor: '#2563EB',
              color: '#2563EB',
              '&:hover': {
                borderColor: '#1D4ED8',
                bgcolor: 'rgba(37, 99, 235, 0.04)',
              },
            }}
          >
            Export Excel
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdf />}
            onClick={handleExportToPDF}
            sx={{ 
              fontSize: isMobile ? '0.75rem' : '0.875rem',
              minHeight: isMobile ? 40 : 36,
              px: isMobile ? 1.5 : 2,
              borderColor: '#DC2626',
              color: '#DC2626',
              '&:hover': {
                borderColor: '#B91C1C',
                bgcolor: 'rgba(220, 38, 38, 0.04)',
              },
            }}
          >
            Save PDF
          </Button>
        </Box>
      </Box>

      {/* Product Tabs */}
      <Box sx={{ mt: 3 }}>
        <Tabs
          value={PRODUCT_FILTERS.indexOf(selectedProduct as typeof PRODUCT_FILTERS[number])}
          onChange={(_, newValue) => setSelectedProduct(PRODUCT_FILTERS[newValue])}
          sx={{
            '& .MuiTabs-indicator': {
              backgroundColor: '#2563EB',
              height: 3,
            },
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '1rem',
              color: '#64748B',
              minWidth: 120,
              '&.Mui-selected': {
                color: '#2563EB',
              },
            },
          }}
        >
          <Tab label="GASOIL" />
          <Tab label="JET A-1" />
          <Tab label="FUEL OIL" />
        </Tabs>
      </Box>

      <Box 
        sx={{ 
          mt: 2,
          bgcolor: '#FFFFFF',
          borderRadius: 3,
          boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
        }}
      >
        {renderTable()}
      </Box>
    </Box>
  )
}
