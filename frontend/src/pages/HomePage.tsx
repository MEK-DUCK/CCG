import { useState, useEffect, useRef, useCallback, memo } from 'react'
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
  InputAdornment,
  IconButton,
} from '@mui/material'
import { FileDownload, Search, Description, Clear } from '@mui/icons-material'
import { alpha } from '@mui/material/styles'
import { format } from 'date-fns'
import client, { cargoAPI, customerAPI, contractAPI, monthlyPlanAPI, quarterlyPlanAPI, documentsAPI } from '../api/client'
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

// Memoized inline text field to prevent lag - uses local state and syncs on blur
interface InlineTextFieldProps {
  value: string
  onSave: (value: string) => void
  fullWidth?: boolean
}

const InlineTextField = memo(function InlineTextField({ value, onSave, fullWidth }: InlineTextFieldProps) {
  const [localValue, setLocalValue] = useState(value)
  const lastSavedRef = useRef(value)

  // Sync local value when prop changes from external source (e.g., after API save)
  useEffect(() => {
    if (value !== lastSavedRef.current) {
      setLocalValue(value)
      lastSavedRef.current = value
    }
  }, [value])

  const handleBlur = useCallback(() => {
    if (localValue !== lastSavedRef.current) {
      lastSavedRef.current = localValue
      onSave(localValue)
    }
  }, [localValue, onSave])

  return (
    <TextField
      size="small"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      fullWidth={fullWidth}
    />
  )
})

export default function HomePage() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  // Dynamic load ports and inspectors from API
  const [loadPortOptions, setLoadPortOptions] = useState<string[]>(['MAA', 'MAB', 'SHU'])
  const [inspectorOptions, setInspectorOptions] = useState<string[]>(['SGS', 'Intertek', 'Saybolt'])
  
  // Fallback constants for port sections (used for display grouping)
  const DEFAULT_LOAD_PORTS = ['MAA', 'MAB', 'SHU'] as const
  const PORT_SECTIONS = loadPortOptions.length > 0 ? loadPortOptions : [...DEFAULT_LOAD_PORTS]
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
              cargo ? cargo.product_name : (
                monthlyPlan ? getProductNameForMonthlyPlan(monthlyPlan) : '-'
              ),
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
    const patchCargoPortOps = (c: Cargo): Cargo => {
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
    }
    
    setPortMovement((prev) => prev.map(patchCargoPortOps))
    setActiveLoadings((prev) => prev.map(patchCargoPortOps))
    setCompletedCargos((prev) => prev.map(patchCargoPortOps))
    setInRoadCIF((prev) => prev.map(patchCargoPortOps))
    setEditingCargo((prev) => {
      if (!prev || prev.id !== cargoId) return prev
      return patchCargoPortOps(prev)
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
    
    // Find the cargo to check if it's part of a combie group
    const cargo = [...portMovement, ...activeLoadings, ...completedCargos, ...inRoadCIF].find(c => c.id === cargoId)
    
    // For combie cargos, also update port operations for other cargos in the group
    const combieCargosToUpdate = cargo?.combi_group_id
      ? [...portMovement, ...activeLoadings, ...completedCargos, ...inRoadCIF]
          .filter(c => c.combi_group_id === cargo.combi_group_id && c.id !== cargoId)
          .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i) // dedupe
      : []
    
    // Apply optimistic update to combie cargos as well
    combieCargosToUpdate.forEach(c => {
      applyLocalPortOpPatch(c.id, portCode, patch)
    })
    
    const key = `${cargoId}:${portCode}`
    const existing = portOpTimersRef.current[key]
    if (existing) window.clearTimeout(existing)
    portOpTimersRef.current[key] = window.setTimeout(() => {
      // Save for the main cargo
      upsertPortOp(cargoId, portCode, patch).catch((e) => console.error('Error saving port operation:', e))
      
      // Also save for combie cargos
      combieCargosToUpdate.forEach(c => {
        upsertPortOp(c.id, portCode, patch).catch((e) => console.error('Error saving port operation for combie cargo:', e))
      })
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
  const [inRoadCIFSearch, setInRoadCIFSearch] = useState<string>('')
  const [inRoadCIFFilterCustomers, setInRoadCIFFilterCustomers] = useState<number[]>([])
  const [cargoDialogOpen, setCargoDialogOpen] = useState(false)
  const [editingCargo, setEditingCargo] = useState<Cargo | null>(null)
  const [cargoMonthlyPlanId, setCargoMonthlyPlanId] = useState<number | null>(null)
  const [cargoMonthlyPlan, setCargoMonthlyPlan] = useState<MonthlyPlan | null>(null) // Fetched monthly plan for editing
  const [cargoContractId, setCargoContractId] = useState<number | null>(null)
  const [cargoContract, setCargoContract] = useState<Contract | null>(null)
  const [cargoProductName, setCargoProductName] = useState<string | null>(null)
  const [newCargoMonthlyPlanId, setNewCargoMonthlyPlanId] = useState<number | null>(null) // For moving cargo
  const [combiMonthlyPlansForCargo, setCombiMonthlyPlansForCargo] = useState<(MonthlyPlan & { quarterlyPlanId?: number })[]>([]) // For combie cargo creation
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
    five_nd_date: '',  // 5-ND: Due date for narrowing down delivery window (CIF In-Road)
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
    if (value === 1 && !isInitialLoad) { // Completed Cargos tab is index 1
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
      // Load customers, contracts, and config data in parallel - they're independent
      const [customersRes, contractsRes, completedRes, inRoadRes, completedInRoadRes, loadPortsRes, inspectorsRes] = await Promise.all([
        customerAPI.getAll().catch(() => ({ data: [] })),
        contractAPI.getAll().catch(() => ({ data: [] })),
        cargoAPI.getCompletedCargos(completedMonth || undefined, completedYear || undefined).catch(() => ({ data: [] })),
        cargoAPI.getInRoadCIF().catch(() => ({ data: [] })),
        cargoAPI.getCompletedInRoadCIF().catch(() => ({ data: [] })),
        client.get('/api/load-ports/codes').catch(() => ({ data: ['MAA', 'MAB', 'SHU'] })),
        client.get('/api/inspectors/names').catch(() => ({ data: ['SGS', 'Intertek', 'Saybolt'] })),
      ])
      
      setCustomers(customersRes.data || [])
      setContracts(contractsRes.data || [])
      setCompletedCargos(completedRes.data || [])
      setInRoadCIF(inRoadRes.data || [])
      setCompletedInRoadCIF(completedInRoadRes.data || [])
      
      // Update dynamic options
      if (loadPortsRes.data && loadPortsRes.data.length > 0) {
        setLoadPortOptions(loadPortsRes.data)
      }
      if (inspectorsRes.data && inspectorsRes.data.length > 0) {
        setInspectorOptions(inspectorsRes.data)
      }
    } catch (error: any) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMonthlyPlansForPortMovement = async () => {
    try {
      // OPTIMIZED: Single API call instead of ~100+ calls
      // The bulk endpoint returns monthly plans with embedded quarterly plan, contract, and customer data
      const res = await monthlyPlanAPI.getBulk(selectedMonths, selectedYear, false)
      const plans = res.data || []
      
      // Build quarterlyPlansMap from the embedded data
      const qpMap = new Map<number, any>()
      const contractsMap = new Map<number, any>()
      const customersMap = new Map<number, any>()
      
      plans.forEach((mp: any) => {
        // Extract and cache quarterly plan with its contract
        if (mp.quarterly_plan && !qpMap.has(mp.quarterly_plan.id)) {
          qpMap.set(mp.quarterly_plan.id, {
            ...mp.quarterly_plan,
            contract: mp.quarterly_plan.contract
          })
          
          // Extract and cache contract with its customer
          if (mp.quarterly_plan.contract && !contractsMap.has(mp.quarterly_plan.contract.id)) {
            contractsMap.set(mp.quarterly_plan.contract.id, mp.quarterly_plan.contract)
            
            // Extract and cache customer
            if (mp.quarterly_plan.contract.customer) {
              const customer = mp.quarterly_plan.contract.customer
              if (!customersMap.has(customer.id)) {
                customersMap.set(customer.id, customer)
              }
            }
          }
        }
      })
      
      setQuarterlyPlansMap(qpMap)

      // Update contracts if we got new ones (merge with existing to avoid losing any)
      if (contractsMap.size > 0) {
        setContracts(prev => {
          const merged = new Map(prev.map((c: Contract) => [c.id, c]))
          contractsMap.forEach((c, id) => merged.set(id, c))
          return Array.from(merged.values())
        })
      }
      
      // Update customers if we got new ones (merge with existing to avoid losing any)
      if (customersMap.size > 0) {
        setCustomers(prev => {
          const merged = new Map(prev.map((c: Customer) => [c.id, c]))
          customersMap.forEach((c, id) => merged.set(id, c))
          return Array.from(merged.values())
        })
      }
      
      // Transform plans to include quarterlyPlanId for compatibility with existing code
      const transformedPlans = plans.map((mp: any) => ({
        ...mp,
        quarterlyPlanId: mp.quarterly_plan_id
      }))
      
      setMonthlyPlans(transformedPlans)
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
    setCargoMonthlyPlan(null) // Reset before fetching
    setNewCargoMonthlyPlanId(cargo.monthly_plan_id) // Initialize for potential move
    setCargoContractId(cargo.contract_id)
    setCargoProductName(cargo.product_name)
    
    // Load monthly plan to get laycan window and quantity
    let laycanWindow = ''
    let cargoQuantity = cargo.cargo_quantity.toString()
    try {
      const monthlyPlanRes = await monthlyPlanAPI.getById(cargo.monthly_plan_id)
      const monthlyPlan = monthlyPlanRes.data
      setCargoMonthlyPlan(monthlyPlan) // Store the fetched monthly plan
      
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
      five_nd_date: cargo.five_nd_date || '',
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

  const handleCreateCargoForPlan = async (monthlyPlan: MonthlyPlan & { quarterlyPlanId?: number }, combiPlans?: (MonthlyPlan & { quarterlyPlanId?: number })[]) => {
    // For combie cargos, check if ANY of the monthly plans already has a cargo
    const plansToCheck = combiPlans || [monthlyPlan]
    for (const plan of plansToCheck) {
    const existingCargo = [...portMovement, ...completedCargos, ...inRoadCIF].find(
        cargo => cargo.monthly_plan_id === plan.id
    )
    
    if (existingCargo) {
      alert(`This monthly plan already has a cargo assigned (Cargo ID: ${existingCargo.cargo_id}, Vessel: ${existingCargo.vessel_name}). Please edit the existing cargo instead of creating a new one.`)
      // Optionally, open the edit dialog for the existing cargo
      handleEditCargo(existingCargo)
      return
      }
    }
    
    // Find the contract for this monthly plan
    // For SPOT contracts: use direct contract_id
    // For regular contracts: use quarterly_plan relationship
    let contract: any = null
    
    if (monthlyPlan.contract) {
      // SPOT contract - has direct contract object from bulk endpoint
      contract = monthlyPlan.contract
    } else if (monthlyPlan.contract_id) {
      // SPOT contract - has direct contract_id, find in contracts list
      contract = contracts.find(c => c.id === monthlyPlan.contract_id)
    } else {
      // Regular contract - find through quarterly plan
    const qpId = monthlyPlan.quarterly_plan_id || (monthlyPlan as any).quarterlyPlanId
    const quarterlyPlan = quarterlyPlansMap.get(qpId)
      if (quarterlyPlan && quarterlyPlan.contract) {
        contract = quarterlyPlan.contract
      }
    }
    
    if (!contract) {
      alert('Could not find contract for this monthly plan')
      return
    }
    
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
    setCargoMonthlyPlan(monthlyPlan) // Store the monthly plan for dialog display
    setCargoContractId(contract.id)
    setCargoContract(contract)
    setCargoProductName(defaultProductName)
    
    // Store combie monthly plans for creating multiple cargos
    setCombiMonthlyPlansForCargo(combiPlans || [])
    
    // Get total quantity from all monthly plans in combie group
    const totalQuantity = combiPlans 
      ? combiPlans.reduce((sum, p) => sum + p.month_quantity, 0)
      : monthlyPlan.month_quantity
    const cargoQuantity = totalQuantity.toString()
    
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
    // SPOT contracts have direct contract object or contract_id
    if (monthlyPlan.contract) {
      return monthlyPlan.contract
    }
    if (monthlyPlan.contract_id) {
      return contracts.find(c => c.id === monthlyPlan.contract_id)
    }
    // Regular contracts - find through quarterly plan
    const qpId = monthlyPlan.quarterly_plan_id || (monthlyPlan as any).quarterlyPlanId
    const quarterlyPlan = quarterlyPlansMap.get(qpId)
    return quarterlyPlan?.contract
  }

  // Get product name for a monthly plan (handles both SPOT and regular contracts)
  const getProductNameForMonthlyPlan = (monthlyPlan: MonthlyPlan & { quarterlyPlanId?: number }): string => {
    // SPOT contracts have product_name directly on the plan
    if (monthlyPlan.product_name) {
      return monthlyPlan.product_name
    }
    // Regular contracts - get from quarterly plan
    const qpId = monthlyPlan.quarterly_plan_id || (monthlyPlan as any).quarterlyPlanId
    const quarterlyPlan = quarterlyPlansMap.get(qpId)
    return quarterlyPlan?.product_name || '-'
  }

  const handleCargoSubmit = async () => {
    try {
      if (editingCargo) {
        const hasPorts = Array.isArray(cargoFormData.load_ports) && cargoFormData.load_ports.filter(Boolean).length > 0
        if ((cargoFormData.status === 'Loading' || cargoFormData.status === 'Completed Loading') && !hasPorts) {
          alert('Please select at least one Load Port before setting status to Loading.')
          return
        }

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
          // 5-ND date for In-Road CIF tracking
          updatePayload.five_nd_date = cargoFormData.five_nd_date || undefined
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
        
        // Shared fields to update for all combie cargos (not quantity - that's per product)
        const sharedFields = {
          vessel_name: cargoFormData.vessel_name,
          load_ports: formatLoadPorts(cargoFormData.load_ports),
          inspector_name: cargoFormData.inspector_name || undefined,
          laycan_window: cargoFormData.laycan_window || undefined,
          notes: cargoFormData.notes || undefined,
          status: cargoFormData.status as CargoStatus,
          lc_status: cargoFormData.lc_status || undefined,
        }
        
        // Update in Port Movement tab (including all combie cargos)
        setPortMovement(prevCargos =>
          prevCargos.map(cargo => {
            if (cargo.id === editingCargo.id) return updatedCargo
            if (editingCargo.combi_group_id && cargo.combi_group_id === editingCargo.combi_group_id) {
              return { ...cargo, ...sharedFields }
            }
            return cargo
          })
        )
        
        // Update in Completed Cargos tab (including all combie cargos)
        setCompletedCargos(prevCargos =>
          prevCargos.map(cargo => {
            if (cargo.id === editingCargo.id) return updatedCargo
            if (editingCargo.combi_group_id && cargo.combi_group_id === editingCargo.combi_group_id) {
              return { ...cargo, ...sharedFields }
            }
            return cargo
          })
        )
        
        // Update in In-Road CIF tab (including all combie cargos)
        setInRoadCIF(prevCargos =>
          prevCargos.map(cargo => {
            if (cargo.id === editingCargo.id) return updatedCargo
            if (editingCargo.combi_group_id && cargo.combi_group_id === editingCargo.combi_group_id) {
              return { ...cargo, ...sharedFields }
            }
            return cargo
          })
        )
        
        // OPTIMISTIC: If status changed to Loading, add to activeLoadings so it shows in port sections immediately
        if (cargoFormData.status === 'Loading' && editingCargo.status !== 'Loading') {
          setActiveLoadings(prev => {
            // Check if already in activeLoadings
            const exists = prev.some(c => c.id === editingCargo.id)
            if (exists) {
              return prev.map(c => {
                if (c.id === editingCargo.id) return updatedCargo
                if (editingCargo.combi_group_id && c.combi_group_id === editingCargo.combi_group_id) {
                  return { ...c, ...sharedFields }
                }
                return c
              })
            }
            
            // For combie cargos, add ALL cargos in the group to activeLoadings
            if (editingCargo.combi_group_id) {
              const combieCargosInPortMovement = portMovement.filter(
                c => c.combi_group_id === editingCargo.combi_group_id && c.id !== editingCargo.id
              )
              const updatedCombieCargos = combieCargosInPortMovement.map(c => ({
                ...c,
                ...sharedFields
              }))
              return [...prev, updatedCargo, ...updatedCombieCargos]
            }
            
            return [...prev, updatedCargo]
          })
        }
        
        // OPTIMISTIC: If status changed to COMPLETED_LOADING, remove from activeLoadings
        // For combie cargos, remove ALL cargos in the group from activeLoadings
        if (cargoFormData.status === 'COMPLETED_LOADING') {
          setActiveLoadings(prev => {
            if (editingCargo.combi_group_id) {
              // Remove all cargos in the combie group
              return prev.filter(c => c.combi_group_id !== editingCargo.combi_group_id)
            } else {
              // Remove just this cargo
              return prev.filter(c => c.id !== editingCargo.id)
            }
          })
        }
        
        // Close dialog immediately
        setCargoDialogOpen(false)
        
        // For combie cargos, use the atomic sync endpoint to update ALL cargos in the group
        // This ensures consistency and validates status transitions for all cargos at once
        let updatePromise: Promise<any>
        
        if (editingCargo.combi_group_id) {
          // Use combi sync endpoint - it will update all cargos in the group atomically
          const sharedUpdatePayload = {
            vessel_name: cargoFormData.vessel_name,
            load_ports: formatLoadPorts(cargoFormData.load_ports),
            inspector_name: cargoFormData.inspector_name || undefined,
            laycan_window: cargoFormData.laycan_window || undefined,
            notes: cargoFormData.notes || undefined,
            status: cargoFormData.status,
            lc_status: cargoFormData.lc_status || undefined,
          }
          updatePromise = cargoAPI.syncCombiGroup(editingCargo.combi_group_id, sharedUpdatePayload)
        } else {
          // Single cargo update
          updatePromise = cargoAPI.update(editingCargo.id, updatePayload)
        }
        
        updatePromise
          .then(() => {
            // Refresh in background (best-effort)
            loadData().catch((e) => console.error('Error refreshing data after cargo update:', e))
            loadPortMovement().catch((e) => console.error('Error refreshing port movement after cargo update:', e))
            loadActiveLoadings().catch((e) => console.error('Error refreshing active loadings after cargo update:', e))
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
            
            // Revert Active Loadings (if we optimistically added it)
            if (cargoFormData.status === 'Loading' && editingCargo.status !== 'Loading') {
              setActiveLoadings(prev => prev.filter(c => c.id !== editingCargo.id))
            }
            
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
        // Create new cargo for monthly plan (or multiple cargos for combie)
        if (!cargoMonthlyPlanId || !cargoContractId || !cargoContract || !cargoProductName) {
          alert('Missing monthly plan, contract, or product information. Please try clicking on the row again.')
          return
        }

        const contract = cargoContract

        // Validate required fields
        if (!cargoFormData.vessel_name) {
          alert('Please fill in vessel name')
          return
        }

        // Helper function to convert datetime-local to ISO string
        const toISOString = (dateTimeLocal: string) => {
          if (!dateTimeLocal) return undefined
          const d = new Date(dateTimeLocal)
          if (Number.isNaN(d.getTime())) return undefined
          return d.toISOString()
        }

        // Close dialog immediately
        setCargoDialogOpen(false)
        
        // Check if this is a combie cargo (multiple monthly plans)
        const isCombieCargo = combiMonthlyPlansForCargo.length > 0
        const plansToCreate = isCombieCargo ? combiMonthlyPlansForCargo : [{ id: cargoMonthlyPlanId, month_quantity: parseFloat(cargoFormData.cargo_quantity), product_name: cargoProductName } as any]
        
        // Create optimistic cargos for all plans
        const optimisticCargos: Cargo[] = plansToCreate.map((plan, index) => {
          // Get product name - SPOT contracts have it directly, regular contracts get from quarterly plan
          const productName = getProductNameForMonthlyPlan(plan) || cargoProductName
          
          return {
            id: Date.now() + index,
            cargo_id: `TEMP-${Date.now()}-${index}`,
            vessel_name: cargoFormData.vessel_name,
            customer_id: contract.customer_id,
            product_name: productName,
            contract_id: cargoContractId!,
            contract_type: contract.contract_type,
            load_ports: formatLoadPorts(cargoFormData.load_ports),
            inspector_name: cargoFormData.inspector_name || undefined,
            cargo_quantity: plan.month_quantity,
            laycan_window: cargoFormData.laycan_window || undefined,
            status: 'Planned' as CargoStatus,
            notes: cargoFormData.notes || undefined,
            monthly_plan_id: plan.id,
            lc_status: cargoFormData.lc_status || undefined,
            created_at: new Date().toISOString(),
            combi_group_id: isCombieCargo ? plansToCreate[0].combi_group_id : undefined,
          }
        })

        // OPTIMISTIC UPDATE: Add to Port Movement immediately
        setPortMovement(prevCargos => [...prevCargos, ...optimisticCargos])
        
        try {
          // Create cargos for all monthly plans in the combie group
          const createdCargos: Cargo[] = []
          
          for (const plan of plansToCreate) {
            // Get product name - SPOT contracts have it directly, regular contracts get from quarterly plan
            const productName = getProductNameForMonthlyPlan(plan) || cargoProductName
            
          const payload: any = {
            customer_id: contract.customer_id,
            product_name: productName,
            contract_id: cargoContractId,
              monthly_plan_id: plan.id,
            vessel_name: cargoFormData.vessel_name,
            load_ports: formatLoadPorts(cargoFormData.load_ports),
              cargo_quantity: plan.month_quantity,
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
            if (cargoFormData.five_nd_date) payload.five_nd_date = cargoFormData.five_nd_date
          }

            const response = await cargoAPI.create(payload)
            if (response.data) {
              createdCargos.push(response.data)
            }
          }
          
          // Replace optimistic cargos with real cargos from API
          setPortMovement(prevCargos => {
            // Remove optimistic cargos
            const withoutOptimistic = prevCargos.filter(c => !optimisticCargos.some(oc => oc.id === c.id))
            // Add real cargos
            return [...withoutOptimistic, ...createdCargos]
          })
          
          alert(isCombieCargo ? `Combie cargo created successfully! (${createdCargos.length} products)` : 'Cargo created successfully!')
          } catch (error: any) {
          // Remove optimistic cargos on error
            setPortMovement(prevCargos =>
            prevCargos.filter(cargo => !optimisticCargos.some(oc => oc.id === cargo.id))
          )
          const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error'
          alert(`Error creating cargo: ${errorMessage}`)
        }

        // Refresh data
        loadData()
        loadPortMovement()
        
        // Clear combie monthly plans state
        setCombiMonthlyPlansForCargo([])
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
    if (newValue === 1) {
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
        return {
          sx: {
            backgroundColor: '#fff9c4', // Light yellow
            color: '#7a5d00',
            '&:hover': { backgroundColor: '#fff59d' }
          }
        }
      case 'Financial Hold':
        return {
          sx: {
            backgroundColor: '#e1bee7', // Light purple
            color: '#6a1b9a',
            '&:hover': { backgroundColor: '#ce93d8' }
          }
        }
      default:
        return {}
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

    // Group combie cargos - only show one row per combi_group_id
    const seenCombiGroups = new Set<string>()
    const groupedCargos = cargos.filter((cargo) => {
      if (cargo.combi_group_id) {
        if (seenCombiGroups.has(cargo.combi_group_id)) {
          return false // Skip duplicate combie rows
        }
        seenCombiGroups.add(cargo.combi_group_id)
      }
      return true
    })

    if (groupedCargos.length === 0) {
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
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Quantity</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Contract</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Load Port(s)</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 150 : 'auto', fontWeight: 'bold' }}>Remark</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groupedCargos.map((cargo) => {
              // Get all cargos in combie group for display - search in all cargo arrays
              const allCargosForLookup = [...portMovement, ...completedCargos, ...inRoadCIF, ...activeLoadings, ...cargos]
              const combieCargos = cargo.combi_group_id 
                ? allCargosForLookup
                    .filter(c => c.combi_group_id === cargo.combi_group_id)
                    .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i) // dedupe
                : [cargo]
              
              return (
              <TableRow 
                  key={cargo.combi_group_id ? `combi-${cargo.combi_group_id}` : cargo.id}
                onClick={() => handleEditCargo(cargo)}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { bgcolor: 'action.hover' },
                  '& td': { 
                    minHeight: isMobile ? 56 : 48,
                    py: isMobile ? 1.5 : 1,
                    },
                    bgcolor: 'inherit'
                }}
              >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {cargo.vessel_name}
                      {cargo.combi_group_id && (
                        <Chip 
                          label="Combie" 
                          size="small" 
                          sx={{ 
                            bgcolor: '#F59E0B', 
                            color: 'white', 
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: 20,
                          }} 
                        />
                      )}
                    </Box>
                  </TableCell>
                <TableCell>{getCustomerName(cargo.customer_id)}</TableCell>
                  <TableCell>
                    {cargo.combi_group_id ? (
                      <Box>
                        {combieCargos.map(c => (
                          <Typography key={c.id} variant="body2" sx={{ fontSize: '0.875rem' }}>
                            {c.product_name}: {c.cargo_quantity} KT
                          </Typography>
                        ))}
                      </Box>
                    ) : (
                      getProductName(cargo.product_name)
                    )}
                  </TableCell>
                  <TableCell>
                    {cargo.combi_group_id ? (
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {combieCargos.reduce((sum, c) => sum + c.cargo_quantity, 0)} KT
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          (Total)
                        </Typography>
                      </Box>
                    ) : (
                      cargo.cargo_quantity
                    )}
                  </TableCell>
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
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  // Render In-Road CIF table with 5-ND column
  const renderInRoadCIFTable = (cargos: Cargo[]) => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )
    }

    // Filter cargos by search term
    const filteredCargos = cargos.filter((cargo) => {
      if (inRoadCIFSearch.trim() === '') {
        return true
      }
      
      const searchLower = inRoadCIFSearch.toLowerCase().trim()
      const searchTerms = searchLower.split(' ').filter(term => term.length > 0)
      
      // Find contract for this cargo
      const contract = contracts.find((c) => Number(c.id) === Number(cargo.contract_id))
      const contractNumber = contract?.contract_number || ''
      const customerName = getCustomerName(cargo.customer_id)
      const productName = getProductName(cargo.product_name)
      const dischargePort = cargo.discharge_port_location || ''
      
      // Check if any search term matches
      const matchesSearch = searchTerms.some(term => {
        const vesselMatch = cargo.vessel_name.toLowerCase().includes(term)
        const customerMatch = customerName.toLowerCase().includes(term)
        const contractMatch = contractNumber.toLowerCase().includes(term)
        const productMatch = productName.toLowerCase().includes(term)
        const dischargePortMatch = dischargePort.toLowerCase().includes(term)
        return vesselMatch || customerMatch || contractMatch || productMatch || dischargePortMatch
      })
      
      return matchesSearch
    })

    // Group combie cargos - only show one row per combi_group_id
    const seenCombiGroups = new Set<string>()
    const groupedCargos = filteredCargos.filter((cargo) => {
      if (cargo.combi_group_id) {
        if (seenCombiGroups.has(cargo.combi_group_id)) {
          return false // Skip duplicate combie rows
        }
        seenCombiGroups.add(cargo.combi_group_id)
      }
      return true
    })

    if (groupedCargos.length === 0) {
      return (
        <Typography variant="body1" color="text.secondary" sx={{ p: 2 }}>
          {cargos.length === 0 
            ? 'No In-Road CIF cargos found'
            : 'No In-Road CIF cargos match the search criteria'}
        </Typography>
      )
    }

    // Handler for inline 5-ND date update
    const handleFiveNDDateChange = async (cargo: Cargo, newDate: string) => {
      try {
        await cargoAPI.update(cargo.id, { five_nd_date: newDate || undefined })
        // Update local state
        setInRoadCIF(prev => prev.map(c => c.id === cargo.id ? { ...c, five_nd_date: newDate } : c))
      } catch (error) {
        console.error('Error updating 5-ND date:', error)
      }
    }

    return (
      <TableContainer 
        component={Paper}
        sx={{
          maxWidth: '100%',
          overflowX: 'auto',
          '& .MuiTable-root': {
            minWidth: isMobile ? 900 : 'auto',
          },
        }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Vessel Name</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Customer</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Product</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Quantity</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Contract</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>5-ND</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Discharge Port</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Payment Status</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 150 : 'auto', fontWeight: 'bold' }}>Remark</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groupedCargos.map((cargo) => {
              // Get all cargos in combie group for display
              const allCargosForLookup = [...portMovement, ...completedCargos, ...inRoadCIF, ...activeLoadings, ...cargos]
              const combieCargos = cargo.combi_group_id 
                ? allCargosForLookup
                    .filter(c => c.combi_group_id === cargo.combi_group_id)
                    .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i) // dedupe
                : [cargo]
              
              return (
              <TableRow 
                  key={cargo.combi_group_id ? `combi-${cargo.combi_group_id}` : cargo.id}
                onClick={() => handleEditCargo(cargo)}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { bgcolor: 'action.hover' },
                  '& td': { 
                    minHeight: isMobile ? 56 : 48,
                    py: isMobile ? 1.5 : 1,
                    },
                    bgcolor: 'inherit'
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {cargo.vessel_name}
                      {cargo.combi_group_id && (
                        <Chip 
                          label="Combie" 
                          size="small" 
                          sx={{ 
                            bgcolor: '#F59E0B', 
                            color: 'white', 
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: 20,
                          }} 
                        />
                      )}
                    </Box>
                  </TableCell>
                <TableCell>{getCustomerName(cargo.customer_id)}</TableCell>
                  <TableCell>
                    {cargo.combi_group_id ? (
                      <Box>
                        {combieCargos.map(c => (
                          <Typography key={c.id} variant="body2" sx={{ fontSize: '0.875rem' }}>
                            {c.product_name}: {c.cargo_quantity} KT
                          </Typography>
                        ))}
                      </Box>
                    ) : (
                      getProductName(cargo.product_name)
                    )}
                  </TableCell>
                  <TableCell>
                    {cargo.combi_group_id ? (
                      <Box>
                        {(() => {
                          const totalQty = combieCargos.reduce((sum, c) => sum + c.cargo_quantity, 0)
                          const totalTopup = combieCargos.reduce((sum, c) => sum + ((c as any).authority_topup_quantity || 0), 0)
                          return (
                            <>
                              <Typography variant="body2" fontWeight={600}>
                                {totalQty} KT
                              </Typography>
                              <Typography variant="caption" sx={{ color: totalTopup > 0 ? '#10B981' : 'text.secondary' }}>
                                (Total{totalTopup > 0 ? `, incl. ${totalTopup} top-up` : ''})
                              </Typography>
                            </>
                          )
                        })()}
                      </Box>
                    ) : (
                      <>
                        {cargo.cargo_quantity}
                        {((cargo as any).authority_topup_quantity || 0) > 0 && (
                          <Typography variant="caption" sx={{ display: 'block', color: '#10B981' }}>
                            (incl. {(cargo as any).authority_topup_quantity} top-up)
                          </Typography>
                        )}
                      </>
                    )}
                  </TableCell>
                <TableCell>{getContractNumber(cargo.contract_id)}</TableCell>
                  <TableCell 
                    onClick={(e) => e.stopPropagation()} // Prevent row click when editing
                  >
                    <TextField
                      size="small"
                      type="date"
                      value={cargo.five_nd_date || ''}
                      onChange={(e) => handleFiveNDDateChange(cargo, e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ 
                        width: 140,
                        '& .MuiInputBase-input': {
                          fontSize: '0.875rem',
                          py: 0.5,
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell>{cargo.discharge_port_location || '-'}</TableCell>
                <TableCell>
                  {(() => {
                    const contract = contracts.find(c => c.id === cargo.contract_id)
                    if (contract?.payment_method === 'LC') {
                      return cargo.lc_status ? (
                        <Chip 
                          label={cargo.lc_status} 
                          size="small"
                          {...getLCStatusChipProps(cargo.lc_status)}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )
                    } else {
                      return <Typography variant="body2" color="text.secondary">T/T</Typography>
                    }
                  })()}
                </TableCell>
                <TableCell>{cargo.notes || '-'}</TableCell>
              </TableRow>
              )
            })}
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

    // Group combie cargos - only show one row per combi_group_id
    const seenCombiGroups = new Set<string>()
    const groupedCompletedCargos = filteredCompletedCargos.filter((cargo) => {
      if (cargo.combi_group_id) {
        if (seenCombiGroups.has(cargo.combi_group_id)) {
          return false // Skip duplicate combie rows
        }
        seenCombiGroups.add(cargo.combi_group_id)
      }
      return true
    })

    if (groupedCompletedCargos.length === 0) {
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
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>Contract</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Product</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>FOB/CIF</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Payment Method</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 'auto', fontWeight: 'bold' }}>LC Status</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Quantity</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 'auto', fontWeight: 'bold' }}>Laycan</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 150 : 'auto', fontWeight: 'bold' }}>Sailing Fax Entry</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 150 : 'auto', fontWeight: 'bold' }}>Documents Mailing</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 150 : 'auto', fontWeight: 'bold' }}>Inspector Invoice</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groupedCompletedCargos.map((cargo) => {
              // Find contract by matching cargo.contract_id with contract.id
              // This gets the contract_number field that was entered in Contract Management
              const contract = contracts.find((c) => {
                return Number(c.id) === Number(cargo.contract_id)
              })
              
              // Display contract_number (the field typed in Contract Management page)
              const contractNumber = contract?.contract_number || (cargo.contract_id ? `Contract ID: ${cargo.contract_id}` : '-')
              
              // Get all cargos in combie group for display - search in all cargo arrays
              const allCargosForLookup = [...portMovement, ...completedCargos, ...inRoadCIF, ...activeLoadings]
              const combieCargos = cargo.combi_group_id 
                ? allCargosForLookup
                    .filter(c => c.combi_group_id === cargo.combi_group_id)
                    .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i) // dedupe
                : [cargo]
              
              return (
                <TableRow 
                  key={cargo.combi_group_id ? `combi-${cargo.combi_group_id}` : cargo.id}
                  onClick={() => handleEditCargo(cargo)}
                  sx={{ 
                    cursor: 'pointer', 
                    '&:hover': { bgcolor: 'action.hover' },
                    '& td': { 
                      minHeight: isMobile ? 56 : 48,
                      py: isMobile ? 1.5 : 1,
                    },
                    bgcolor: 'inherit'
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {cargo.vessel_name}
                      {cargo.combi_group_id && (
                        <Chip 
                          label="Combie" 
                          size="small" 
                          sx={{ 
                            bgcolor: '#F59E0B', 
                            color: 'white', 
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: 20,
                          }} 
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{getCustomerName(cargo.customer_id)}</TableCell>
                  <TableCell>{contractNumber || '-'}</TableCell>
                  <TableCell>
                    {cargo.combi_group_id ? (
                      <Box>
                        {combieCargos.map(c => (
                          <Typography key={c.id} variant="body2" sx={{ fontSize: '0.875rem' }}>
                            {c.product_name}: {c.cargo_quantity} KT
                          </Typography>
                        ))}
                      </Box>
                    ) : (
                      getProductName(cargo.product_name)
                    )}
                  </TableCell>
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
                        color={contract.payment_method === 'T/T' ? 'success' : 'warning'}
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
                  <TableCell>
                    {cargo.combi_group_id ? (
                      <Box>
                        {(() => {
                          const totalQty = combieCargos.reduce((sum, c) => sum + c.cargo_quantity, 0)
                          const totalTopup = combieCargos.reduce((sum, c) => sum + ((c as any).authority_topup_quantity || 0), 0)
                          return (
                            <>
                              <Typography variant="body2" fontWeight={600}>
                                {totalQty} KT
                              </Typography>
                              <Typography variant="caption" sx={{ color: totalTopup > 0 ? '#10B981' : 'text.secondary' }}>
                                (Total{totalTopup > 0 ? `, incl. ${totalTopup} top-up` : ''})
                              </Typography>
                            </>
                          )
                        })()}
                      </Box>
                    ) : (
                      <>
                        {cargo.cargo_quantity}
                        {((cargo as any).authority_topup_quantity || 0) > 0 && (
                          <Typography variant="caption" sx={{ display: 'block', color: '#10B981' }}>
                            (incl. {(cargo as any).authority_topup_quantity} top-up)
                          </Typography>
                        )}
                      </>
                    )}
                  </TableCell>
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
    // Group combi cargos by combi_group_id, deduplicate others
    const combiGroups = new Map<string, Cargo[]>()
    const nonCombiCargos: Cargo[] = []
    const seenNonCombiCargos = new Map<string, Cargo>()
    
    portMovement.forEach(cargo => {
      if (cargo.combi_group_id) {
        // Group combi cargos together
        const existing = combiGroups.get(cargo.combi_group_id) || []
        existing.push(cargo)
        combiGroups.set(cargo.combi_group_id, existing)
      } else {
        // Deduplicate non-combi cargos
      const key = `${cargo.vessel_name}_${cargo.contract_id}_${cargo.monthly_plan_id}_${cargo.product_name}`
        const existing = seenNonCombiCargos.get(key)
      if (!existing || (cargo.id && existing.id && cargo.id > existing.id)) {
          seenNonCombiCargos.set(key, cargo)
        }
      }
    })
    nonCombiCargos.push(...Array.from(seenNonCombiCargos.values()))
    
    // Build cargo info for non-combi cargos
    const nonCombiCargosWithInfo = nonCombiCargos.map(cargo => {
      const monthlyPlan = monthlyPlans.find(mp => mp.id === cargo.monthly_plan_id)
      const contract = monthlyPlan ? getContractForMonthlyPlan(monthlyPlan) : null
      const customer = contract ? customers.find(c => c.id === contract.customer_id) : null
      const laycan = getCargoLaycan(cargo)
      
      return {
        cargo,
        combiCargos: null as Cargo[] | null,  // Not a combi group
        combiMonthlyPlans: null as MonthlyPlan[] | null,
        monthlyPlan,
        contract,
        customer,
        laycan,
        laycanSortValue: getLaycanSortValue(laycan),
        isMonthlyPlan: false,
        isCombi: false,
      }
    })
    
    // Build cargo info for combi groups (unified rows)
    const combiCargosWithInfo = Array.from(combiGroups.entries()).map(([_combiGroupId, cargos]) => {
      // Use the first cargo as the primary reference
      const primaryCargo = cargos[0]
      const monthlyPlan = monthlyPlans.find(mp => mp.id === primaryCargo.monthly_plan_id)
      const contract = monthlyPlan ? getContractForMonthlyPlan(monthlyPlan) : null
      const customer = contract ? customers.find(c => c.id === contract.customer_id) : null
      const laycan = getCargoLaycan(primaryCargo)
      
      // Create a unified cargo object for display
      const totalQuantity = cargos.reduce((sum, c) => sum + c.cargo_quantity, 0)
      const unifiedCargo: Cargo = {
        ...primaryCargo,
        cargo_quantity: totalQuantity,
        product_name: cargos.map(c => c.product_name).join(' + '),
      }
      
      return {
        cargo: unifiedCargo,
        combiCargos: cargos,  // Keep all cargos for editing
        combiMonthlyPlans: null as MonthlyPlan[] | null,
        monthlyPlan,
        contract,
        customer,
        laycan,
        laycanSortValue: getLaycanSortValue(laycan),
        isMonthlyPlan: false,
        isCombi: true,
      }
    })
    
    const cargosWithInfo = [...nonCombiCargosWithInfo, ...combiCargosWithInfo]
    
    // Also add monthly plans that don't have cargos yet
    // Check all cargo arrays (portMovement, completedCargos, inRoadCIF) to see if monthly plan has any cargo
    const allCargos = [...portMovement, ...completedCargos, ...inRoadCIF]
    const monthlyPlansWithoutCargos = monthlyPlans.filter(mp => {
      // Only show monthly plan if it has NO cargos at all (not in port movement, not completed, not in-road)
      return !allCargos.some(cargo => cargo.monthly_plan_id === mp.id)
    })
    
    // Group monthly plans by combi_group_id (similar to how we group cargos)
    const combiMonthlyPlanGroups = new Map<string, MonthlyPlan[]>()
    const nonCombiMonthlyPlans: MonthlyPlan[] = []
    
    monthlyPlansWithoutCargos.forEach(mp => {
      if (mp.combi_group_id) {
        const existing = combiMonthlyPlanGroups.get(mp.combi_group_id) || []
        existing.push(mp)
        combiMonthlyPlanGroups.set(mp.combi_group_id, existing)
      } else {
        nonCombiMonthlyPlans.push(mp)
      }
    })
    
    // Build info for non-combi monthly plans
    const nonCombiMonthlyPlansWithInfo = nonCombiMonthlyPlans.map(monthlyPlan => {
      const contract = getContractForMonthlyPlan(monthlyPlan)
      const customer = contract ? customers.find(c => c.id === contract.customer_id) : null
      const laycan = getLaycanDisplay(monthlyPlan, contract)
      
      return {
        cargo: null as Cargo | null,
        combiCargos: null as Cargo[] | null,
        monthlyPlan,
        combiMonthlyPlans: null as MonthlyPlan[] | null,
        contract,
        customer,
        laycan,
        laycanSortValue: getLaycanSortValue(laycan),
        isMonthlyPlan: true,
        isCombi: false,
      }
    })
    
    // Build info for combi monthly plan groups (unified rows)
    const combiMonthlyPlansWithInfo = Array.from(combiMonthlyPlanGroups.entries()).map(([_combiGroupId, plans]) => {
      const primaryPlan = plans[0]
      const contract = getContractForMonthlyPlan(primaryPlan)
      const customer = contract ? customers.find(c => c.id === contract.customer_id) : null
      const laycan = getLaycanDisplay(primaryPlan, contract)
      
      return {
        cargo: null as Cargo | null,
        combiCargos: null as Cargo[] | null,
        monthlyPlan: primaryPlan,  // Use first plan as reference
        combiMonthlyPlans: plans,  // Keep all plans for display
        contract,
        customer,
        laycan,
        laycanSortValue: getLaycanSortValue(laycan),
        isMonthlyPlan: true,
        isCombi: true,  // Mark as combi for unified display
      }
    })
    
    const monthlyPlansWithInfo = [...nonCombiMonthlyPlansWithInfo, ...combiMonthlyPlansWithInfo]
    
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
                <TableCell sx={{ minWidth: isMobile ? 100 : 130, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Delivery Window</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 150, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Remark</TableCell>
                <TableCell sx={{ minWidth: isMobile ? 100 : 120, fontWeight: 'bold', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredCargos.map(({ cargo, combiCargos, contract, customer, laycan, isMonthlyPlan, monthlyPlan, combiMonthlyPlans, isCombi }) => (
                    <TableRow 
                  key={cargo 
                    ? (isCombi ? `combi-cargo-${cargo.combi_group_id}` : `cargo-${cargo.id}`) 
                    : (isCombi && combiMonthlyPlans ? `combi-plan-${combiMonthlyPlans[0]?.combi_group_id}` : `monthly-plan-${monthlyPlan?.id}`)
                  }
                  onClick={() => {
                    if (isMonthlyPlan && monthlyPlan) {
                      // For combie, pass all monthly plans in the group
                      handleCreateCargoForPlan(monthlyPlan, isCombi && combiMonthlyPlans ? combiMonthlyPlans : undefined)
                    } else if (cargo) {
                      // For combi cargos, edit the first cargo in the group
                      handleEditCargo(isCombi && combiCargos ? combiCargos[0] : cargo)
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                    {cargo ? cargo.vessel_name : 'TBA'}
                      {isCombi && (
                        <Chip 
                          label="Combie" 
                          size="small" 
                          sx={{ 
                            height: 18, 
                            fontSize: '0.65rem', 
                            bgcolor: '#F59E0B', 
                            color: 'white',
                            fontWeight: 600,
                          }}
                        />
                      )}
                      {/* SPOT contracts: check contract_category OR if monthly plan has direct contract_id (no quarterly_plan_id) */}
                      {(contract?.contract_category === 'SPOT' || 
                        (contract && contracts.find(c => c.id === contract.id)?.contract_category === 'SPOT') ||
                        (monthlyPlan && monthlyPlan.contract_id && !monthlyPlan.quarterly_plan_id)) && (
                        <Chip 
                          label="Spot" 
                          size="small" 
                          sx={{ 
                            height: 18, 
                            fontSize: '0.65rem', 
                            bgcolor: '#FCE7F3', 
                            color: '#9D174D',
                            fontWeight: 600,
                            border: '1px solid #F9A8D4',
                          }}
                        />
                      )}
                    </Box>
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
                              color={contract.payment_method === 'T/T' ? 'success' : 'warning'}
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
                        {isCombi && combiCargos ? (
                          <Box>
                            {combiCargos.map((c) => (
                              <Typography key={c.id} variant="body2" sx={{ fontSize: '0.875rem' }}>
                                {c.product_name}: {c.cargo_quantity} KT
                              </Typography>
                            ))}
                          </Box>
                        ) : isCombi && combiMonthlyPlans ? (
                          <Box>
                            {combiMonthlyPlans.map((mp: MonthlyPlan) => {
                              // Get product name - SPOT contracts have it directly
                              const productName = getProductNameForMonthlyPlan(mp)
                              return (
                                <Typography key={mp.id} variant="body2" sx={{ fontSize: '0.875rem' }}>
                                  {productName}: {mp.month_quantity} KT
                                </Typography>
                              )
                            })}
                          </Box>
                        ) : (
                          cargo ? cargo.product_name : (
                            // For non-combi monthly plans
                            monthlyPlan ? getProductNameForMonthlyPlan(monthlyPlan) : '-'
                          )
                        )}
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
                    {cargo ? (
                      <Box>
                        {(() => {
                          const topupQty = (cargo as any).authority_topup_quantity || 0
                          return (
                            <>
                              <Typography variant="body2" fontWeight={isCombi ? 600 : 400}>
                                {cargo.cargo_quantity} KT
                              </Typography>
                              {isCombi ? (
                                <Typography variant="caption" sx={{ color: topupQty > 0 ? '#10B981' : 'text.secondary' }}>
                                  (Total{topupQty > 0 ? `, incl. ${topupQty} top-up` : ''})
                                </Typography>
                              ) : topupQty > 0 && (
                                <Typography variant="caption" sx={{ display: 'block', color: '#10B981' }}>
                                  (incl. {topupQty} top-up)
                                </Typography>
                              )}
                            </>
                          )
                        })()}
                      </Box>
                    ) : isCombi && combiMonthlyPlans ? (
                      <Box>
                        {(() => {
                          const totalQty = combiMonthlyPlans.reduce((sum: number, mp: MonthlyPlan) => sum + mp.month_quantity, 0)
                          const totalTopup = combiMonthlyPlans.reduce((sum: number, mp: MonthlyPlan) => sum + ((mp as any).authority_topup_quantity || 0), 0)
                          return (
                            <>
                              <Typography variant="body2" fontWeight={600}>
                                {totalQty} KT
                              </Typography>
                              <Typography variant="caption" sx={{ color: totalTopup > 0 ? '#10B981' : 'text.secondary' }}>
                                (Total{totalTopup > 0 ? `, incl. ${totalTopup} top-up` : ''})
                              </Typography>
                            </>
                          )
                        })()}
                      </Box>
                    ) : monthlyPlan ? (
                      <Box>
                        <Typography variant="body2">
                          {monthlyPlan.month_quantity} KT
                        </Typography>
                        {((monthlyPlan as any).authority_topup_quantity || 0) > 0 && (
                          <Typography variant="caption" sx={{ color: '#10B981' }}>
                            (incl. {(monthlyPlan as any).authority_topup_quantity} top-up)
                          </Typography>
                        )}
                      </Box>
                    ) : '-'}
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
                        minWidth: isMobile ? 100 : 130,
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal'
                      }}>
                        {contract?.contract_type === 'CIF' && monthlyPlan?.delivery_window ? monthlyPlan.delivery_window : '-'}
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
        <Box sx={{ borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
          <Tabs 
            value={value} 
            onChange={handleChange} 
            aria-label="homepage tabs"
            variant={isMobile ? 'scrollable' : 'standard'}
            scrollButtons={isMobile ? 'auto' : false}
            sx={{
              px: 1,
              '& .MuiTabs-indicator': {
                height: 3,
                borderRadius: '3px 3px 0 0',
              },
              '& .MuiTab-root': {
                minHeight: isMobile ? 44 : 48,
                fontSize: isMobile ? '0.75rem' : '0.875rem',
                fontWeight: 500,
                px: isMobile ? 1.5 : 2,
                color: '#64748B',
                transition: 'color 0.15s ease',
                '&.Mui-selected': {
                  color: '#475569',
                  fontWeight: 600,
                },
                '&:hover': {
                  color: '#334155',
                },
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
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
                const allRows = (
                  activeLoadings
                    .map((cargo) => ({ cargo, op: getPortOpForCargo(cargo, port) }))
                    // Show both Loading and Completed Loading so a completed port doesn't disappear
                    // until ALL ports complete (then it moves to Completed Cargos tab).
                    .filter((x) => x.op && (x.op.status === 'Loading' || x.op.status === 'Completed Loading'))
                ) as Array<{ cargo: Cargo; op: CargoPortOperation }>

                // Group combie cargos - only show one row per combi_group_id
                const seenCombiGroups = new Set<string>()
                const rows = allRows.filter(({ cargo }) => {
                  if (cargo.combi_group_id) {
                    if (seenCombiGroups.has(cargo.combi_group_id)) {
                      return false // Skip duplicate combie rows
                    }
                    seenCombiGroups.add(cargo.combi_group_id)
                  }
                  return true
                })

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
                            <TableCell sx={{ fontWeight: 'bold', minWidth: 130 }}>Delivery Window</TableCell>
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
                                <TableCell sx={{ fontWeight: 600 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {cargo.vessel_name}
                                    {cargo.combi_group_id && (
                                      <Chip 
                                        label="Combie" 
                                        size="small" 
                                        sx={{ 
                                          bgcolor: '#F59E0B', 
                                          color: 'white', 
                                          fontWeight: 600,
                                          fontSize: '0.7rem',
                                          height: 20,
                                        }} 
                                      />
                                    )}
                                  </Box>
                                </TableCell>
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
                                      color={contract.payment_method === 'T/T' ? 'success' : 'warning'}
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
                                  {cargo.combi_group_id ? (
                                    // For combie cargos, show all products in the combie group
                                    // Look in all cargo arrays since not all combie cargos may be in activeLoadings
                                    <Box>
                                      {[...portMovement, ...activeLoadings, ...completedCargos, ...inRoadCIF]
                                        .filter(c => c.combi_group_id === cargo.combi_group_id)
                                        .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
                                        .map(c => (
                                          <Typography key={c.id} variant="body2" sx={{ fontSize: '0.875rem' }}>
                                            {c.product_name}: {c.cargo_quantity} KT
                                          </Typography>
                                        ))
                                      }
                                    </Box>
                                  ) : (
                                    cargo.product_name || '-'
                                  )}
                                </TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>{laycan}</TableCell>
                                <TableCell>
                                  {cargo.combi_group_id ? (
                                    // For combie cargos, show total quantity
                                    // Look in all cargo arrays since not all combie cargos may be in activeLoadings
                                    <Box>
                                      {(() => {
                                        const combiCargos = [...portMovement, ...activeLoadings, ...completedCargos, ...inRoadCIF]
                                          .filter(c => c.combi_group_id === cargo.combi_group_id)
                                          .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
                                        const totalQty = combiCargos.reduce((sum, c) => sum + c.cargo_quantity, 0)
                                        const totalTopup = combiCargos.reduce((sum, c) => sum + ((c as any).authority_topup_quantity || 0), 0)
                                        return (
                                          <>
                                            <Typography variant="body2" fontWeight={600}>
                                              {totalQty} KT
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: totalTopup > 0 ? '#10B981' : 'text.secondary' }}>
                                              (Total{totalTopup > 0 ? `, incl. ${totalTopup} top-up` : ''})
                                            </Typography>
                                          </>
                                        )
                                      })()}
                                    </Box>
                                  ) : (
                                    <>
                                      {cargo.cargo_quantity?.toLocaleString?.() ?? cargo.cargo_quantity}
                                      {((cargo as any).authority_topup_quantity || 0) > 0 && (
                                        <Typography variant="caption" sx={{ display: 'block', color: '#10B981' }}>
                                          (incl. {(cargo as any).authority_topup_quantity} top-up)
                                        </Typography>
                                      )}
                                    </>
                                  )}
                                </TableCell>
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
                                  <InlineTextField
                                    value={op.eta || ''}
                                    onSave={(val) => schedulePortOpSave(cargo.id, port, { eta: val })}
                                  />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <InlineTextField
                                    value={op.berthed || ''}
                                    onSave={(val) => schedulePortOpSave(cargo.id, port, { berthed: val })}
                                  />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <InlineTextField
                                    value={op.commenced || ''}
                                    onSave={(val) => schedulePortOpSave(cargo.id, port, { commenced: val })}
                                  />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <InlineTextField
                                    value={op.etc || ''}
                                    onSave={(val) => schedulePortOpSave(cargo.id, port, { etc: val })}
                                  />
                                </TableCell>
                                <TableCell>
                                  {contract?.contract_type === 'CIF' && monthlyPlan?.delivery_window ? monthlyPlan.delivery_window : '-'}
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <InlineTextField
                                    value={op.notes || ''}
                                    onSave={(val) => schedulePortOpSave(cargo.id, port, { notes: val })}
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
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
              In-Road CIF Cargos (Pending Discharge)
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Search vessel, customer, product, contract..."
                value={inRoadCIFSearch}
                onChange={(e) => setInRoadCIFSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: inRoadCIFSearch && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setInRoadCIFSearch('')}>
                        <Clear sx={{ fontSize: 18 }} />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{ 
                  minWidth: isMobile ? '100%' : 300, 
                  fontSize: '0.875rem',
                }}
              />
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Filter by Customer</InputLabel>
              <Select
                multiple
                value={inRoadCIFFilterCustomers}
                label="Filter by Customer"
                onChange={(e) => {
                  const val = e.target.value as number[]
                  if (val.includes(-1)) {
                    setInRoadCIFFilterCustomers([])
                  } else {
                    setInRoadCIFFilterCustomers(val)
                  }
                }}
                renderValue={(selected) => {
                  if ((selected as number[]).length === 0) return 'All Customers'
                  return (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as number[]).map((customerId) => {
                        const customer = customers.find(c => c.id === customerId)
                        return (
                          <Chip
                            key={customerId}
                            label={customer?.name || customerId}
                            size="small"
                          />
                        )
                      })}
                    </Box>
                  )
                }}
              >
                <MenuItem value={-1}>
                  <Checkbox checked={inRoadCIFFilterCustomers.length === 0} />
                  <ListItemText primary="All Customers" />
                </MenuItem>
                {customers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    <Checkbox checked={inRoadCIFFilterCustomers.includes(customer.id)} />
                    <ListItemText primary={customer.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            </Box>
          </Box>
          {renderInRoadCIFTable(
            inRoadCIFFilterCustomers.length === 0
              ? inRoadCIF
              : inRoadCIF.filter(cargo => inRoadCIFFilterCustomers.includes(cargo.customer_id))
          )}
        </TabPanel>
        <TabPanel value={value} index={3}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B', mb: 2 }}>
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
              {/* Product info - shown for both new and existing cargos */}
                    <Grid item xs={12}>
                {!editingCargo && cargoContract ? (
                  // Creating new cargo
                  combiMonthlyPlansForCargo.length > 0 ? (
                    // Combie cargo - show products as read-only
                    <Box sx={{ p: 2, bgcolor: '#FEF3C7', borderRadius: 1, border: '1px solid #F59E0B' }}>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: '#92400E' }}>
                        Combie Cargo Products:
                          </Typography>
                      {combiMonthlyPlansForCargo.map((mp) => {
                        const productName = getProductNameForMonthlyPlan(mp)
                        const topupQty = (mp as any).authority_topup_quantity || 0
                        const originalQty = mp.month_quantity - topupQty
                        return (
                          <Box key={mp.id}>
                            <Typography variant="body2" sx={{ color: '#78350F' }}>
                              • {productName}: {mp.month_quantity} KT
                              {topupQty > 0 && (
                                <span style={{ color: '#10B981', marginLeft: 8, fontSize: '0.85em' }}>
                                  ({originalQty} + {topupQty} top-up)
                                </span>
                              )}
                          </Typography>
                        </Box>
                        )
                      })}
                      {(() => {
                        const totalQty = combiMonthlyPlansForCargo.reduce((sum, mp) => sum + mp.month_quantity, 0)
                        const totalTopup = combiMonthlyPlansForCargo.reduce((sum, mp) => sum + ((mp as any).authority_topup_quantity || 0), 0)
                        return (
                          <Typography variant="body2" sx={{ mt: 1, fontWeight: 600, color: '#92400E' }}>
                            Total: {totalQty} KT
                            {totalTopup > 0 && (
                              <span style={{ color: '#10B981', marginLeft: 8, fontSize: '0.85em' }}>
                                (incl. {totalTopup} top-up)
                              </span>
                            )}
                          </Typography>
                        )
                      })()}
                      </Box>
                  ) : (
                    // Single product cargo - show as read-only
                    <Box sx={{ p: 2, bgcolor: '#F3F4F6', borderRadius: 1, border: '1px solid #D1D5DB' }}>
                      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600, color: '#374151' }}>
                        Product:
                      </Typography>
                      {(() => {
                        const topupQty = (cargoMonthlyPlan as any)?.authority_topup_quantity || 0
                        const totalQty = parseFloat(cargoFormData.cargo_quantity) || 0
                        const originalQty = totalQty - topupQty
                        return (
                          <>
                            <Typography variant="body1" sx={{ color: '#111827', fontWeight: 500 }}>
                              {cargoProductName} - {cargoFormData.cargo_quantity} KT
                            </Typography>
                            {topupQty > 0 && (
                              <Box sx={{ mt: 0.5, p: 0.75, bgcolor: '#F0FDF4', borderRadius: 1, border: '1px solid #D1FAE5' }}>
                                <Typography variant="caption" sx={{ color: '#166534' }}>
                                  📊 Original: {originalQty} KT | ➕ Top-up: {topupQty} KT
                                </Typography>
                              </Box>
                            )}
                          </>
                        )
                      })()}
                            </Box>
                  )
                ) : editingCargo ? (
                  // Editing existing cargo
                  editingCargo.combi_group_id ? (
                    // Combie cargo - show all products in the group
                    <Box sx={{ p: 2, bgcolor: '#FEF3C7', borderRadius: 1, border: '1px solid #F59E0B' }}>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: '#92400E' }}>
                        Combie Cargo Products:
                      </Typography>
                      {(() => {
                        const combiCargos = [...portMovement, ...completedCargos, ...inRoadCIF, ...activeLoadings]
                          .filter(c => c.combi_group_id === editingCargo.combi_group_id)
                          .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
                        const totalQty = combiCargos.reduce((sum, c) => sum + c.cargo_quantity, 0)
                        const totalTopup = combiCargos.reduce((sum, c) => sum + ((c as any).authority_topup_quantity || 0), 0)
                        return (
                          <>
                            {combiCargos.map(c => {
                              const topupQty = (c as any).authority_topup_quantity || 0
                              const originalQty = c.cargo_quantity - topupQty
                              return (
                                <Typography key={c.id} variant="body2" sx={{ color: '#78350F' }}>
                                  • {c.product_name}: {c.cargo_quantity} KT
                                  {topupQty > 0 && (
                                    <span style={{ color: '#10B981', marginLeft: 8, fontSize: '0.85em' }}>
                                      ({originalQty} + {topupQty} top-up)
                                    </span>
                                  )}
                      </Typography>
                              )
                            })}
                            <Typography variant="body2" sx={{ mt: 1, fontWeight: 600, color: '#92400E' }}>
                              Total: {totalQty} KT
                              {totalTopup > 0 && (
                                <span style={{ color: '#10B981', marginLeft: 8, fontSize: '0.85em' }}>
                                  (incl. {totalTopup} top-up)
                                </span>
                              )}
                            </Typography>
                          </>
                        )
                      })()}
                            </Box>
                  ) : (
                    // Single product cargo - show as read-only
                    <Box sx={{ p: 2, bgcolor: '#F3F4F6', borderRadius: 1, border: '1px solid #D1D5DB' }}>
                      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600, color: '#374151' }}>
                        Product:
                      </Typography>
                      {(() => {
                        const topupQty = (editingCargo as any).authority_topup_quantity || 0
                        const originalQty = editingCargo.cargo_quantity - topupQty
                        return (
                          <>
                            <Typography variant="body1" sx={{ color: '#111827', fontWeight: 500 }}>
                              {editingCargo.product_name} - {editingCargo.cargo_quantity} KT
                            </Typography>
                            {topupQty > 0 && (
                              <Box sx={{ mt: 0.5, p: 0.75, bgcolor: '#F0FDF4', borderRadius: 1, border: '1px solid #D1FAE5' }}>
                                <Typography variant="caption" sx={{ color: '#166534' }}>
                                  📊 Original: {originalQty} KT | ➕ Top-up: {topupQty} KT
                                </Typography>
                              </Box>
              )}
                          </>
                        )
                      })()}
                    </Box>
                  )
                ) : null}
                    </Grid>
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
                    {Array.from(new Set([...loadPortOptions, ...(cargoFormData.load_ports || [])])).map((port) => (
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
                        {Array.from(new Set([...inspectorOptions, cargoFormData.inspector_name].filter(Boolean))).map((inspector) => (
                          <MenuItem key={inspector} value={inspector}>{inspector}</MenuItem>
                        ))}
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
                      label="Delivery Window (from Monthly Plan)"
                      value={cargoMonthlyPlan?.delivery_window || '-'}
                      fullWidth
                      disabled
                      sx={{
                        '& .MuiInputBase-input.Mui-disabled': {
                          WebkitTextFillColor: 'rgba(0, 0, 0, 0.6)',
                          backgroundColor: 'rgba(0, 0, 0, 0.04)',
                        },
                      }}
                      InputProps={{
                        readOnly: true,
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="ETA Discharge Port"
                      type="text"
                      value={cargoFormData.eta_discharge_port}
                      onChange={(e) => setCargoFormData({ ...cargoFormData, eta_discharge_port: e.target.value })}
                      fullWidth
                      placeholder="Enter ETA to discharge port"
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Discharge Port Location"
                      value={cargoFormData.discharge_port_location}
                      onChange={(e) => setCargoFormData({ ...cargoFormData, discharge_port_location: e.target.value })}
                      fullWidth
                      placeholder="Enter discharge port location"
                    />
                  </Grid>
                  {/* Only show 5-ND field for In-Road CIF cargos */}
                  {editingCargo && editingCargo.status === 'In-Road (Pending Discharge)' && (
                  <Grid item xs={12} md={6}>
                    <TextField
                        label="5-ND (Narrowing Down Due Date)"
                        type="date"
                        value={cargoFormData.five_nd_date}
                        onChange={(e) => setCargoFormData({ ...cargoFormData, five_nd_date: e.target.value })}
                      fullWidth
                      disabled={isCompletedCargo}
                        InputLabelProps={{ shrink: true }}
                        helperText="Due date for narrowing down delivery window"
                      sx={isCompletedCargo ? disabledStyle : {}}
                    />
                  </Grid>
                  )}
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
                            onChange={(e) => {
                              const nextStatus = e.target.value as CargoStatus
                              const hasPorts = Array.isArray(cargoFormData.load_ports) && cargoFormData.load_ports.filter(Boolean).length > 0
                              if ((nextStatus === 'Loading' || nextStatus === 'Completed Loading') && !hasPorts) {
                                alert('Please select at least one Load Port before setting status to Loading.')
                                return
                              }
                              setCargoFormData({ ...cargoFormData, status: nextStatus })
                            }}
                          >
                            <MenuItem value="Planned">Planned</MenuItem>
                            <MenuItem
                              value="Loading"
                              disabled={!Array.isArray(cargoFormData.load_ports) || cargoFormData.load_ports.filter(Boolean).length === 0}
                            >
                              Loading
                            </MenuItem>
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
                            <MenuItem
                              value="Completed Loading"
                              disabled={!Array.isArray(cargoFormData.load_ports) || cargoFormData.load_ports.filter(Boolean).length === 0}
                            >
                              Completed Loading
                            </MenuItem>
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
                      <MenuItem value="Financial Hold">Financial Hold</MenuItem>
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

