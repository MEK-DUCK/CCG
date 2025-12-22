import { useState, useEffect, useRef } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Paper,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Typography,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Checkbox,
  ListItemText,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { FileDownload, Search, Description } from '@mui/icons-material'
import { alpha } from '@mui/material/styles'
import { format } from 'date-fns'
import { cargoAPI, customerAPI, contractAPI, monthlyPlanAPI, quarterlyPlanAPI, documentsAPI } from '../api/client'
import type { Cargo, Customer, Contract, MonthlyPlan, CargoStatus, ContractProduct, LCStatus, CargoPortOperation, PortOperationStatus } from '../types'
import { parseLaycanDate } from '../utils/laycanParser'
import { getLaycanAlertSeverity, getAlertColor, getAlertMessage } from '../utils/alertUtils'
import { Tooltip, Badge } from '@mui/material'
import NotificationBadge from '../components/Notifications/NotificationBadge'
import { useLaycanAlerts } from '../hooks/useLaycanAlerts'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
          {children}
        </Box>
      )}
    </div>
  )
}

export default function HomePage() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const LOAD_PORT_OPTIONS = ['MAA', 'MAB', 'SHU', 'ZOR'] as const
  const PORT_SECTIONS = ['MAA', 'MAB', 'SHU', 'ZOR'] as const
  const PORT_OP_STATUSES: PortOperationStatus[] = ['Planned', 'Loading', 'Completed Loading']

  const parseLoadPorts = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map((v) => String(v).trim()).filter(Boolean)))
    }
    if (typeof value !== 'string') return []
    const raw = value.trim()
    if (!raw) return []

    // Handle JSON array string: '["MAA","MAB"]'
    if (raw.startsWith('[')) {
      try {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          return Array.from(new Set(arr.map((v) => String(v).trim()).filter(Boolean)))
        }
      } catch {
        // fall through to CSV parsing
      }
    }

    // Default: comma-separated string
    return Array.from(
      new Set(
        raw
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      )
    )
  }

  const formatLoadPorts = (ports: string[] | string): string => {
    if (Array.isArray(ports)) return ports.join(', ')
    return ports || ''
  }

  const portOpTimersRef = useRef<Record<string, number>>({})
  const portMovementExportRowsRef = useRef<any[]>([])

  const handlePortMovementExportToExcel = () => {
    const rows = Array.isArray(portMovementExportRowsRef.current) ? portMovementExportRowsRef.current : []
    // Dynamic import of xlsx to avoid issues if not installed
    import('xlsx')
      .then((XLSX) => {
        const exportData: any[] = []

        rows.forEach(({ cargo, contract, customer, laycan, monthlyPlan }) => {
          exportData.push({
            Laycan: laycan,
            'Vessel Name': cargo ? cargo.vessel_name : 'TBA',
            'Customer Name': customer ? customer.name : '-',
            'Contract Number': contract ? contract.contract_number : '-',
            'FOB/CIF': contract ? contract.contract_type : '-',
            'Payment Method': contract && contract.payment_method ? contract.payment_method : '-',
            'LC Status':
              contract && contract.payment_method === 'LC' && cargo && cargo.lc_status ? cargo.lc_status : '-',
            Product:
              contract && contract.products && contract.products.length > 0
                ? contract.products.map((p: ContractProduct) => p.name).join(', ')
                : '-',
            Quantity: cargo ? cargo.cargo_quantity : monthlyPlan ? monthlyPlan.month_quantity : '-',
            'Load Port': cargo ? cargo.load_ports || '-' : contract ? contract.allowed_load_ports || '-' : '-',
            Status: cargo ? cargo.status : 'Not Created',
            Remark: cargo ? cargo.notes || '-' : '-',
            'Inspector Name': cargo ? cargo.inspector_name || '-' : '-',
            'Laycan Window': cargo ? cargo.laycan_window || '-' : '-',
            ETA: cargo ? cargo.eta || '-' : '-',
            Berthed: cargo ? cargo.berthed || '-' : '-',
            Commenced: cargo ? cargo.commenced || '-' : '-',
            ETC: cargo ? cargo.etc || '-' : '-',
          })
        })

        const ws = XLSX.utils.json_to_sheet(exportData)

        ws['!cols'] = [
          { wch: 15 }, // Laycan
          { wch: 20 }, // Vessel Name
          { wch: 20 }, // Customer Name
          { wch: 15 }, // Contract Number
          { wch: 10 }, // FOB/CIF
          { wch: 15 }, // Payment Method
          { wch: 15 }, // LC Status
          { wch: 20 }, // Product
          { wch: 12 }, // Quantity
          { wch: 15 }, // Load Port
          { wch: 20 }, // Status
          { wch: 30 }, // Remark
          { wch: 20 }, // Inspector Name
          { wch: 15 }, // Laycan Window
          { wch: 15 }, // ETA
          { wch: 15 }, // Berthed
          { wch: 15 }, // Commenced
          { wch: 15 }, // ETC
        ]

        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Port Movement')

        const dateStr = new Date().toISOString().split('T')[0]
        const filename = `Port_Movement_${dateStr}.xlsx`
        XLSX.writeFile(wb, filename)
      })
      .catch((error) => {
        console.error('Error exporting to Excel:', error)
        alert('Error exporting to Excel. Please make sure the xlsx package is installed.')
      })
  }

  const applyLocalPortOpPatch = (cargoId: number, portCode: string, patch: Partial<CargoPortOperation>) => {
    setPortMovement((prev) =>
      prev.map((c) => {
        if (c.id !== cargoId) return c
        const existing = Array.isArray(c.port_operations) ? c.port_operations : []
        const found = existing.find((op) => op.port_code === portCode)
        const base: CargoPortOperation = found || {
          id: -1,
          cargo_id: cargoId,
          port_code: portCode as any,
          status: 'Loading',
          eta: undefined,
          berthed: undefined,
          commenced: undefined,
          etc: undefined,
          notes: undefined,
          created_at: new Date().toISOString(),
          updated_at: undefined,
        }
        const nextOp = { ...base, ...patch, port_code: base.port_code, cargo_id: cargoId }
        const nextOps = found
          ? existing.map((op) => (op.port_code === portCode ? (nextOp as CargoPortOperation) : op))
          : [...existing, nextOp as CargoPortOperation]
        return { ...c, port_operations: nextOps }
      })
    )
    setEditingCargo((prev) => {
      if (!prev || prev.id !== cargoId) return prev
      const existing = Array.isArray(prev.port_operations) ? prev.port_operations : []
      const found = existing.find((op) => op.port_code === portCode)
      const base: CargoPortOperation = found || {
        id: -1,
        cargo_id: cargoId,
        port_code: portCode as any,
        status: 'Loading',
        eta: undefined,
        berthed: undefined,
        commenced: undefined,
        etc: undefined,
        notes: undefined,
        created_at: new Date().toISOString(),
        updated_at: undefined,
      }
      const nextOp = { ...base, ...patch, port_code: base.port_code, cargo_id: cargoId }
      const nextOps = found
        ? existing.map((op) => (op.port_code === portCode ? (nextOp as CargoPortOperation) : op))
        : [...existing, nextOp as CargoPortOperation]
      return { ...prev, port_operations: nextOps }
    })
  }

  const upsertPortOp = async (cargoId: number, portCode: string, patch: Partial<CargoPortOperation>) => {
    const response = await cargoAPI.upsertPortOperation(cargoId, portCode, patch)
    const saved = response.data as CargoPortOperation
    setPortMovement((prev) =>
      prev.map((c) => {
        if (c.id !== cargoId) return c
        const existing = Array.isArray(c.port_operations) ? c.port_operations : []
        const next = existing.some((op) => op.port_code === saved.port_code)
          ? existing.map((op) => (op.port_code === saved.port_code ? saved : op))
          : [...existing, saved]
        return { ...c, port_operations: next }
      })
    )
    setEditingCargo((prev) => {
      if (!prev || prev.id !== cargoId) return prev
      const existing = Array.isArray(prev.port_operations) ? prev.port_operations : []
      const next = existing.some((op) => op.port_code === saved.port_code)
        ? existing.map((op) => (op.port_code === saved.port_code ? saved : op))
        : [...existing, saved]
      return { ...prev, port_operations: next }
    })
    // If completion changes, refresh lists so cargo moves tabs correctly.
    if (patch.status) {
      await loadPortMovement()
      await loadActiveLoadings()
      await loadData()
    }
  }

  const schedulePortOpSave = (cargoId: number, portCode: string, patch: Partial<CargoPortOperation>) => {
    // Optimistic UI update so typing is instant; server save happens in the background.
    applyLocalPortOpPatch(cargoId, portCode, patch)
    const key = `${cargoId}:${portCode}`
    const existing = portOpTimersRef.current[key]
    if (existing) window.clearTimeout(existing)
    portOpTimersRef.current[key] = window.setTimeout(() => {
      upsertPortOp(cargoId, portCode, patch).catch((e) => console.error('Error saving port operation:', e))
    }, 500)
  }

  const getPortOpForCargo = (cargo: Cargo, port: string): CargoPortOperation | null => {
    const ops = Array.isArray(cargo.port_operations) ? cargo.port_operations : []
    const found = ops.find((op) => op.port_code === port)
    if (found) return found
    // Fallback for older cargos: infer ops from load_ports string
    const inferredPorts = parseLoadPorts(cargo.load_ports)
    if (!inferredPorts.includes(port)) return null
    return {
      id: -1,
      cargo_id: cargo.id,
      port_code: port,
      status: (cargo.status as any) || 'Planned',
      eta: undefined,
      berthed: undefined,
      commenced: undefined,
      etc: undefined,
      notes: undefined,
      created_at: cargo.created_at,
      updated_at: cargo.updated_at,
    }
  }

  const isCargoInLoadingLanes = (cargo: Cargo): boolean => {
    const ops = Array.isArray(cargo.port_operations) ? cargo.port_operations : []
    if (ops.some((op) => op.status === 'Loading')) return true
    return cargo.status === 'Loading'
  }

  const getCargoLaycanForRow = (cargo: Cargo): string => {
    const monthlyPlan = monthlyPlans.find((mp) => mp.id === cargo.monthly_plan_id)
    if (monthlyPlan) {
      const contract = getContractForMonthlyPlan(monthlyPlan)
      return getLaycanDisplay(monthlyPlan, contract)
    }
    return cargo.laycan_window || 'TBA'
  }
  
  const [value, setValue] = useState(0)
  const [portMovement, setPortMovement] = useState<Cargo[]>([])
  const [activeLoadings, setActiveLoadings] = useState<Cargo[]>([])
  const [completedCargos, setCompletedCargos] = useState<Cargo[]>([])
  const [inRoadCIF, setInRoadCIF] = useState<Cargo[]>([])
  const [completedInRoadCIF, setCompletedInRoadCIF] = useState<Cargo[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([])
  const [quarterlyPlansMap, setQuarterlyPlansMap] = useState<Map<number, any>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selectedMonths, setSelectedMonths] = useState<number[]>([new Date().getMonth() + 1])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [completedMonth, setCompletedMonth] = useState<number | null>(null)
  const [completedYear, setCompletedYear] = useState<number | null>(null)
  // Port Movement filters
  const [portMovementFilterCustomer, setPortMovementFilterCustomer] = useState<number | null>(null)
  const [portMovementFilterContract, setPortMovementFilterContract] = useState<number | null>(null)
  const [portMovementFilterType, setPortMovementFilterType] = useState<string | null>(null)
  const [portMovementFilterProduct, setPortMovementFilterProduct] = useState<string | null>(null)
  const [portMovementFilterStatus, setPortMovementFilterStatus] = useState<string | null>(null)
  const [portMovementSearch, setPortMovementSearch] = useState<string>('')
  const [completedCargosSearch, setCompletedCargosSearch] = useState<string>('')
  const [cargoDialogOpen, setCargoDialogOpen] = useState(false)
  const [editingCargo, setEditingCargo] = useState<Cargo | null>(null)
  const [cargoMonthlyPlanId, setCargoMonthlyPlanId] = useState<number | null>(null)
  const [cargoContractId, setCargoContractId] = useState<number | null>(null)
  const [cargoContract, setCargoContract] = useState<Contract | null>(null)
  const [cargoProductName, setCargoProductName] = useState<string | null>(null)
  const [newCargoMonthlyPlanId, setNewCargoMonthlyPlanId] = useState<number | null>(null) // For moving cargo
  const [cargoFormData, setCargoFormData] = useState({
    vessel_name: '',
    load_ports: [] as string[],
    inspector_name: '',
    cargo_quantity: '',
    laycan_window: '',
    eta: '',
    berthed: '',
    commenced: '',
    etc: '',
    eta_discharge_port: '',
    discharge_port_location: '',
    discharge_completion_time: '',
    notes: '',
    status: 'Planned' as CargoStatus,
    lc_status: '' as '' | LCStatus,
  })

  const [isInitialLoad, setIsInitialLoad] = useState(true)

  const formatSelectedMonthsLabel = (months: number[], year: number) => {
    const sorted = [...(months || [])].sort((a, b) => a - b)
    const monthLabel = (m: number) => new Date(2000, m - 1).toLocaleString('default', { month: 'long' })
    if (sorted.length === 0) {
      return new Date(year, new Date().getMonth()).toLocaleString('default', { month: 'long', year: 'numeric' })
    }
    if (sorted.length === 12) return `All Months ${year}`
    if (sorted.length === 1) return `${monthLabel(sorted[0])} ${year}`
    return `${sorted.map(monthLabel).join(', ')} ${year}`
  }

  useEffect(() => {
    if (isInitialLoad) {
      setIsInitialLoad(false)
      loadData()
      loadPortMovement()
      loadActiveLoadings()
      loadMonthlyPlansForPortMovement()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadActiveLoadings = async () => {
    try {
      const res = await cargoAPI.getActiveLoadings()
      setActiveLoadings(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      console.error('Error loading active loadings:', e)
      setActiveLoadings([])
    }
  }

  useEffect(() => {
    // Reload completed cargos when month/year filter changes
    if (value === 2 && !isInitialLoad) { // Completed Cargos tab is index 2
      loadData()
      loadMonthlyPlansForPortMovement()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedMonth, completedYear, value])

  useEffect(() => {
    if (value === 0 && !isInitialLoad) {
      loadPortMovement()
      loadMonthlyPlansForPortMovement()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonths, selectedYear, value])

  const loadPortMovement = async () => {
    try {
      setLoading(true)
      const monthsToLoad = (selectedMonths && selectedMonths.length > 0)
        ? [...selectedMonths].sort((a, b) => a - b)
        : [new Date().getMonth() + 1]

      console.log(`Loading port movement for months ${monthsToLoad.join(', ')}, year ${selectedYear}`)

      const responses = await Promise.all(
        monthsToLoad.map((month) =>
          cargoAPI.getPortMovement(month, selectedYear).catch(() => ({ data: [] as any[] }))
        )
      )

      const merged = responses.flatMap((r: any) => r?.data || [])
      // De-duplicate (defensive) in case of overlaps
      const unique = new Map<number, any>()
      merged.forEach((c: any) => {
        if (typeof c?.id === 'number') unique.set(c.id, c)
      })
      setPortMovement(Array.from(unique.values()))
    } catch (error) {
      console.error('Error loading port movement:', error)
      setPortMovement([])
    } finally {
      setLoading(false)
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      // Load customers and contracts in parallel - they're independent
      const [customersRes, contractsRes, completedRes, inRoadRes, completedInRoadRes] = await Promise.all([
        customerAPI.getAll().catch(() => ({ data: [] })),
        contractAPI.getAll().catch(() => ({ data: [] })),
        cargoAPI.getCompletedCargos(completedMonth || undefined, completedYear || undefined).catch(() => ({ data: [] })),
        cargoAPI.getInRoadCIF().catch(() => ({ data: [] })),
        cargoAPI.getCompletedInRoadCIF().catch(() => ({ data: [] })),
      ])
      
      setCustomers(customersRes.data || [])
      setContracts(contractsRes.data || [])
      setCompletedCargos(completedRes.data || [])
      setInRoadCIF(inRoadRes.data || [])
      setCompletedInRoadCIF(completedInRoadRes.data || [])
    } catch (error: any) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMonthlyPlansForPortMovement = async () => {
    try {
      // Get all contracts (use cached if available)
      let allContracts = contracts
      if (allContracts.length === 0) {
        const contractsRes = await contractAPI.getAll()
        allContracts = contractsRes.data || []
        if (allContracts.length > 0) {
          setContracts(allContracts)
        }
      }

      if (allContracts.length === 0) {
        return // No contracts to load plans for
      }

      // Get quarterly plans for all contracts and create a map
      const quarterlyPlanPromises = allContracts.map((contract: Contract) => 
        quarterlyPlanAPI.getAll(contract.id).then(res => ({ contract, quarterlyPlans: res.data || [] })).catch(() => ({ contract, quarterlyPlans: [] }))
      )
      const quarterlyPlanResults = await Promise.all(quarterlyPlanPromises)
      
      const qpMap = new Map<number, any>()
      quarterlyPlanResults.forEach(({ contract, quarterlyPlans }) => {
        quarterlyPlans.forEach((qp: any) => {
          qpMap.set(qp.id, { ...qp, contract })
        })
      })
      setQuarterlyPlansMap(qpMap)

      // Get monthly plans for all quarterly plans
      const allQuarterlyPlans = quarterlyPlanResults.flatMap((r: any) => r.quarterlyPlans)
      const monthlyPlanPromises = allQuarterlyPlans.map((qp: any) => 
        monthlyPlanAPI.getAll(qp.id).then(res => ({ quarterlyPlanId: qp.id, monthlyPlans: res.data || [] })).catch(() => ({ quarterlyPlanId: qp.id, monthlyPlans: [] }))
      )
      const monthlyPlanResults = await Promise.all(monthlyPlanPromises)
      const allMonthlyPlans = monthlyPlanResults.flatMap((r: any) => 
        r.monthlyPlans.map((mp: MonthlyPlan) => ({ ...mp, quarterlyPlanId: r.quarterlyPlanId }))
      )
      
      // Filter by selected month(s) and year
      const filtered = allMonthlyPlans.filter((mp: MonthlyPlan & { quarterlyPlanId: number }) => 
        mp.year === selectedYear && selectedMonths.includes(mp.month)
      )
      setMonthlyPlans(filtered)
    } catch (error) {
      console.error('Error loading monthly plans:', error)
      setMonthlyPlans([])
    }
  }

  // Calculate laycan alerts - use all cargos (not just port movement) for comprehensive alerts
  const allCargosForAlerts = [...portMovement, ...completedCargos, ...inRoadCIF]
  const laycanAlerts = useLaycanAlerts({
    cargos: allCargosForAlerts,
    monthlyPlans,
    contracts,
    customers,
    maxDays: 14,
  })

  const handleEditCargo = async (cargo: Cargo) => {
    setEditingCargo(cargo)
    setCargoMonthlyPlanId(cargo.monthly_plan_id)
    setNewCargoMonthlyPlanId(cargo.monthly_plan_id) // Initialize for potential move
    setCargoContractId(cargo.contract_id)
    setCargoProductName(cargo.product_name)
    
    // Load monthly plan to get laycan window and quantity
    let laycanWindow = ''
    let cargoQuantity = cargo.cargo_quantity.toString()
    try {
      const monthlyPlanRes = await monthlyPlanAPI.getById(cargo.monthly_plan_id)
      const monthlyPlan = monthlyPlanRes.data
      
      // Get laycan window from monthly plan:
      // - CIF: use loading_window
      // - FOB: laycan_2_days > laycan_5_days > TBA
      if (cargo.contract_type === 'CIF') {
        laycanWindow = monthlyPlan.loading_window || 'TBA'
      } else if (monthlyPlan.laycan_2_days) {
        laycanWindow = monthlyPlan.laycan_2_days
      } else if (monthlyPlan.laycan_5_days) {
        laycanWindow = monthlyPlan.laycan_5_days
      } else {
        laycanWindow = 'TBA'
      }
      
      // Get quantity from monthly plan
      cargoQuantity = monthlyPlan.month_quantity.toString()
    } catch (error) {
      console.error('Error loading monthly plan:', error)
      // Fallback to TBA if monthly plan can't be loaded
      laycanWindow = 'TBA'
    }
    
    // Load contract
    try {
      const contractRes = await contractAPI.getById(cargo.contract_id)
      setCargoContract(contractRes.data)
    } catch (error) {
      console.error('Error loading contract:', error)
    }
    
    setCargoFormData({
      vessel_name: cargo.vessel_name,
      load_ports: parseLoadPorts(cargo.load_ports),
      inspector_name: cargo.inspector_name || '',
      cargo_quantity: cargoQuantity,
      laycan_window: laycanWindow,
      eta: cargo.eta || '',
      berthed: cargo.berthed || '',
      commenced: cargo.commenced || '',
      etc: cargo.etc || '',
      eta_discharge_port: cargo.eta_discharge_port ? (() => {
        const d = new Date(cargo.eta_discharge_port)
        return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16)
      })() : '',
      discharge_port_location: cargo.discharge_port_location || '',
      discharge_completion_time: cargo.discharge_completion_time ? (() => {
        const d = new Date(cargo.discharge_completion_time)
        return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16)
      })() : '',
      notes: cargo.notes || '',
      status: cargo.status,
      lc_status: cargo.lc_status || '',
    })
    setCargoDialogOpen(true)
  }

  const handleGenerateNomination = async (cargoId: number, event: React.MouseEvent) => {
    event.stopPropagation() // Prevent row click
    
    try {
      const response = await documentsAPI.generateNomination(cargoId)
      
      // Get filename from response headers or use default
      const contentDisposition = response.headers['content-disposition']
      let filename = `Nomination_${cargoId}.xlsx`
      if (contentDisposition) {
        // Try to extract filename from Content-Disposition header
        // Handle both quoted and unquoted filenames
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i)
        if (filenameMatch && filenameMatch[1]) {
          // Remove quotes if present
          filename = filenameMatch[1].replace(/['"]/g, '')
          // Handle URL encoding if needed
          try {
            filename = decodeURIComponent(filename)
          } catch {
            // If decoding fails, use as-is
          }
        }
      }
      
      // Ensure filename has .xlsx extension
      if (!filename.toLowerCase().endsWith('.xlsx')) {
        filename = `${filename}.xlsx`
      }
      
      // Create blob URL and trigger download
      // Use explicit MIME type for Safari compatibility
      // response.data is now arraybuffer, convert to blob
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      
      // Safari-compatible download approach
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.display = 'none'
      
      document.body.appendChild(link)
      link.click()
      
      // Clean up after a short delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      }, 100)
    } catch (error: any) {
      console.error('Error generating nomination:', error)
      alert(`Error generating nomination: ${error.response?.data?.detail || error.message || 'Unknown error'}`)
    }
  }

  const handleCreateCargoForPlan = async (monthlyPlan: MonthlyPlan & { quarterlyPlanId?: number }) => {
    // Check if this monthly plan already has a cargo
    const existingCargo = [...portMovement, ...completedCargos, ...inRoadCIF].find(
      cargo => cargo.monthly_plan_id === monthlyPlan.id
    )
    
    if (existingCargo) {
      alert(`This monthly plan already has a cargo assigned (Cargo ID: ${existingCargo.cargo_id}, Vessel: ${existingCargo.vessel_name}). Please edit the existing cargo instead of creating a new one.`)
      // Optionally, open the edit dialog for the existing cargo
      handleEditCargo(existingCargo)
      return
    }
    
    // Find the contract for this monthly plan through quarterly plan
    const qpId = monthlyPlan.quarterly_plan_id || (monthlyPlan as any).quarterlyPlanId
    const quarterlyPlan = quarterlyPlansMap.get(qpId)
    if (!quarterlyPlan || !quarterlyPlan.contract) {
      alert('Could not find contract for this monthly plan')
      return
    }

    const contract = quarterlyPlan.contract
    
    // Get the first product from contract's products list (user will select which product when creating cargo)
    // For now, we'll use the first product, but ideally we should let user select
    const contractProducts = contract.products || []
    if (contractProducts.length === 0) {
      alert('This contract has no products. Please add products to the contract first.')
      return
    }
    
    // Use the first product as default (user can change this in the cargo creation if needed)
    const defaultProductName = contractProducts[0].name

    setEditingCargo(null)
    // Store monthly plan ID, contract ID, contract object, and product name in separate state
    setCargoMonthlyPlanId(monthlyPlan.id)
    setCargoContractId(contract.id)
    setCargoContract(contract)
    setCargoProductName(defaultProductName)
    
    // Get quantity from monthly plan
    const cargoQuantity = monthlyPlan.month_quantity.toString()
    
    // Get laycan window from monthly plan:
    // - CIF: use loading_window
    // - FOB: laycan_2_days > laycan_5_days > TBA
    let laycanWindow = 'TBA'
    if (contract.contract_type === 'CIF') {
      laycanWindow = monthlyPlan.loading_window || 'TBA'
    } else if (monthlyPlan.laycan_2_days) {
      laycanWindow = monthlyPlan.laycan_2_days
    } else if (monthlyPlan.laycan_5_days) {
      laycanWindow = monthlyPlan.laycan_5_days
    }
    
    setCargoFormData({
      vessel_name: 'TBA',
      load_ports: parseLoadPorts((contract as any).allowed_load_ports || ''),
      inspector_name: '',
      cargo_quantity: cargoQuantity,
      laycan_window: laycanWindow,
      eta: '',
      berthed: '',
      commenced: '',
      etc: '',
      eta_discharge_port: '',
      discharge_port_location: '',
      discharge_completion_time: '',
      notes: '',
      status: 'Planned' as CargoStatus,
      lc_status: '',
    })
    setCargoDialogOpen(true)
  }

  const getContractForMonthlyPlan = (monthlyPlan: MonthlyPlan & { quarterlyPlanId?: number }) => {
    const qpId = monthlyPlan.quarterly_plan_id || (monthlyPlan as any).quarterlyPlanId
    const quarterlyPlan = quarterlyPlansMap.get(qpId)
    return quarterlyPlan?.contract
  }

  const handleCargoSubmit = async () => {
    try {
      if (editingCargo) {
        // Check if status is being changed to "Completed Loading"
        const isChangingToCompletedLoading = cargoFormData.status === 'Completed Loading' && editingCargo.status !== 'Completed Loading'
        const isCIF = editingCargo.contract_type === 'CIF'
        
        // Prepare update payload
        // Helper function to convert datetime-local to ISO string (same behavior as create)
        const toISOString = (dateTimeLocal: string) => {
          if (!dateTimeLocal) return undefined
          const d = new Date(dateTimeLocal)
          if (Number.isNaN(d.getTime())) return undefined
          return d.toISOString()
        }

        const updatePayload: any = {
          vessel_name: cargoFormData.vessel_name,
          load_ports: formatLoadPorts(cargoFormData.load_ports),
          inspector_name: cargoFormData.inspector_name || undefined,
          cargo_quantity: parseFloat(cargoFormData.cargo_quantity),
          laycan_window: cargoFormData.laycan_window || undefined,
          notes: cargoFormData.notes || undefined,
          status: cargoFormData.status,
          lc_status: cargoFormData.lc_status || undefined,
        }

        // CIF specific fields (only send for CIF, and always ISO format)
        if (isCIF) {
          if (cargoFormData.eta_discharge_port) updatePayload.eta_discharge_port = toISOString(cargoFormData.eta_discharge_port)
          if (cargoFormData.discharge_port_location) updatePayload.discharge_port_location = cargoFormData.discharge_port_location
          if (cargoFormData.discharge_completion_time) updatePayload.discharge_completion_time = toISOString(cargoFormData.discharge_completion_time)
        }
        
        // Include monthly_plan_id if it's being changed (for moving cargo between months)
        if (newCargoMonthlyPlanId && newCargoMonthlyPlanId !== editingCargo.monthly_plan_id) {
          updatePayload.monthly_plan_id = newCargoMonthlyPlanId
          console.log(`[AUDIT] Moving cargo ${editingCargo.cargo_id} from monthly_plan_id ${editingCargo.monthly_plan_id} to ${newCargoMonthlyPlanId}`)
        }
        
        // Save original cargo for rollback
        const originalCargo = { ...editingCargo }
        
        // OPTIMISTIC UPDATE: Immediately update UI
        const updatedCargo: Cargo = {
          ...editingCargo,
          ...updatePayload,
          cargo_quantity: parseFloat(cargoFormData.cargo_quantity),
        }
        
        // Update in Port Movement tab
        setPortMovement(prevCargos =>
          prevCargos.map(cargo =>
            cargo.id === editingCargo.id ? updatedCargo : cargo
          )
        )
        
        // Update in Completed Cargos tab if it exists there
        setCompletedCargos(prevCargos =>
          prevCargos.map(cargo =>
            cargo.id === editingCargo.id ? updatedCargo : cargo
          )
        )
        
        // Update in In-Road CIF tab if it exists there
        setInRoadCIF(prevCargos =>
          prevCargos.map(cargo =>
            cargo.id === editingCargo.id ? updatedCargo : cargo
          )
        )
        
        // Close dialog immediately
        setCargoDialogOpen(false)
        
        // Send API call in background.
        // IMPORTANT: Only revert the optimistic update if the UPDATE request itself fails.
        // Follow-up refresh failures should not revert a successful save.
        cargoAPI.update(editingCargo.id, updatePayload)
          .then(() => {
            // Refresh in background (best-effort)
            loadData().catch((e) => console.error('Error refreshing data after cargo update:', e))
            loadPortMovement().catch((e) => console.error('Error refreshing port movement after cargo update:', e))
          })
          .catch((error) => {
            // UPDATE request failed - revert optimistic update
            console.error('Error updating cargo:', error)
            
            // Revert Port Movement
            setPortMovement(prevCargos =>
              prevCargos.map(cargo =>
                cargo.id === editingCargo.id ? originalCargo : cargo
              )
            )
            
            // Revert Completed Cargos
            setCompletedCargos(prevCargos =>
              prevCargos.map(cargo =>
                cargo.id === editingCargo.id ? originalCargo : cargo
              )
            )
            
            // Revert In-Road CIF
            setInRoadCIF(prevCargos =>
              prevCargos.map(cargo =>
                cargo.id === editingCargo.id ? originalCargo : cargo
              )
            )
            
            // Reopen dialog with original data (prevents missing sections/state after failures)
            handleEditCargo(originalCargo)
            alert('Error updating cargo. Changes have been reverted. Please try again.')
          })
        
        // Continue with duplicate cargo creation if needed (this happens in background)
        if (isChangingToCompletedLoading && isCIF) {
          // Create duplicate cargo in background (non-blocking)
          const createDuplicate = async () => {
            try {
              console.log('Creating duplicate CIF cargo for In-Road tracking...', editingCargo)
              
              // Create a duplicate cargo (will be created as "Planned" status)
              const duplicatePayload: any = {
                vessel_name: cargoFormData.vessel_name,
                customer_id: editingCargo.customer_id,
                product_name: editingCargo.product_name,
                contract_id: editingCargo.contract_id,
                monthly_plan_id: editingCargo.monthly_plan_id,
                load_ports: formatLoadPorts(cargoFormData.load_ports),
                inspector_name: cargoFormData.inspector_name || undefined,
                cargo_quantity: parseFloat(cargoFormData.cargo_quantity),
                laycan_window: cargoFormData.laycan_window || undefined,
                notes: cargoFormData.notes || undefined,
                // CIF specific fields
                eta_discharge_port: cargoFormData.eta_discharge_port || undefined,
                discharge_port_location: cargoFormData.discharge_port_location || undefined,
              }
              
              // Create the duplicate cargo
              const duplicateResponse = await cargoAPI.create(duplicatePayload)
              
              // Immediately update it to "In-Road (Pending Discharge)" status
              if (duplicateResponse.data && duplicateResponse.data.id) {
                const duplicateId = duplicateResponse.data.id
                
                // Optimistically add to In-Road CIF list
                const duplicateCargo: Cargo = {
                  ...duplicateResponse.data,
                  status: 'In-Road (Pending Discharge)' as CargoStatus,
                }
                setInRoadCIF(prev => [...prev, duplicateCargo])
                
                // Update status via API
                await cargoAPI.update(duplicateId, {
                  status: 'In-Road (Pending Discharge)',
                })
                
                // Refresh In-Road data in background
                setTimeout(async () => {
                  try {
                    const inRoadRes = await cargoAPI.getInRoadCIF()
                    setInRoadCIF(inRoadRes.data || [])
                  } catch (error) {
                    console.error('Error reloading In-Road CIF:', error)
                  }
                }, 300)
              }
            } catch (duplicateError: any) {
              console.error('Error creating duplicate CIF cargo:', duplicateError)
              // Don't show alert - main cargo update succeeded
            }
          }
          
          // Run in background (don't await)
          createDuplicate()
        }
        
        // Show success message immediately
        alert('Vessel updated successfully!' + (isChangingToCompletedLoading && isCIF ? ' A copy will be created for In-Road CIF tracking.' : ''))
      } else {
        // Create new cargo for monthly plan
        if (!cargoMonthlyPlanId || !cargoContractId || !cargoContract || !cargoProductName) {
          alert('Missing monthly plan, contract, or product information. Please try clicking on the row again.')
          return
        }

        const contract = cargoContract

        // Validate required fields
        if (!cargoFormData.vessel_name || !cargoFormData.cargo_quantity) {
          alert('Please fill in all required fields: Vessel Name and Cargo Quantity')
          return
        }

        const cargoQuantity = parseFloat(cargoFormData.cargo_quantity)
        if (isNaN(cargoQuantity) || cargoQuantity <= 0) {
          alert('Cargo Quantity must be a valid positive number')
          return
        }

        // Prepare the payload
        const payload: any = {
          customer_id: contract.customer_id,
          product_name: cargoProductName,
          contract_id: cargoContractId,
          monthly_plan_id: cargoMonthlyPlanId,
          vessel_name: cargoFormData.vessel_name,
          load_ports: formatLoadPorts(cargoFormData.load_ports),
          cargo_quantity: cargoQuantity,
        }
        
        // Validate payload before sending
        if (!payload.customer_id || !payload.product_name || !payload.contract_id || !payload.monthly_plan_id) {
          console.error('❌ Missing required fields in payload:', payload)
          alert('Error: Missing required fields. Check console for details.')
          return
        }

        // Helper function to convert datetime-local to ISO string
        const toISOString = (dateTimeLocal: string) => {
          if (!dateTimeLocal) return undefined
          // datetime-local format: "YYYY-MM-DDTHH:mm"
          // Convert to ISO format: "YYYY-MM-DDTHH:mm:ss.sssZ"
          const d = new Date(dateTimeLocal)
          if (Number.isNaN(d.getTime())) return undefined
          return d.toISOString()
        }

        // Add optional fields
        if (cargoFormData.inspector_name) payload.inspector_name = cargoFormData.inspector_name
        if (cargoFormData.laycan_window) payload.laycan_window = cargoFormData.laycan_window
        if (cargoFormData.notes) payload.notes = cargoFormData.notes
        if (cargoFormData.lc_status) {
          payload.lc_status = cargoFormData.lc_status as LCStatus
        }

        // Add CIF specific fields
        if (contract.contract_type === 'CIF') {
          if (cargoFormData.eta_discharge_port) payload.eta_discharge_port = toISOString(cargoFormData.eta_discharge_port)
          if (cargoFormData.discharge_port_location) payload.discharge_port_location = cargoFormData.discharge_port_location
          if (cargoFormData.discharge_completion_time) payload.discharge_completion_time = toISOString(cargoFormData.discharge_completion_time)
        }

        console.log('Creating cargo with payload:', JSON.stringify(payload, null, 2))
        console.log('Contract ID:', cargoContractId, 'Monthly Plan ID:', cargoMonthlyPlanId)
        console.log('Contract:', contract)
        console.log('Product Name:', cargoProductName)
        console.log('Customer ID:', contract.customer_id)
        
        // Create optimistic cargo object (will be replaced with real data from API)
        const optimisticCargo: Cargo = {
          id: Date.now(), // Temporary ID
          cargo_id: `TEMP-${Date.now()}`,
          vessel_name: cargoFormData.vessel_name,
          customer_id: contract.customer_id,
          product_name: cargoProductName,
          contract_id: cargoContractId,
          contract_type: contract.contract_type,
          load_ports: formatLoadPorts(cargoFormData.load_ports),
          inspector_name: cargoFormData.inspector_name || undefined,
          cargo_quantity: cargoQuantity,
          laycan_window: cargoFormData.laycan_window || undefined,
          status: 'Planned' as CargoStatus,
          notes: cargoFormData.notes || undefined,
          monthly_plan_id: cargoMonthlyPlanId,
          lc_status: cargoFormData.lc_status || undefined,
          created_at: new Date().toISOString(),
        }
        
        // OPTIMISTIC UPDATE: Add to Port Movement immediately
        setPortMovement(prevCargos => [...prevCargos, optimisticCargo])
        
        // Close dialog immediately
        setCargoDialogOpen(false)
        
        // Show optimistic success
        alert('Cargo created successfully!')
        
        // Send API call in background
        cargoAPI.create(payload)
          .then((response) => {
            console.log('✅ Cargo API response received:', response)
            console.log('✅ Response data:', response.data)
            
            // Replace optimistic cargo with real cargo from API
            if (response.data) {
              setPortMovement(prevCargos =>
                prevCargos.map(cargo =>
                  cargo.id === optimisticCargo.id ? response.data : cargo
                )
              )
            }
            
            // Refresh data in background to ensure sync
            loadData()
            loadPortMovement()
          })
          .catch((createError: any) => {
            // Error - remove optimistic cargo
            console.error('❌ Error creating cargo:', createError)
            const errorMessage = createError?.response?.data?.detail || createError?.message || 'Unknown error occurred'
            
            // Remove optimistic cargo
            setPortMovement(prevCargos =>
              prevCargos.filter(cargo => cargo.id !== optimisticCargo.id)
            )
            
            // Reopen dialog
            setCargoDialogOpen(true)
            alert(`Error creating cargo: ${errorMessage}\n\nChanges have been reverted. Please try again.`)
          })
      }
    } catch (error: any) {
      console.error('Error in handleCargoSubmit:', error)
      const errorMessage = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Unknown error occurred'
      alert(`Error saving vessel: ${errorMessage}`)
    }
  }

  const getCustomerName = (customerId: number) => {
    const customer = customers.find((c) => c.id === customerId)
    return customer ? customer.name : `Customer ID: ${customerId}`
  }

  const getProductName = (productName: string) => {
    return productName || '-'
  }

  const getLaycanDisplay = (monthlyPlan: MonthlyPlan, contract: Contract | null) => {
    if (!contract) {
      return 'TBA'
    }

    // CIF: use Loading Window as the laycan shown in Port Movement
    if (contract.contract_type === 'CIF') {
      return monthlyPlan.loading_window || 'TBA'
    }
    
    // FOB laycan display
    if (contract.contract_type !== 'FOB') {
      return 'TBA'
    }
    
    // Priority: 2 days > 5 days > TBA
    if (monthlyPlan.laycan_2_days) {
      return monthlyPlan.laycan_2_days
    }
    if (monthlyPlan.laycan_5_days) {
      return monthlyPlan.laycan_5_days
    }
    return 'TBA'
  }

  const getContractNumber = (contractId: number) => {
    const contract = contracts.find((c) => c.id === contractId)
    if (contract && contract.contract_number) {
      return contract.contract_number
    }
    // If contract not found, try to return a fallback
    return contractId ? `Contract ID: ${contractId}` : '-'
  }

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue)
    // When switching to Completed Cargos tab, ensure data is loaded
    if (newValue === 2) {
      loadData()
      loadMonthlyPlansForPortMovement()
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
      'Planned': 'info',
      'Loading': 'warning',
      'Pending Nomination': 'warning', // Will use custom yellow styling instead
      'Pending TL Approval': 'error', // Will use custom red styling instead
      'Nomination Released': 'success', // Will use custom light green styling instead
      'Completed Loading': 'success',
      'In-Road (Pending Discharge)': 'secondary',
    }
    return colors[status] || 'default'
  }

  // Helper function to get custom styling for status chips
  const getStatusChipProps = (status: string) => {
    if (status === 'Planned') {
      return {
        sx: {
          backgroundColor: '#bbdefb', // Light blue
          color: '#0d47a1',
          '&:hover': {
            backgroundColor: '#90caf9',
          }
        }
      }
    }
    if (status === 'Loading') {
      return {
        sx: {
          backgroundColor: '#ffcc80', // Light orange
          color: '#000',
          '&:hover': {
            backgroundColor: '#ffb74d', // Slightly darker light orange on hover
          }
        }
      }
    }
    if (status === 'Pending Nomination') {
      return {
        sx: {
          backgroundColor: '#ffeb3b', // Yellow
          color: '#000',
          '&:hover': {
            backgroundColor: '#fdd835', // Darker yellow on hover
          }
        }
      }
    }
    if (status === 'Pending TL Approval') {
      return {
        sx: {
          backgroundColor: '#f44336', // Red
          color: '#fff',
          '&:hover': {
            backgroundColor: '#d32f2f', // Darker red on hover
          }
        }
      }
    }
    if (status === 'Nomination Released') {
      return {
        sx: {
          backgroundColor: '#c8e6c9', // Light green
          color: '#1b5e20', // Dark green text for contrast
          '&:hover': {
            backgroundColor: '#a5d6a7', // Slightly darker light green on hover
          }
        }
      }
    }
    if (status === 'Completed Loading') {
      return {
        sx: {
          backgroundColor: '#c8e6c9', // Light green
          color: '#1b5e20',
          '&:hover': {
            backgroundColor: '#a5d6a7',
          }
        }
      }
    }
    if (status === 'In-Road (Pending Discharge)') {
      return {
        sx: {
          backgroundColor: '#e0e0e0', // Light grey
          color: '#424242',
          '&:hover': {
            backgroundColor: '#d5d5d5',
          }
        }
      }
    }
    return {}
  }

  // Helper function to get custom styling for LC status chips (pastel/light colors)
  const getLCStatusChipProps = (status: LCStatus | undefined) => {
    if (!status) return {}

    switch (status) {
      case 'LC in Order':
        return {
          sx: {
            backgroundColor: '#c8e6c9', // Light green
            color: '#1b5e20',
            '&:hover': { backgroundColor: '#a5d6a7' }
          }
        }
      case 'LC Not in Order':
        return {
          sx: {
            backgroundColor: '#ffcdd2', // Light red
            color: '#b71c1c',
            '&:hover': { backgroundColor: '#ef9a9a' }
          }
        }
      case 'Pending LC':
        return {
          sx: {
            backgroundColor: '#ffe0b2', // Light orange
            color: '#e65100',
            '&:hover': { backgroundColor: '#ffcc80' }
          }
        }
      case 'LC Memo Issued':
      default:
        return {
          sx: {
            backgroundColor: '#fff9c4', // Light yellow
            color: '#7a5d00',
            '&:hover': { backgroundColor: '#fff59d' }
          }
        }
    }
  }

  const renderCargoTable = (cargos: Cargo[]) => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )
    }

    if (cargos.length === 0) {
      return (
        <Typography variant="body1" color="text.secondary" sx={{ p: 2 }}>
          No cargos found
        </Typography>
      )
    }

    return (
      <TableContainer 
        component={Paper}
        sx={{
          maxWidth: '100%',
          overflowX: 'auto',
          '& .MuiTable-root': {
            minWidth: isMobile ? 800 : 'auto',
          },
        }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Vessel Name</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Customer</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Product</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Contract</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Load Port(s)</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 150 : 'auto', fontWeight: 'bold' }}>Remark</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {cargos.map((cargo) => (
              <TableRow 
                key={cargo.id}
                onClick={() => handleEditCargo(cargo)}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { bgcolor: 'action.hover' },
                  '& td': { 
                    minHeight: isMobile ? 56 : 48,
                    py: isMobile ? 1.5 : 1,
                  }
                }}
              >
                <TableCell>{cargo.vessel_name}</TableCell>
                <TableCell>{getCustomerName(cargo.customer_id)}</TableCell>
                <TableCell>{getProductName(cargo.product_name)}</TableCell>
                <TableCell>{getContractNumber(cargo.contract_id)}</TableCell>
                <TableCell>
                  <Chip 
                    label={cargo.status} 
                    color={getStatusColor(cargo.status)} 
                    size="small" 
                    {...getStatusChipProps(cargo.status)}
                  />
                </TableCell>
                <TableCell>{cargo.load_ports}</TableCell>
                <TableCell>{cargo.notes || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  const handleTaskCompletion = async (cargoId: number, taskType: 'sailing_fax_entry' | 'documents_mailing' | 'inspector_invoice', completed: boolean, initials: string) => {
    try {
      const updateData: any = {}
      const dateField = `${taskType}_date`
      const completedField = `${taskType}_completed`
      const initialsField = `${taskType}_initials`

      updateData[completedField] = completed
      if (completed) {
        updateData[initialsField] = initials
        updateData[dateField] = new Date().toISOString()
      } else {
        updateData[initialsField] = null
        updateData[dateField] = null
      }

      // Find the cargo to update
      const cargoToUpdate = [...portMovement, ...completedCargos, ...inRoadCIF].find(c => c.id === cargoId)
      if (!cargoToUpdate) {
        alert('Cargo not found')
        return
      }
      
      // Save original for rollback
      const originalCargo = { ...cargoToUpdate }
      
      // OPTIMISTIC UPDATE: Update UI immediately
      const updatedCargo = { ...cargoToUpdate, ...updateData }
      
      setPortMovement(prev => prev.map(c => c.id === cargoId ? updatedCargo : c))
      setCompletedCargos(prev => prev.map(c => c.id === cargoId ? updatedCargo : c))
      setInRoadCIF(prev => prev.map(c => c.id === cargoId ? updatedCargo : c))
      
      // Send API call in background
      cargoAPI.update(cargoId, updateData)
        .then(() => {
          // Success - refresh in background
          loadData()
        })
        .catch((error) => {
          // Error - revert
          console.error('Error updating task:', error)
          setPortMovement(prev => prev.map(c => c.id === cargoId ? originalCargo : c))
          setCompletedCargos(prev => prev.map(c => c.id === cargoId ? originalCargo : c))
          setInRoadCIF(prev => prev.map(c => c.id === cargoId ? originalCargo : c))
          alert('Error updating task. Changes have been reverted. Please try again.')
        })
    } catch (error) {
      console.error('Error updating task:', error)
      alert('Error updating task. Please try again.')
    }
  }

  const renderCompletedCargosTable = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )
    }

    // Filter completed cargos by search term
    const filteredCompletedCargos = completedCargos.filter((cargo) => {
      if (completedCargosSearch.trim() === '') {
        return true
      }
      
      const searchLower = completedCargosSearch.toLowerCase().trim()
      const searchTerms = searchLower.split(' ').filter(term => term.length > 0)
      
      // Find contract for this cargo
      const contract = contracts.find((c) => {
        return Number(c.id) === Number(cargo.contract_id)
      })
      const contractNumber = contract?.contract_number || (cargo.contract_id ? `Contract ID: ${cargo.contract_id}` : '-')
      const customerName = getCustomerName(cargo.customer_id)
      const productName = getProductName(cargo.product_name)
      
      // Check if any search term matches
      const matchesSearch = searchTerms.some(term => {
        const vesselMatch = cargo.vessel_name.toLowerCase().includes(term)
        const customerMatch = customerName.toLowerCase().includes(term)
        const contractMatch = contractNumber.toLowerCase().includes(term)
        const productMatch = productName.toLowerCase().includes(term)
        return vesselMatch || customerMatch || contractMatch || productMatch
      })
      
      return matchesSearch
    })

    if (filteredCompletedCargos.length === 0) {
      return (
        <Typography variant="body1" color="text.secondary" sx={{ p: 2 }}>
          {completedCargos.length === 0 
            ? 'No completed cargos found'
            : 'No completed cargos match the search criteria'}
        </Typography>
      )
    }

    return (
      <TableContainer 
        component={Paper}
        sx={{
          maxWidth: '100%',
          overflowX: 'auto',
          '& .MuiTable-root': {
            minWidth: isMobile ? 1000 : 'auto',
          },
        }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Vessel Name</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Customer</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Product</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>FOB/CIF</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Payment Method</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>LC Status</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Contract</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Quantity</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Laycan</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 150 : 'auto', fontWeight: 'bold' }}>Sailing Fax Entry</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 150 : 'auto', fontWeight: 'bold' }}>Documents Mailing</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 150 : 'auto', fontWeight: 'bold' }}>Inspector Invoice</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCompletedCargos.map((cargo) => {
              // Find contract by matching cargo.contract_id with contract.id
              // This gets the contract_number field that was entered in Contract Management
              const contract = contracts.find((c) => {
                return Number(c.id) === Number(cargo.contract_id)
              })
              
              // Display contract_number (the field typed in Contract Management page)
              const contractNumber = contract?.contract_number || (cargo.contract_id ? `Contract ID: ${cargo.contract_id}` : '-')
              
              return (
                <TableRow 
                  key={cargo.id}
                  onClick={() => handleEditCargo(cargo)}
                  sx={{ 
                    cursor: 'pointer', 
                    '&:hover': { bgcolor: 'action.hover' },
                    '& td': { 
                      minHeight: isMobile ? 56 : 48,
                      py: isMobile ? 1.5 : 1,
                    }
                  }}
                >
                  <TableCell>{cargo.vessel_name}</TableCell>
                  <TableCell>{getCustomerName(cargo.customer_id)}</TableCell>
                  <TableCell>{getProductName(cargo.product_name)}</TableCell>
                  <TableCell>
                    <Chip
                      label={cargo.contract_type || '-'}
                      color={cargo.contract_type === 'FOB' ? 'primary' : 'secondary'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {contract && contract.payment_method ? (
                      <Chip
                        label={contract.payment_method}
                        color={contract.payment_method === 'T/T' ? 'success' : 'secondary'}
                        sx={{
                          bgcolor: contract.payment_method === 'LC' ? '#9c27b0' : undefined,
                          color: contract.payment_method === 'LC' ? '#fff' : undefined,
                        }}
                        size="small"
                      />
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {contract && contract.payment_method === 'LC' ? (
                      cargo && cargo.lc_status ? (
                        <Chip
                          label={cargo.lc_status}
                          color="default"
                          size="small"
                          {...getLCStatusChipProps(cargo.lc_status)}
                        />
                      ) : (
                        <Chip label="-" color="default" size="small" />
                      )
                    ) : (
                      <Chip label="-" color="default" size="small" />
                    )}
                  </TableCell>
                  <TableCell>{contractNumber || '-'}</TableCell>
                  <TableCell>{cargo.cargo_quantity}</TableCell>
                <TableCell>
                    {(() => {
                      // Get laycan from monthly plan (2 days > 5 days > TBA)
                      const monthlyPlan = monthlyPlans.find(mp => mp.id === cargo.monthly_plan_id)
                      if (monthlyPlan) {
                        const contract = getContractForMonthlyPlan(monthlyPlan)
                        return getLaycanDisplay(monthlyPlan, contract)
                      }
                      return 'TBA'
                    })()}
                </TableCell>
                <TableCell>
                  <Box 
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={cargo.sailing_fax_entry_completed || false}
                      onChange={(e) => {
                        const checked = e.target.checked
                        const initials = checked 
                          ? prompt('Enter your initials:') || ''
                          : ''
                        if (checked && !initials) {
                          return
                        }
                        handleTaskCompletion(cargo.id, 'sailing_fax_entry', checked, initials)
                      }}
                      color="primary"
                      sx={{ 
                        minWidth: isMobile ? 48 : 40,
                        minHeight: isMobile ? 48 : 40,
                      }}
                    />
                    {cargo.sailing_fax_entry_completed && (
                      <Box>
                        <Typography variant="caption" display="block" fontWeight="bold">
                          {cargo.sailing_fax_entry_initials}
                        </Typography>
                        {cargo.sailing_fax_entry_date && (
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(cargo.sailing_fax_entry_date), 'MMM dd, yyyy')}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box 
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={cargo.documents_mailing_completed || false}
                      onChange={(e) => {
                        const checked = e.target.checked
                        const initials = checked 
                          ? prompt('Enter your initials:') || ''
                          : ''
                        if (checked && !initials) {
                          return
                        }
                        handleTaskCompletion(cargo.id, 'documents_mailing', checked, initials)
                      }}
                      color="primary"
                      sx={{ 
                        minWidth: isMobile ? 48 : 40,
                        minHeight: isMobile ? 48 : 40,
                      }}
                    />
                    {cargo.documents_mailing_completed && (
                      <Box>
                        <Typography variant="caption" display="block" fontWeight="bold">
                          {cargo.documents_mailing_initials}
                        </Typography>
                        {cargo.documents_mailing_date && (
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(cargo.documents_mailing_date), 'MMM dd, yyyy')}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box 
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={cargo.inspector_invoice_completed || false}
                      onChange={(e) => {
                        const checked = e.target.checked
                        const initials = checked 
                          ? prompt('Enter your initials:') || ''
                          : ''
                        if (checked && !initials) {
                          return
                        }
                        handleTaskCompletion(cargo.id, 'inspector_invoice', checked, initials)
                      }}
                      color="primary"
                      sx={{ 
                        minWidth: isMobile ? 48 : 40,
                        minHeight: isMobile ? 48 : 40,
                      }}
                    />
                    {cargo.inspector_invoice_completed && (
                      <Box>
                        <Typography variant="caption" display="block" fontWeight="bold">
                          {cargo.inspector_invoice_initials}
                        </Typography>
                        {cargo.inspector_invoice_date && (
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(cargo.inspector_invoice_date), 'MMM dd, yyyy')}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }


  const renderPortMovementTable = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )
    }

    // Helper to get laycan for a cargo - always from monthly plan (2 days > 5 days > TBA)
    const getCargoLaycan = (cargo: Cargo): string => {
      // Always get from monthly plan, priority: laycan_2_days > laycan_5_days > TBA
      const monthlyPlan = monthlyPlans.find(mp => mp.id === cargo.monthly_plan_id)
      if (monthlyPlan) {
        const contract = getContractForMonthlyPlan(monthlyPlan)
        return getLaycanDisplay(monthlyPlan, contract)
      }
      return 'TBA'
    }

    // Helper to extract date from laycan string for sorting
    // Formats: "02-03", "02-03/11", "2-3/11", "2-3", "15-20 Nov 2024", "15 Nov 2024"
    const getLaycanSortValue = (laycan: string): number => {
      if (laycan === 'TBA' || laycan === '-') return 9999999999999 // Put TBA at the end
      
      // Extract the first day number (e.g., "02-03" -> 2, "2-3/11" -> 2)
      const dayMatch = laycan.match(/^(\d{1,2})/)
      if (!dayMatch) return 0
      const day = parseInt(dayMatch[1])
      
      // Try to extract month and year from formats like "02-03/11" or "15-20 Nov 2024"
      // Format: "DD-DD/MM" or "DD-DD MM YYYY"
      const monthYearMatch = laycan.match(/(\d{1,2})[\s-]+\d{1,2}[\s/]+(\d{1,2})/) // Matches "02-03/11"
      if (monthYearMatch) {
        const month = parseInt(monthYearMatch[2])
        // Assume current year or selected year if month is provided
        const year = selectedYear || new Date().getFullYear()
        return year * 10000 + month * 100 + day
      }
      
      // Try to extract month name and year (format: "15-20 Nov 2024" or "15 Nov 2024")
      const monthNameMatch = laycan.match(/(\d{1,2})[\s-]+\d{0,2}[\s-]*([a-z]{3})[\s-]+(\d{4})/i)
      if (monthNameMatch) {
        const year = parseInt(monthNameMatch[3])
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        const monthName = monthNameMatch[2].toLowerCase()
        const month = monthNames.indexOf(monthName) + 1
        if (month > 0) {
          return year * 10000 + month * 100 + day
        }
      }
      
      // If only day is found (e.g., "02-03" or "2-3"), use the first selected month and year
      const month = selectedMonths?.[0] || new Date().getMonth() + 1
      const year = selectedYear || new Date().getFullYear()
      return year * 10000 + month * 100 + day
    }

    // Get all cargos with their laycan and contract info
    // Deduplicate cargos: if multiple cargos have same vessel_name, contract_id, monthly_plan_id, and product_name, keep only the most recent one
    const seenCargos = new Map<string, Cargo>()
    portMovement.forEach(cargo => {
      const key = `${cargo.vessel_name}_${cargo.contract_id}_${cargo.monthly_plan_id}_${cargo.product_name}`
      const existing = seenCargos.get(key)
      if (!existing || (cargo.id && existing.id && cargo.id > existing.id)) {
        // Keep the cargo with the higher ID (more recent)
        seenCargos.set(key, cargo)
      }
    })
    const uniqueCargos = Array.from(seenCargos.values())
    
    const cargosWithInfo = uniqueCargos.map(cargo => {
      const monthlyPlan = monthlyPlans.find(mp => mp.id === cargo.monthly_plan_id)
      const contract = monthlyPlan ? getContractForMonthlyPlan(monthlyPlan) : null
      const customer = contract ? customers.find(c => c.id === contract.customer_id) : null
      const laycan = getCargoLaycan(cargo)
      
      return {
        cargo,
        monthlyPlan,
        contract,
        customer,
        laycan,
        laycanSortValue: getLaycanSortValue(laycan),
        isMonthlyPlan: false // Flag to indicate this is a cargo row
      }
    })
    
    // Also add monthly plans that don't have cargos yet
    // Check all cargo arrays (portMovement, completedCargos, inRoadCIF) to see if monthly plan has any cargo
    const allCargos = [...portMovement, ...completedCargos, ...inRoadCIF]
    const monthlyPlansWithoutCargos = monthlyPlans.filter(mp => {
      // Only show monthly plan if it has NO cargos at all (not in port movement, not completed, not in-road)
      return !allCargos.some(cargo => cargo.monthly_plan_id === mp.id)
    })
    
    const monthlyPlansWithInfo = monthlyPlansWithoutCargos.map(monthlyPlan => {
      const contract = getContractForMonthlyPlan(monthlyPlan)
      const customer = contract ? customers.find(c => c.id === contract.customer_id) : null
      
      // Get laycan from monthly plan:
      // - FOB: laycan_2_days > laycan_5_days > TBA
      // - CIF: loading_window (fallback TBA)
      const laycan = getLaycanDisplay(monthlyPlan, contract)
      
      return {
        cargo: null, // No cargo yet
        monthlyPlan,
        contract,
        customer,
        laycan,
        laycanSortValue: getLaycanSortValue(laycan),
        isMonthlyPlan: true // Flag to indicate this is a monthly plan row
      }
    })
    
    // Combine cargos and monthly plans
    const allRows = [...cargosWithInfo, ...monthlyPlansWithInfo]

    // Apply filters
    let filteredCargos = allRows.filter(({ cargo, contract, customer, isMonthlyPlan }) => {
      // Remove cargos that are currently Loading (they are shown in the port lanes above)
      if (cargo && isCargoInLoadingLanes(cargo)) {
        return false
      }
      // Filter by customer
      if (portMovementFilterCustomer !== null && (!customer || customer.id !== portMovementFilterCustomer)) {
        return false
      }
      
      // Filter by contract
      if (portMovementFilterContract !== null && (!contract || contract.id !== portMovementFilterContract)) {
        return false
      }
      
      // Filter by type (FOB/CIF)
      if (portMovementFilterType !== null && (!contract || contract.contract_type !== portMovementFilterType)) {
        return false
      }
      
      // Filter by product
      if (portMovementFilterProduct !== null) {
        if (!contract || !contract.products || !Array.isArray(contract.products)) {
          return false
        }
        const productNames = contract.products.map((p: ContractProduct) => p.name)
        if (!productNames.includes(portMovementFilterProduct)) {
          return false
        }
      }
      
      // Filter by status (only for cargos, not monthly plans)
      if (portMovementFilterStatus !== null) {
        if (isMonthlyPlan) {
          // For monthly plans, only show if status filter is "Not Created" or empty
          if (portMovementFilterStatus !== 'Not Created') {
            return false
          }
        } else if (cargo && cargo.status !== portMovementFilterStatus) {
          return false
        }
      }
      
      // Filter by search text
      if (portMovementSearch.trim() !== '') {
        const searchLower = portMovementSearch.toLowerCase().trim()
        const searchTerms = searchLower.split(' ').filter(term => term.length > 0)
        
        const matchesSearch = searchTerms.some(term => {
          const vesselMatch = cargo && cargo.vessel_name.toLowerCase().includes(term)
          const customerMatch = customer && customer.name.toLowerCase().includes(term)
          const contractMatch = contract && contract.contract_number.toLowerCase().includes(term)
          const productMatch = contract && contract.products && contract.products.some((p: ContractProduct) => 
            p.name.toLowerCase().includes(term)
          )
          return vesselMatch || customerMatch || contractMatch || productMatch
        })
        
        if (!matchesSearch) {
          return false
        }
      }
      
      return true
    })

    // Sort by laycan date
    filteredCargos.sort((a, b) => a.laycanSortValue - b.laycanSortValue)
    portMovementExportRowsRef.current = filteredCargos

    if (filteredCargos.length === 0 && portMovement.length === 0 && monthlyPlans.length === 0) {
      return (
        <Typography variant="body1" color="text.secondary" sx={{ p: 2 }}>
          No cargos or monthly plans found for {formatSelectedMonthsLabel(selectedMonths, selectedYear)}
        </Typography>
      )
    }

    if (filteredCargos.length === 0) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            No cargos match the selected filters
          </Typography>
          {(portMovementFilterCustomer !== null || portMovementFilterContract !== null || portMovementFilterType !== null || portMovementFilterProduct !== null || portMovementFilterStatus !== null || portMovementSearch.trim() !== '') && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setPortMovementFilterCustomer(null)
                setPortMovementFilterContract(null)
                setPortMovementFilterType(null)
                setPortMovementFilterProduct(null)
                setPortMovementFilterStatus(null)
                setPortMovementSearch('')
              }}
              sx={{ 
                fontSize: isMobile ? '0.7rem' : '0.75rem', 
                py: isMobile ? 1 : 0.5,
                minHeight: isMobile ? 40 : 32,
              }}
            >
              Clear All Filters
            </Button>
          )}
        </Box>
      )
    }

    return (
      <Box>
        <Box sx={{ mb: 2, p: { xs: 1, sm: 1.5 }, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Grid container spacing={{ xs: 1, sm: 1.5 }}>
            <Grid item xs={6} sm={4} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Customer</InputLabel>
                <Select
                  value={portMovementFilterCustomer || ''}
                  label="Customer"
                  onChange={(e) => setPortMovementFilterCustomer(e.target.value === '' ? null : Number(e.target.value))}
                  sx={{ fontSize: '0.875rem' }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>All Customers</MenuItem>
                  {customers.map((customer) => (
                    <MenuItem key={customer.id} value={customer.id} sx={{ fontSize: '0.875rem' }}>
                      {customer.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Contract</InputLabel>
                <Select
                  value={portMovementFilterContract || ''}
                  label="Contract"
                  onChange={(e) => setPortMovementFilterContract(e.target.value === '' ? null : Number(e.target.value))}
                  sx={{ fontSize: '0.875rem' }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>All Contracts</MenuItem>
                  {contracts.map((contract) => (
                    <MenuItem key={contract.id} value={contract.id} sx={{ fontSize: '0.875rem' }}>
                      {contract.contract_number}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Type</InputLabel>
                <Select
                  value={portMovementFilterType || ''}
                  label="Type"
                  onChange={(e) => setPortMovementFilterType(e.target.value === '' ? null : e.target.value)}
                  sx={{ fontSize: '0.875rem' }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>All Types</MenuItem>
                  <MenuItem value="FOB" sx={{ fontSize: '0.875rem' }}>FOB</MenuItem>
                  <MenuItem value="CIF" sx={{ fontSize: '0.875rem' }}>CIF</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Product</InputLabel>
                <Select
                  value={portMovementFilterProduct || ''}
                  label="Product"
                  onChange={(e) => setPortMovementFilterProduct(e.target.value === '' ? null : e.target.value)}
                  sx={{ fontSize: '0.875rem' }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>All Products</MenuItem>
                  <MenuItem value="JET-A1" sx={{ fontSize: '0.875rem' }}>JET-A1</MenuItem>
                  <MenuItem value="GASOIL" sx={{ fontSize: '0.875rem' }}>GASOIL</MenuItem>
                  <MenuItem value="GASOIL 10PPM" sx={{ fontSize: '0.875rem' }}>GASOIL 10PPM</MenuItem>
                  <MenuItem value="HFO" sx={{ fontSize: '0.875rem' }}>HFO</MenuItem>
                  <MenuItem value="LSFO" sx={{ fontSize: '0.875rem' }}>LSFO</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Status</InputLabel>
                <Select
                  value={portMovementFilterStatus || ''}
                  label="Status"
                  onChange={(e) => setPortMovementFilterStatus(e.target.value === '' ? null : e.target.value)}
                  sx={{ fontSize: '0.875rem' }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>All Statuses</MenuItem>
                  <MenuItem value="Planned" sx={{ fontSize: '0.875rem' }}>Planned</MenuItem>
                  <MenuItem value="Loading" sx={{ fontSize: '0.875rem' }}>Loading</MenuItem>
                  <MenuItem value="Completed Loading" sx={{ fontSize: '0.875rem' }}>Completed Loading</MenuItem>
                  <MenuItem value="In-Road (Pending Discharge)" sx={{ fontSize: '0.875rem' }}>In-Road (Pending Discharge)</MenuItem>
                  <MenuItem value="Not Created" sx={{ fontSize: '0.875rem' }}>Not Created</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <TextField
                size="small"
                placeholder="Search vessel, customer, contract, product..."
                value={portMovementSearch}
                onChange={(e) => setPortMovementSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ display: 'flex', alignItems: 'center', mr: 1, color: 'text.secondary' }}>
                      <Search fontSize="small" />
                    </Box>
                  ),
                }}
                fullWidth
                sx={{ 
                  fontSize: '0.875rem',
                }}
              />
            </Grid>
          </Grid>
          {(portMovementFilterCustomer !== null || portMovementFilterContract !== null || portMovementFilterType !== null || portMovementFilterProduct !== null || portMovementFilterStatus !== null) && (
            <Box sx={{ mt: 1.5 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setPortMovementFilterCustomer(null)
                  setPortMovementFilterContract(null)
                  setPortMovementFilterType(null)
                  setPortMovementFilterProduct(null)
                  setPortMovementFilterStatus(null)
                }}
                sx={{ 
                  fontSize: isMobile ? '0.7rem' : '0.75rem', 
                  py: isMobile ? 1 : 0.5,
                  minHeight: isMobile ? 40 : 32,
                }}
              >
                Clear All Filters
              </Button>
            </Box>
          )}
        </Box>
        <TableContainer 
          component={Paper}
          sx={{
            maxWidth: '100%',
            overflowX: 'auto',
            '& .MuiTable-root': {
              minWidth: isMobile ? 1200 : 'auto',
            },
            '& .MuiTableHead-root': {
              '& .MuiTableCell-root': {
                whiteSpace: 'normal',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                wordBreak: 'normal', // Only wrap at spaces, don't break single words
              }
            },
            '& .MuiTableBody-root': {
              '& .MuiTableCell-root': {
                whiteSpace: 'normal',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                wordBreak: 'normal', // Only wrap at spaces, don't break single words
              }
            }
          }}
        >
          <Table stickyHeader sx={{ tableLayout: 'auto' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: isMobile ? 100 : 120, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Vessel Name</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 120, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Customer Name</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 120, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Contract Number</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 80 : 90, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>FOB/CIF</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 120, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Payment Method</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 110, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>LC Status</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 80 : 100, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Product</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 120, fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Laycan</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 80 : 100, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Quantity</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 120, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Load Port</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 110, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Inspector</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 80 : 100, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Status</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 150, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Remark</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 120, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredCargos.map(({ cargo, contract, customer, laycan, isMonthlyPlan, monthlyPlan }) => (
                    <TableRow 
                  key={cargo ? `cargo-${cargo.id}` : `monthly-plan-${monthlyPlan.id}`}
                  onClick={() => {
                    if (isMonthlyPlan && monthlyPlan) {
                      handleCreateCargoForPlan(monthlyPlan)
                    } else if (cargo) {
                      handleEditCargo(cargo)
                    }
                  }}
                      sx={{ 
                        cursor: 'pointer', 
                        '&:hover': { bgcolor: 'action.hover' },
                        '& td': { 
                          minHeight: isMobile ? 56 : 48,
                          py: isMobile ? 1.5 : 1,
                    },
                    bgcolor: isMonthlyPlan ? 'action.selected' : 'inherit'
                  }}
                >
                      <TableCell sx={{ 
                        minWidth: isMobile ? 120 : 'auto',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal'
                      }}>
                    {cargo ? cargo.vessel_name : 'TBA'}
                      </TableCell>
                  <TableCell sx={{ 
                            minWidth: isMobile ? 120 : 'auto',
                            whiteSpace: 'normal',
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            wordBreak: 'normal'
                  }}>
                          {customer ? customer.name : '-'}
                        </TableCell>
                  <TableCell sx={{ 
                            minWidth: isMobile ? 120 : 'auto',
                            whiteSpace: 'normal',
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            wordBreak: 'normal'
                  }}>
                          {contract ? contract.contract_number : '-'}
                        </TableCell>
                  <TableCell sx={{ 
                            minWidth: isMobile ? 100 : 'auto',
                            whiteSpace: 'normal',
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            wordBreak: 'normal'
                  }}>
                          {contract ? (
                            <Chip
                              label={contract.contract_type}
                              color={contract.contract_type === 'FOB' ? 'primary' : 'secondary'}
                              size="small"
                            />
                          ) : '-'}
                        </TableCell>
                      <TableCell sx={{ 
                        minWidth: isMobile ? 100 : 'auto',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal'
                      }}>
                          {contract && contract.payment_method ? (
                            <Chip
                              label={contract.payment_method}
                              color={contract.payment_method === 'T/T' ? 'success' : undefined}
                              sx={contract.payment_method === 'LC' ? {
                                backgroundColor: '#9c27b0',
                                color: 'white',
                                '&:hover': {
                                  backgroundColor: '#7b1fa2',
                                }
                              } : {}}
                              size="small"
                            />
                          ) : '-'}
                      </TableCell>
                  <TableCell sx={{ 
                            minWidth: isMobile ? 120 : 'auto',
                            whiteSpace: 'normal',
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            wordBreak: 'normal'
                  }}>
                          {contract && contract.payment_method === 'LC' ? (
                            cargo && cargo.lc_status ? (
                              <Chip
                                label={cargo.lc_status}
                                color="default"
                                size="small"
                                {...getLCStatusChipProps(cargo.lc_status)}
                              />
                            ) : (
                              <Chip label="-" color="default" size="small" />
                            )
                          ) : (
                            <Chip label="-" color="default" size="small" />
                          )}
                        </TableCell>
                      <TableCell sx={{ 
                        minWidth: isMobile ? 100 : 'auto',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal'
                      }}>
                        {contract && contract.products && contract.products.length > 0
                            ? contract.products.map((p: ContractProduct) => p.name).join(', ')
                          : '-'}
                      </TableCell>
                  <TableCell sx={{ 
                            minWidth: isMobile ? 100 : 120,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {(() => {
                        // Calculate alert for this laycan
                        const planForRow = cargo 
                          ? monthlyPlans.find(mp => mp.id === cargo.monthly_plan_id)
                          : monthlyPlan
                        if (!planForRow) return laycan
                        
                        const contractForRow = getContractForMonthlyPlan(planForRow)
                        const laycanString = contractForRow?.contract_type === 'FOB' 
                          ? (planForRow.laycan_2_days || planForRow.laycan_5_days)
                          : (cargo?.laycan_window)
                        
                        if (!laycanString || laycanString === 'TBA' || laycanString === '-') {
                          return laycan
                        }
                        
                        const laycanDate = parseLaycanDate(laycanString, planForRow.month, planForRow.year)
                        if (!laycanDate.isValid || laycanDate.daysUntil === null) {
                          return laycan
                        }
                        
                        const severity = getLaycanAlertSeverity(laycanDate.daysUntil)
                        if (severity === 'none') {
                          return laycan
                        }
                        
                        const alertColor = getAlertColor(severity)
                        const alertMessage = getAlertMessage(laycanDate.daysUntil, laycanDate.isOverdue)
                        
                        return (
                          <>
                            <Tooltip title={alertMessage} arrow>
                              <Badge
                                variant="dot"
                                color={alertColor}
                                sx={{
                                  '& .MuiBadge-dot': {
                                    width: 8,
                                    height: 8,
                                  },
                                }}
                              >
                                <span style={{ width: 0, height: 0 }} />
                              </Badge>
                            </Tooltip>
                            <span>{laycan}</span>
                          </>
                        )
                      })()}
                    </Box>
                        </TableCell>
                      <TableCell sx={{ 
                        minWidth: isMobile ? 80 : 100,
                        whiteSpace: 'normal',
                        wordBreak: 'normal',
                        overflowWrap: 'anywhere'
                      }}>
                    {cargo ? cargo.cargo_quantity : (monthlyPlan ? monthlyPlan.month_quantity : '-')}
                      </TableCell>
                      <TableCell sx={{ 
                        minWidth: isMobile ? 120 : 'auto',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal'
                      }}>
                    {cargo ? (cargo.load_ports || '-') : (contract ? (contract.allowed_load_ports || '-') : '-')}
                      </TableCell>
                      <TableCell sx={{ 
                        minWidth: isMobile ? 120 : 'auto',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal'
                      }}>
                    {cargo ? (cargo.inspector_name || '-') : '-'}
                      </TableCell>
                      <TableCell sx={{ 
                        minWidth: isMobile ? 120 : 'auto',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal'
                      }}>
                        {cargo ? (
                          <Chip 
                            label={cargo.status} 
                            color={getStatusColor(cargo.status)} 
                            size="small" 
                            {...getStatusChipProps(cargo.status)}
                          />
                        ) : (
                      <Chip label="Not Created" color="default" size="small" />
                        )}
                      </TableCell>
                      <TableCell sx={{ 
                        minWidth: isMobile ? 150 : 'auto',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal'
                      }}>
                        {cargo ? (cargo.notes || '-') : '-'}
                      </TableCell>
                      <TableCell sx={{ 
                        minWidth: isMobile ? 100 : 120,
                        whiteSpace: 'nowrap'
                      }}>
                        {cargo && (
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<Description />}
                            onClick={(e) => handleGenerateNomination(cargo.id, e)}
                            sx={{ 
                              fontSize: isMobile ? '0.7rem' : '0.75rem',
                              minWidth: isMobile ? 'auto' : 120,
                              px: isMobile ? 1 : 1.5,
                            }}
                          >
                            {isMobile ? 'Nom' : 'Nomination'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    )
  }

  return (
    <Box>
        {laycanAlerts.totalCount > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <NotificationBadge
            alerts={laycanAlerts.alerts}
            criticalCount={laycanAlerts.criticalCount}
            warningCount={laycanAlerts.warningCount}
            infoCount={laycanAlerts.infoCount}
          />
      </Box>
      )}
      <Paper sx={{ mt: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={value} 
            onChange={handleChange} 
            aria-label="homepage tabs"
            variant={isMobile ? 'scrollable' : 'standard'}
            scrollButtons={isMobile ? 'auto' : false}
            sx={{
              '& .MuiTab-root': {
                minHeight: isMobile ? 48 : 48,
                fontSize: isMobile ? '0.75rem' : '0.875rem',
                px: isMobile ? 1 : 2,
              },
            }}
          >
            <Tab label={isMobile ? "Port" : "Port Movement"} />
            <Tab label={isMobile ? "Completed" : "Completed Cargos"} />
            <Tab label={isMobile ? "In-Road" : "In-Road CIF Cargos"} />
            <Tab label={isMobile ? "Completed In-Road" : "Completed In-Road CIF"} />
          </Tabs>
        </Box>
        <TabPanel value={value} index={0}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Port Movement
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<FileDownload />}
                onClick={handlePortMovementExportToExcel}
                sx={{
                  fontSize: isMobile ? '0.75rem' : '0.875rem',
                  minHeight: isMobile ? 40 : 36,
                  px: isMobile ? 1.5 : 2,
                }}
              >
                Export to Excel
              </Button>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Month</InputLabel>
                <Select
                  multiple
                  value={selectedMonths}
                  label="Month"
                  onChange={(e) => {
                    const raw = e.target.value as unknown as number[]
                    const next = Array.isArray(raw) ? raw.map((v) => Number(v)) : []
                    if (next.includes(-1)) {
                      setSelectedMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
                    } else {
                      setSelectedMonths(next.filter((m) => m >= 1 && m <= 12))
                    }
                  }}
                  renderValue={(selected) => {
                    const months = (selected as number[]).slice().sort((a, b) => a - b)
                    if (months.length === 0) return 'Select month(s)'
                    if (months.length === 12) return 'All Months'
                    return (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {months.map((month) => (
                          <Chip
                            key={month}
                            label={new Date(2000, month - 1).toLocaleString('default', { month: 'short' })}
                            size="small"
                          />
                        ))}
                      </Box>
                    )
                  }}
                >
                  <MenuItem value={-1}>
                    <Checkbox checked={selectedMonths.length === 12} />
                    <ListItemText primary="All Months" />
                  </MenuItem>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => (
                    <MenuItem key={month} value={month}>
                      <Checkbox checked={selectedMonths.indexOf(month) > -1} />
                      <ListItemText primary={new Date(2000, month - 1).toLocaleString('default', { month: 'long' })} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Year</InputLabel>
                <Select
                  value={selectedYear}
                  label="Year"
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                    <MenuItem key={year} value={year}>
                      {year}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>
          
          {/* Load Port Sections: same "one-line" look as Port Movement table, but per-port ops editable inline */}
          <Paper
            variant="outlined"
            sx={{
              mb: 2,
              borderRadius: 2,
              overflow: 'hidden',
              borderColor: alpha(theme.palette.info.main, 0.35),
              bgcolor: alpha(theme.palette.info.main, 0.03),
            }}
          >
            <Box
              sx={{
                px: { xs: 1.5, sm: 2 },
                py: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                flexWrap: 'wrap',
                bgcolor: alpha(theme.palette.info.main, 0.12),
                borderBottom: `1px solid ${alpha(theme.palette.info.main, 0.25)}`,
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Active Loadings (by Load Port)
              </Typography>
            </Box>

            <Box sx={{ p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {PORT_SECTIONS.map((port) => {
                const rows = (
                  activeLoadings
                    .map((cargo) => ({ cargo, op: getPortOpForCargo(cargo, port) }))
                    // Show both Loading and Completed Loading so a completed port doesn't disappear
                    // until ALL ports complete (then it moves to Completed Cargos tab).
                    .filter((x) => x.op && (x.op.status === 'Loading' || x.op.status === 'Completed Loading'))
                ) as Array<{ cargo: Cargo; op: CargoPortOperation }>

                // Keep Loading first for quick visibility, then Completed Loading
                rows.sort((a, b) => (a.op.status === b.op.status ? 0 : a.op.status === 'Loading' ? -1 : 1))

                return (
                  <Box key={port}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 1,
                        px: 1.5,
                        py: 1,
                        borderRadius: 1,
                        bgcolor: alpha(theme.palette.info.main, 0.10),
                        border: `1px solid ${alpha(theme.palette.info.main, 0.22)}`,
                      }}
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        {port}
                      </Typography>
                      <Chip size="small" label={`${rows.length}`} />
                    </Box>

                  {rows.length === 0 ? (
                    <Paper sx={{ p: 2, borderRadius: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        No vessels loading
                      </Typography>
                    </Paper>
                  ) : (
                    <TableContainer
                      component={Paper}
                      sx={{
                        maxWidth: '100%',
                        overflowX: 'auto',
                        '& .MuiTable-root': {
                          minWidth: isMobile ? 1600 : 1500,
                        },
                      }}
                    >
                      <Table stickyHeader sx={{ tableLayout: 'auto' }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Vessel Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Customer Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Contract Number</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 90 }}>FOB/CIF</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Payment Method</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 110 }}>LC Status</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Product</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Laycan</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 90 }}>Quantity</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 110 }}>Load Port(s)</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 110 }}>Inspector</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 100 }}>Port Status</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>ETA</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Berthed</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Commenced</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>ETC</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 200 }}>Notes</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map(({ cargo, op }) => {
                            const monthlyPlan = monthlyPlans.find((mp) => mp.id === cargo.monthly_plan_id)
                            const contract = monthlyPlan ? getContractForMonthlyPlan(monthlyPlan) : null
                            const customer = contract ? customers.find((c) => c.id === contract.customer_id) : null
                            const laycan = getCargoLaycanForRow(cargo)

                            return (
                              <TableRow
                                key={`${cargo.id}:${port}`}
                                hover
                                sx={{ cursor: 'pointer' }}
                                onClick={() => handleEditCargo(cargo)}
                              >
                                <TableCell sx={{ fontWeight: 600 }}>{cargo.vessel_name}</TableCell>
                                <TableCell>{customer ? customer.name : '-'}</TableCell>
                                <TableCell>{contract ? contract.contract_number : '-'}</TableCell>
                                <TableCell>
                                  {contract ? (
                                    <Chip
                                      label={contract.contract_type}
                                      color={contract.contract_type === 'FOB' ? 'primary' : 'secondary'}
                                      size="small"
                                    />
                                  ) : (
                                    '-'
                                  )}
                                </TableCell>
                                <TableCell>
                                  {contract && contract.payment_method ? (
                                    <Chip
                                      label={contract.payment_method}
                                      color={contract.payment_method === 'T/T' ? 'success' : undefined}
                                      sx={
                                        contract.payment_method === 'LC'
                                          ? {
                                              backgroundColor: '#9c27b0',
                                              color: 'white',
                                              '&:hover': { backgroundColor: '#7b1fa2' },
                                            }
                                          : {}
                                      }
                                      size="small"
                                    />
                                  ) : (
                                    '-'
                                  )}
                                </TableCell>
                                <TableCell>
                                  {contract && contract.payment_method === 'LC' ? (
                                    cargo.lc_status ? (
                                      <Chip label={cargo.lc_status} size="small" {...getLCStatusChipProps(cargo.lc_status)} />
                                    ) : (
                                      <Chip label="-" size="small" />
                                    )
                                  ) : (
                                    <Chip label="-" size="small" />
                                  )}
                                </TableCell>
                                <TableCell>
                                  {contract && contract.products && contract.products.length > 0
                                    ? contract.products.map((p: ContractProduct) => p.name).join(', ')
                                    : '-'}
                                </TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>{laycan}</TableCell>
                                <TableCell>{cargo.cargo_quantity?.toLocaleString?.() ?? cargo.cargo_quantity}</TableCell>
                                <TableCell>{cargo.load_ports || '-'}</TableCell>
                                <TableCell>{cargo.inspector_name || '-'}</TableCell>

                                {/* Editable port operation fields */}
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <FormControl size="small" sx={{ minWidth: 140 }}>
                                    <Select
                                      value={op.status || 'Planned'}
                                      onChange={(e) =>
                                        schedulePortOpSave(cargo.id, port, { status: e.target.value as PortOperationStatus })
                                      }
                                    >
                                      {PORT_OP_STATUSES.map((s) => (
                                        <MenuItem key={s} value={s}>
                                          {s}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <TextField
                                    size="small"
                                    value={op.eta || ''}
                                    onChange={(e) => schedulePortOpSave(cargo.id, port, { eta: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <TextField
                                    size="small"
                                    value={op.berthed || ''}
                                    onChange={(e) => schedulePortOpSave(cargo.id, port, { berthed: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <TextField
                                    size="small"
                                    value={op.commenced || ''}
                                    onChange={(e) => schedulePortOpSave(cargo.id, port, { commenced: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <TextField
                                    size="small"
                                    value={op.etc || ''}
                                    onChange={(e) => schedulePortOpSave(cargo.id, port, { etc: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <TextField
                                    size="small"
                                    value={op.notes || ''}
                                    onChange={(e) => schedulePortOpSave(cargo.id, port, { notes: e.target.value })}
                                    fullWidth
                                  />
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  </Box>
                )
              })}
            </Box>
          </Paper>

          <Box sx={{ mt: 3, mb: 2 }}>
            <Divider sx={{ borderColor: theme.palette.divider, borderBottomWidth: 2 }} />
            <Box
              sx={{
                mt: 1.5,
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Planned / Upcoming Cargos
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Filtered by {formatSelectedMonthsLabel(selectedMonths, selectedYear)}
              </Typography>
            </Box>
          </Box>

          {renderPortMovementTable()}
        </TabPanel>
        <TabPanel value={value} index={1}>
          <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h6">
              Completed Cargos
            </Typography>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Month</InputLabel>
              <Select
                value={completedMonth || ''}
                label="Month"
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value)
                  setCompletedMonth(val)
                }}
              >
                <MenuItem value="">All Months</MenuItem>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <MenuItem key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Year</InputLabel>
              <Select
                value={completedYear || ''}
                label="Year"
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value)
                  setCompletedYear(val)
                }}
              >
                <MenuItem value="">All Years</MenuItem>
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="Search vessel, customer, contract, product..."
              value={completedCargosSearch}
              onChange={(e) => setCompletedCargosSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <Box sx={{ display: 'flex', alignItems: 'center', mr: 1, color: 'text.secondary' }}>
                    <Search fontSize="small" />
                  </Box>
                ),
              }}
              sx={{ 
                minWidth: isMobile ? '100%' : 300, 
                fontSize: '0.875rem',
              }}
            />
          </Box>
          {renderCompletedCargosTable()}
        </TabPanel>
        <TabPanel value={value} index={2}>
          <Typography variant="h6" gutterBottom>
            In-Road CIF Cargos (Pending Discharge)
          </Typography>
          {renderCargoTable(inRoadCIF)}
        </TabPanel>
        <TabPanel value={value} index={3}>
          <Typography variant="h6" gutterBottom>
            Completed In-Road CIF Cargos
          </Typography>
          {renderCargoTable(completedInRoadCIF)}
        </TabPanel>
      </Paper>

      {/* Cargo Creation/Edit Dialog */}
      <Dialog 
        open={cargoDialogOpen} 
        onClose={() => setCargoDialogOpen(false)} 
        maxWidth={isMobile ? false : "md"} 
        fullWidth={!isMobile}
        fullScreen={isMobile}
        sx={{
          '& .MuiDialog-paper': {
            m: isMobile ? 0 : 2,
            height: isMobile ? '100%' : 'auto',
            maxHeight: isMobile ? '100%' : '90vh',
          },
        }}
      >
        <DialogTitle sx={{ fontSize: isMobile ? '1.25rem' : '1.5rem', pb: isMobile ? 1 : 2 }}>
          {editingCargo ? 'Edit Vessel Details' : 'Add Vessel Details'}
        </DialogTitle>
        <DialogContent sx={{ px: isMobile ? 2 : 3, pt: isMobile ? 3 : 4, pb: isMobile ? 2 : 3, overflowY: 'auto' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 1.5 : 2, pt: 1 }}>
            {(() => {
              // Check if this is a completed cargo
              const isCompletedCargo = !!(editingCargo && editingCargo.status === 'Completed Loading')
              const disabledStyle = {
                '& .MuiInputBase-input.Mui-disabled': {
                  WebkitTextFillColor: 'rgba(0, 0, 0, 0.38)',
                  backgroundColor: 'rgba(0, 0, 0, 0.06)',
                },
              }
              
              return (
            <Grid container spacing={isMobile ? 1.5 : 2}>
              {!editingCargo && cargoContract && (
                <Grid item xs={12}>
                  <FormControl fullWidth required>
                    <InputLabel>Product</InputLabel>
                    <Select
                      value={cargoProductName || ''}
                      label="Product"
                      onChange={(e) => setCargoProductName(e.target.value)}
                    >
                      {cargoContract.products?.map((product) => (
                        <MenuItem key={product.name} value={product.name}>
                          {product.name} (Total: {product.total_quantity} MT, Optional: {product.optional_quantity || 0} MT)
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}
              <Grid item xs={12} md={6}>
                <TextField
                  label="Vessel Name"
                  value={cargoFormData.vessel_name}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, vessel_name: e.target.value })}
                  required
                  fullWidth
                      disabled={isCompletedCargo}
                      sx={isCompletedCargo ? disabledStyle : {}}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth disabled={isCompletedCargo} sx={isCompletedCargo ? disabledStyle : {}}>
                  <InputLabel>Load Port(s)</InputLabel>
                  <Select
                    multiple
                    value={cargoFormData.load_ports}
                    label="Load Port(s)"
                    onChange={(e) => {
                      const next = (e.target.value as string[]).map((v) => String(v))
                      setCargoFormData({ ...cargoFormData, load_ports: next })
                    }}
                    renderValue={(selected) => {
                      const ports = (selected as string[]).filter(Boolean)
                      if (ports.length === 0) return 'Select port(s)'
                      return (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {ports.map((p) => (
                            <Chip key={p} label={p} size="small" />
                          ))}
                        </Box>
                      )
                    }}
                  >
                    {Array.from(new Set([...LOAD_PORT_OPTIONS, ...(cargoFormData.load_ports || [])])).map((port) => (
                      <MenuItem key={port} value={port}>
                        <Checkbox checked={(cargoFormData.load_ports || []).includes(port)} />
                        <ListItemText primary={port} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {editingCargo && Array.isArray(editingCargo.port_operations) && editingCargo.port_operations.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
                    Load Port Operations
                  </Typography>
                  <Grid container spacing={1}>
                    {PORT_SECTIONS
                      .filter((p) => parseLoadPorts(editingCargo.load_ports).includes(p))
                      .map((port) => {
                        const op = (editingCargo.port_operations || []).find((x) => x.port_code === port)
                        if (!op) return null
                        return (
                          <Grid item xs={12} sm={6} md={3} key={port}>
                            <Paper variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                                {port}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                Status: {op.status}
                              </Typography>
                              <Typography variant="caption" display="block">ETA: {op.eta || '-'}</Typography>
                              <Typography variant="caption" display="block">Berthed: {op.berthed || '-'}</Typography>
                              <Typography variant="caption" display="block">Commenced: {op.commenced || '-'}</Typography>
                              <Typography variant="caption" display="block">ETC: {op.etc || '-'}</Typography>
                              {op.notes && (
                                <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                                  Notes: {op.notes}
                                </Typography>
                              )}
                            </Paper>
                          </Grid>
                        )
                      })}
                  </Grid>
                </Grid>
              )}

              <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel>Inspector Name</InputLabel>
                      <Select
                        value={cargoFormData.inspector_name || ''}
                  label="Inspector Name"
                        onChange={(e) => setCargoFormData({ ...cargoFormData, inspector_name: e.target.value || '' })}
                        disabled={isCompletedCargo}
                        sx={isCompletedCargo ? disabledStyle : {}}
                      >
                        <MenuItem value="">
                          <em>None</em>
                        </MenuItem>
                        <MenuItem value="SGS">SGS</MenuItem>
                        <MenuItem value="SAYBOLT">SAYBOLT</MenuItem>
                        <MenuItem value="AMSPEC">AMSPEC</MenuItem>
                        <MenuItem value="INSPECTORATE-BV">INSPECTORATE-BV</MenuItem>
                        <MenuItem value="INTERTEK-CB">INTERTEK-CB</MenuItem>
                        <MenuItem value="GEO-CHEM">GEO-CHEM</MenuItem>
                      </Select>
                    </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Cargo Quantity"
                  type="number"
                  value={cargoFormData.cargo_quantity}
                  fullWidth
                  disabled // Read-only - reads from monthly plan
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Laycan Window"
                  value={cargoFormData.laycan_window}
                  placeholder="e.g., 15-20 Nov 2024"
                  fullWidth
                  disabled
                  sx={{
                    '& .MuiInputBase-input.Mui-disabled': {
                      WebkitTextFillColor: 'rgba(0, 0, 0, 0.38)',
                      backgroundColor: 'rgba(0, 0, 0, 0.06)',
                    },
                  }}
                />
              </Grid>
              {((editingCargo && editingCargo.contract_type === 'CIF') || 
                (!editingCargo && cargoContract && cargoContract.contract_type === 'CIF')) && (
                <>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
                      CIF Specific Fields:
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="ETA Discharge Port"
                      type="text"
                      value={cargoFormData.eta_discharge_port}
                      onChange={(e) => setCargoFormData({ ...cargoFormData, eta_discharge_port: e.target.value })}
                      fullWidth
                      disabled={isCompletedCargo}
                      sx={isCompletedCargo ? disabledStyle : {}}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Discharge Port Location"
                      value={cargoFormData.discharge_port_location}
                      onChange={(e) => setCargoFormData({ ...cargoFormData, discharge_port_location: e.target.value })}
                      fullWidth
                      disabled={isCompletedCargo}
                      sx={isCompletedCargo ? disabledStyle : {}}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Discharge Completion Time"
                      type="text"
                      value={cargoFormData.discharge_completion_time}
                      onChange={(e) => setCargoFormData({ ...cargoFormData, discharge_completion_time: e.target.value })}
                      fullWidth
                      disabled={isCompletedCargo}
                      sx={isCompletedCargo ? disabledStyle : {}}
                    />
                  </Grid>
                </>
              )}
              {editingCargo && (
                <>
                  <Grid item xs={12}>
                    <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2, mt: 2 }}>
                      <Typography variant="subtitle1" gutterBottom>
                        Status Management
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2, alignItems: 'center' }}>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                          <InputLabel>Current Status</InputLabel>
                          <Select
                            value={cargoFormData.status}
                            label="Current Status"
                            onChange={(e) => setCargoFormData({ ...cargoFormData, status: e.target.value as CargoStatus })}
                          >
                            <MenuItem value="Planned">Planned</MenuItem>
                            <MenuItem value="Loading">Loading</MenuItem>
                            {/* Show Pending Nomination only when editing from Port Movement tab */}
                            {value === 0 && (
                              <MenuItem value="Pending Nomination">Pending Nomination</MenuItem>
                            )}
                            {/* Show Pending TL Approval only when editing from Port Movement tab */}
                            {value === 0 && (
                              <MenuItem value="Pending TL Approval">Pending TL Approval</MenuItem>
                            )}
                            {/* Show Nomination Released only when editing from Port Movement tab */}
                            {value === 0 && (
                              <MenuItem value="Nomination Released">Nomination Released</MenuItem>
                            )}
                            <MenuItem value="Completed Loading">Completed Loading</MenuItem>
                          </Select>
                        </FormControl>
                      </Box>
                    </Box>
                  </Grid>
                </>
              )}
              {cargoContract && cargoContract.payment_method === 'LC' && (
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>LC Status</InputLabel>
                    <Select
                      value={cargoFormData.lc_status || ''}
                      label="LC Status"
                      onChange={(e) => setCargoFormData({ ...cargoFormData, lc_status: e.target.value as LCStatus | '' })}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      <MenuItem value="Pending LC">Pending LC</MenuItem>
                      <MenuItem value="LC in Order">LC in Order</MenuItem>
                      <MenuItem value="LC Not in Order">LC Not in Order</MenuItem>
                      <MenuItem value="LC Memo Issued">LC Memo Issued</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              )}
              <Grid item xs={12}>
                <TextField
                  label="Remark"
                  value={cargoFormData.notes}
                  onChange={(e) => setCargoFormData({ ...cargoFormData, notes: e.target.value })}
                  multiline
                  rows={3}
                  fullWidth
                />
              </Grid>
            </Grid>
              )
            })()}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: isMobile ? 2 : 3, py: isMobile ? 2 : 3, gap: 1 }}>
          <Button 
            onClick={() => setCargoDialogOpen(false)}
            sx={{ 
              minHeight: isMobile ? 48 : 36,
              minWidth: isMobile ? 100 : 'auto',
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCargoSubmit}
            variant="contained"
            disabled={!cargoFormData.vessel_name || !cargoFormData.cargo_quantity}
            sx={{ 
              minHeight: isMobile ? 48 : 36,
              minWidth: isMobile ? 120 : 'auto',
            }}
          >
            {editingCargo ? 'Update Vessel' : 'Create Vessel'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

