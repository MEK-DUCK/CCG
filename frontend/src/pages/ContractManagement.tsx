import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  IconButton,
  MenuItem,
  Chip,
  Tabs,
  Tab,
  Grid,
  FormControl,
  InputLabel,
  Select,
  Checkbox,
  TablePagination,
  Paper,
  Snackbar,
  Alert,
} from '@mui/material'
import { Add, Edit, Delete, Search, Dashboard, Description } from '@mui/icons-material'
import client, { contractAPI, customerAPI, quarterlyPlanAPI } from '../api/client'
import type { Contract, Customer, QuarterlyPlan, ContractProduct, YearQuantity } from '../types'
import QuarterlyPlanForm from '../components/QuarterlyPlanForm'
import MonthlyPlanForm from '../components/MonthlyPlanForm'
import { useConflictHandler } from '../components/Presence'

// Fallback product options if API fails
const DEFAULT_PRODUCT_OPTIONS = ['JET A-1', 'GASOIL', 'GASOIL 10PPM', 'HFO', 'LSFO']

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
      id={`contract-tabpanel-${index}`}
      aria-labelledby={`contract-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  )
}

// Calculate number of contract years from start/end period
const calculateContractYears = (startPeriod: string, endPeriod: string): number => {
  if (!startPeriod || !endPeriod) return 1
  const start = new Date(startPeriod)
  const end = new Date(endPeriod)
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  return Math.max(1, Math.ceil(months / 12))
}

// Get calendar year for a contract year
const getCalendarYear = (startPeriod: string, contractYear: number): number => {
  if (!startPeriod) return new Date().getFullYear()
  return new Date(startPeriod).getFullYear() + (contractYear - 1)
}

export default function ContractManagement() {
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [productOptions, setProductOptions] = useState<string[]>(DEFAULT_PRODUCT_OPTIONS)
  const [dataChangedNotification, setDataChangedNotification] = useState<string | null>(null)

  // Conflict handler for optimistic locking
  const { handleApiError, ConflictDialogComponent } = useConflictHandler({
    onRefresh: () => loadContracts(),
    entityName: 'Contract'
  })
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [quarterlyPlans, setQuarterlyPlans] = useState<QuarterlyPlan[]>([])
  const [open, setOpen] = useState(false)
  const [tabValue, setTabValue] = useState(0)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [filterCustomer, setFilterCustomer] = useState<number[]>([])
  const [filterYear, setFilterYear] = useState<number[]>([])

  // Pagination
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [searchTerm, filterCustomer, filterYear])
  const [formData, setFormData] = useState({
    customer_id: '',
    contract_number: '',
    contract_type: 'FOB' as 'FOB' | 'CIF',
    contract_category: 'TERM' as 'TERM' | 'SEMI_TERM' | 'SPOT',
    payment_method: '' as '' | 'T/T' | 'LC',
    start_period: '',
    end_period: '',
    fiscal_start_month: '' as '' | number,  // When Q1 starts (1-12), auto-detected from start_period
    products: [] as ContractProduct[],  // Array of products with quantities
    discharge_ranges: '',
    additives_required: '' as '' | 'yes' | 'no',
    fax_received: '' as '' | 'yes' | 'no',
    fax_received_date: '',
    concluded_memo_received: '' as '' | 'yes' | 'no',
    concluded_memo_received_date: '',
  })

  const jetA1Selected = formData.products.some((p) => p.name === 'JET A-1')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedContract && selectedContract.id) {
      try {
        loadContractDetailsAndSetTab(selectedContract.id)
      } catch (error) {
        console.error('Error in useEffect for selectedContract:', error)
      }
    } else {
      setQuarterlyPlans([])
    }
  }, [selectedContract])

  const loadData = async () => {
    try {
      // Load contracts, customers, and products in parallel - they're independent
      const [contractsRes, customersRes, productsRes] = await Promise.all([
        contractAPI.getAll(),
        customerAPI.getAll(),
        client.get('/api/products/names').catch(() => ({ data: DEFAULT_PRODUCT_OPTIONS })),
      ])
      const loadedContracts = contractsRes.data || []
      
      // Update product options from API
      if (productsRes.data && productsRes.data.length > 0) {
        setProductOptions(productsRes.data)
      }
      const loadedCustomers = customersRes.data || []
      
      setContracts(loadedContracts)
      setCustomers(loadedCustomers)
      
      return loadedContracts
    } catch (error: any) {
      console.error('Error loading data:', error)
      alert(`Error loading data: ${error?.message || 'Unknown error'}`)
      setContracts([])
      setCustomers([])
      return []
    }
  }

  const loadContractDetails = async (contractId: number) => {
    try {
      setQuarterlyPlans([])
      const quarterlyRes = await quarterlyPlanAPI.getAll(contractId)
      const filteredQuarterlyPlans = (quarterlyRes.data || []).filter((p: QuarterlyPlan) => p.contract_id === contractId)
      setQuarterlyPlans(filteredQuarterlyPlans)
      return filteredQuarterlyPlans
    } catch (error) {
      console.error('Error loading contract details:', error)
      setQuarterlyPlans([])
      return []
    }
  }

  const loadContractDetailsAndSetTab = async (contractId: number) => {
    const plans = await loadContractDetails(contractId)
    // If quarterly plans exist, default to Monthly Plan tab (index 1)
    // Otherwise, default to Quarterly Plan tab (index 0)
    if (plans && plans.length > 0) {
      setTabValue(1) // Monthly Plan tab
    } else {
      setTabValue(0) // Quarterly Plan tab
    }
  }

  const handleOpen = (contract?: Contract) => {
    if (contract) {
      setEditingContract(contract)
      setFormData({
        customer_id: contract.customer_id.toString(),
        contract_number: contract.contract_number,
        contract_type: contract.contract_type,
        contract_category: contract.contract_category || 'TERM',
        payment_method: contract.payment_method || '',
        start_period: contract.start_period,
        end_period: contract.end_period,
        fiscal_start_month: contract.fiscal_start_month || '',
        products: contract.products || [],
        discharge_ranges: contract.discharge_ranges || '',
        additives_required: contract.additives_required === true ? 'yes' : contract.additives_required === false ? 'no' : '',
        fax_received: contract.fax_received === true ? 'yes' : contract.fax_received === false ? 'no' : '',
        fax_received_date: contract.fax_received_date || '',
        concluded_memo_received: contract.concluded_memo_received === true ? 'yes' : contract.concluded_memo_received === false ? 'no' : '',
        concluded_memo_received_date: contract.concluded_memo_received_date || '',
      })
    } else {
      setEditingContract(null)
      setFormData({
        customer_id: '',
        contract_number: '',
        contract_type: 'FOB',
        contract_category: 'TERM',
        payment_method: '',
        start_period: '',
        end_period: '',
        fiscal_start_month: '',
        products: [],
        discharge_ranges: '',
        additives_required: '',
        fax_received: '',
        fax_received_date: '',
        concluded_memo_received: '',
        concluded_memo_received_date: '',
      })
    }
    setOpen(true)
  }

  // Calculate number of years for the current contract period
  const numContractYears = calculateContractYears(formData.start_period, formData.end_period)
  
  const handleAddProduct = () => {
    // Initialize year_quantities for multi-year contracts
    const yearQuantities: YearQuantity[] = numContractYears > 1 
      ? Array.from({ length: numContractYears }, (_, i) => ({ year: i + 1, quantity: 0, optional_quantity: 0 }))
      : []
    
    setFormData({
      ...formData,
      products: [...formData.products, { 
        name: '', 
        total_quantity: 0, 
        optional_quantity: 0,
        year_quantities: yearQuantities.length > 0 ? yearQuantities : undefined
      }]
    })
  }

  const handleRemoveProduct = (index: number) => {
    setFormData({
      ...formData,
      products: formData.products.filter((_, i) => i !== index)
    })
  }

  const handleProductChange = (index: number, field: keyof ContractProduct, value: string | number) => {
    const updatedProducts = [...formData.products]
    updatedProducts[index] = { ...updatedProducts[index], [field]: value }
    setFormData({ ...formData, products: updatedProducts })
  }
  
  // Handle year-specific quantity changes
  const handleYearQuantityChange = (productIndex: number, year: number, field: 'quantity' | 'optional_quantity', value: number) => {
    const updatedProducts = [...formData.products]
    const product = updatedProducts[productIndex]
    
    // Initialize year_quantities if needed
    if (!product.year_quantities) {
      product.year_quantities = Array.from({ length: numContractYears }, (_, i) => ({ 
        year: i + 1, 
        quantity: 0, 
        optional_quantity: 0 
      }))
    }
    
    // Find and update the specific year
    const yearIndex = product.year_quantities.findIndex(yq => yq.year === year)
    if (yearIndex >= 0) {
      product.year_quantities[yearIndex] = { 
        ...product.year_quantities[yearIndex], 
        [field]: value 
      }
    }
    
    // Recalculate total_quantity from year_quantities
    product.total_quantity = product.year_quantities.reduce((sum, yq) => sum + (yq.quantity || 0), 0)
    product.optional_quantity = product.year_quantities.reduce((sum, yq) => sum + (yq.optional_quantity || 0), 0)
    
    setFormData({ ...formData, products: updatedProducts })
  }
  
  // Update year_quantities when contract period changes
  useEffect(() => {
    if (formData.products.length > 0 && numContractYears > 1) {
      const updatedProducts = formData.products.map(product => {
        // Only update if year_quantities doesn't exist or has wrong length
        if (!product.year_quantities || product.year_quantities.length !== numContractYears) {
          const existingYears = product.year_quantities || []
          const newYearQuantities: YearQuantity[] = Array.from({ length: numContractYears }, (_, i) => {
            const existing = existingYears.find(yq => yq.year === i + 1)
            return existing || { year: i + 1, quantity: 0, optional_quantity: 0 }
          })
          return { ...product, year_quantities: newYearQuantities }
        }
        return product
      })
      
      // Only update if there are actual changes
      const hasChanges = updatedProducts.some((p, i) => 
        JSON.stringify(p.year_quantities) !== JSON.stringify(formData.products[i].year_quantities)
      )
      
      if (hasChanges) {
        setFormData(prev => ({ ...prev, products: updatedProducts }))
      }
    }
  }, [numContractYears])

  const handleClose = () => {
    setOpen(false)
    setEditingContract(null)
    // Reset form data when closing
    setFormData({
      customer_id: '',
      contract_number: '',
      contract_type: 'FOB',
      contract_category: 'TERM',
      payment_method: '' as '' | 'T/T' | 'LC',
      start_period: '',
      end_period: '',
      fiscal_start_month: '',
      products: [],
      discharge_ranges: '',
      additives_required: '',
      fax_received: '',
      fax_received_date: '',
      concluded_memo_received: '',
      concluded_memo_received_date: '',
    })
  }

  const handleSubmit = async () => {
    try {
      const jetA1Selected = formData.products.some((p) => p.name === 'JET A-1')

      // Validate form
      if (!formData.customer_id || !formData.contract_number || !formData.start_period || !formData.end_period) {
        alert('Please fill in all required fields')
        return
      }

      if (formData.products.length === 0) {
        alert('Please add at least one product')
        return
      }

      // Validate products
      for (const product of formData.products) {
        if (!product.name || !productOptions.includes(product.name)) {
          alert(`Invalid product. Must be one of: ${productOptions.join(', ')}`)
          return
        }
        if (!product.total_quantity || product.total_quantity <= 0) {
          alert(`Total quantity must be greater than 0 for ${product.name}`)
          return
        }
      }

      const payload = {
        customer_id: parseInt(formData.customer_id),
        contract_number: formData.contract_number,
        contract_type: formData.contract_type,
        contract_category: formData.contract_category,
        payment_method: formData.payment_method || undefined,
        start_period: formData.start_period,
        end_period: formData.end_period,
        fiscal_start_month: formData.fiscal_start_month || undefined,
        products: formData.products.map(p => ({
          name: p.name,
          total_quantity: p.total_quantity,
          optional_quantity: p.optional_quantity || 0,
          year_quantities: p.year_quantities && p.year_quantities.length > 0 ? p.year_quantities : undefined
        })),
        discharge_ranges: formData.discharge_ranges || undefined,
        additives_required: jetA1Selected ? (formData.additives_required === '' ? undefined : formData.additives_required === 'yes') : undefined,
        fax_received: formData.fax_received === '' ? undefined : formData.fax_received === 'yes',
        fax_received_date: formData.fax_received === 'yes' && formData.fax_received_date ? formData.fax_received_date : undefined,
        concluded_memo_received: formData.concluded_memo_received === '' ? undefined : formData.concluded_memo_received === 'yes',
        concluded_memo_received_date: formData.concluded_memo_received === 'yes' && formData.concluded_memo_received_date ? formData.concluded_memo_received_date : undefined,
      }

      console.log('Submitting contract:', payload)
      
      let response
      if (editingContract) {
        console.log('Updating contract:', editingContract.id)
        response = await contractAPI.update(editingContract.id, payload)
      } else {
        console.log('Creating new contract')
        response = await contractAPI.create(payload)
      }
      
      console.log('Contract API response:', response)
      console.log('Response data:', response?.data)
      console.log('Created contract ID:', response?.data?.id || response?.data?.id)
      
      // Clear filters and search to ensure new contract is visible
      if (!editingContract) {
        setSearchTerm('')
        setFilterCustomer([])
        setFilterYear([])
      }
      
      // If creating a new contract, add it to state immediately so it appears right away
      if (!editingContract && response?.data) {
        const newContract = response.data
        console.log('Adding new contract to state immediately:', newContract)
        setContracts(prevContracts => {
          // Check if already exists (shouldn't, but just in case)
          const exists = prevContracts.some(c => c.id === newContract.id)
          if (!exists) {
            // Add to the beginning of the list (newest first)
            return [newContract, ...prevContracts]
          }
          return prevContracts
        })
      } else if (editingContract && response?.data) {
        // Update existing contract in state
        const updatedContract = response.data
        console.log('Updating contract in state:', updatedContract)
        setContracts(prevContracts => 
          prevContracts.map(c => c.id === updatedContract.id ? updatedContract : c)
        )
      }
      
      // Show success message
      alert(editingContract ? 'Contract updated successfully!' : 'Contract created successfully!')
      
      // Close dialog
      handleClose()
      
      // Reload data in background to ensure everything is in sync
      // Add a small delay to ensure database transaction is committed
      setTimeout(async () => {
        try {
          console.log('Reloading data after contract save...')
          await loadData()
        } catch (error) {
          console.error('Error reloading data:', error)
        }
      }, 300) // 300ms delay to ensure database commit
    } catch (error: any) {
      console.error('Error saving contract:', error)
      console.error('Error details:', error?.response?.data)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error occurred'
      alert(`Error saving contract: ${errorMessage}`)
    }
  }

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this contract?')) {
      try {
        await contractAPI.delete(id)
        loadData()
        if (selectedContract?.id === id) {
          setSelectedContract(null)
        }
      } catch (error) {
        console.error('Error deleting contract:', error)
        alert('Error deleting contract. Please try again.')
      }
    }
  }

  const getCustomerName = (customerId: number) => {
    const customer = customers.find((c) => c.id === customerId)
    return customer ? customer.name : `Customer ID: ${customerId}`
  }

  // Memoized filtered contracts for pagination
  const filteredContracts = useMemo(() => {
    return contracts.filter((contract) => {
      // Search filter
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim()
        const customerName = getCustomerName(contract.customer_id).toLowerCase()
        const contractNumber = contract.contract_number.toLowerCase()
        if (!customerName.includes(searchLower) && !contractNumber.includes(searchLower)) {
          return false
        }
      }
      
      // Customer filter
      if (filterCustomer.length > 0 && !filterCustomer.includes(contract.customer_id)) {
        return false
      }
      
      // Year filter - check if contract period overlaps with any selected year
      if (filterYear.length > 0) {
        const startDate = new Date(contract.start_period)
        const endDate = new Date(contract.end_period)
        const contractStartYear = startDate.getFullYear()
        const contractEndYear = endDate.getFullYear()
        
        // Get all years the contract spans
        const contractYears: number[] = []
        for (let year = contractStartYear; year <= contractEndYear; year++) {
          contractYears.push(year)
        }
        
        // Check if any selected year overlaps with contract years
        const hasMatchingYear = filterYear.some(year => contractYears.includes(year))
        if (!hasMatchingYear) {
          return false
        }
      }
      
      return true
    })
  }, [contracts, searchTerm, filterCustomer, filterYear, customers])

  const handlePlanCreated = async () => {
    if (selectedContract && selectedContract.id) {
      try {
        await loadContractDetails(selectedContract.id)
      } catch (error) {
        console.error('Error reloading contract details after plan creation:', error)
      }
    }
  }

  // Error boundary for rendering
  if (!contracts || !Array.isArray(contracts)) {
    return (
      <Box>
        <Typography>Loading contracts...</Typography>
      </Box>
    )
  }

  return (
    <Box>
      {/* Conflict dialog for optimistic locking */}
      {ConflictDialogComponent}

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

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1E293B', mb: 0.5 }}>
            Contract Management
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B' }}>
            Manage contracts, quarterly and monthly plans
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpen()}
          sx={{ 
            px: 3,
            py: 1,
            fontWeight: 600,
            bgcolor: '#2563EB',
            '&:hover': {
              bgcolor: '#1D4ED8',
            },
          }}
        >
          Add Contract
        </Button>
      </Box>
      
      {/* Filters */}
      <Paper sx={{ mb: 3, p: 2.5 }}>
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <TextField
            size="small"
            placeholder="Search customer or contract..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <Box sx={{ display: 'flex', alignItems: 'center', mr: 1, color: '#94A3B8' }}>
                  <Search fontSize="small" />
                </Box>
              ),
            }}
            sx={{ minWidth: 280, flex: '1 1 auto', maxWidth: 400 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Customer</InputLabel>
            <Select
              multiple
              value={filterCustomer}
              label="Customer"
              onChange={(e) => {
                const value = e.target.value
                setFilterCustomer(typeof value === 'string' ? [] : value as number[])
              }}
              renderValue={(selected) => {
                if (selected.length === 0) return 'All Customers'
                if (selected.length === 1) {
                  const customer = customers.find(c => c.id === selected[0])
                  return customer?.name || ''
                }
                return `${selected.length} selected`
              }}
            >
              {customers.map((customer) => (
                <MenuItem key={customer.id} value={customer.id}>
                  <Checkbox checked={filterCustomer.includes(customer.id)} size="small" />
                  {customer.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Year</InputLabel>
            <Select
              multiple
              value={filterYear}
              label="Year"
              onChange={(e) => {
                const value = e.target.value
                setFilterYear(typeof value === 'string' ? [] : value as number[])
              }}
              renderValue={(selected) => {
                if (selected.length === 0) return 'All Years'
                if (selected.length === 1) return selected[0].toString()
                return `${selected.length} years`
              }}
            >
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                <MenuItem key={year} value={year}>
                  <Checkbox checked={filterYear.includes(year)} size="small" />
                  {year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            px: 1.5, 
            py: 0.75, 
            bgcolor: '#F1F5F9', 
            borderRadius: 2,
            ml: 'auto'
          }}>
            <Typography variant="body2" sx={{ color: '#475569', fontWeight: 500 }}>
              {filteredContracts.length} contract{filteredContracts.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {customers.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center', mb: 3 }}>
          <Typography sx={{ color: '#64748B' }}>
            Please create a customer first before adding contracts.
          </Typography>
        </Paper>
      )}

      <Grid container spacing={3}>
        {!selectedContract?.id && (
          <Grid item xs={12}>
          <Paper sx={{ overflow: 'hidden' }}>
            <TableContainer>
              <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Contract Number</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Contract Type</TableCell>
                  <TableCell>FOB/CIF</TableCell>
                  <TableCell>Payment</TableCell>
                  <TableCell>Products</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                      <Box sx={{ 
                        width: 56, 
                        height: 56, 
                        borderRadius: 3, 
                        bgcolor: '#F1F5F9', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 2,
                      }}>
                        <Description sx={{ fontSize: 28, color: '#94A3B8' }} />
                      </Box>
                      <Typography variant="body1" sx={{ fontWeight: 500, color: '#475569' }}>
                        No contracts found
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#94A3B8', mt: 0.5 }}>
                        {searchTerm || filterCustomer.length > 0 || filterYear.length > 0 
                          ? 'Try adjusting your filters'
                          : 'Click "Add Contract" to create one'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (rowsPerPage > 0
                  ? filteredContracts.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  : filteredContracts
                ).map((contract) => (
                  <TableRow
                    key={contract.id}
                    onClick={() => {
                      try {
                        if (!contract) {
                          console.error('Contract is null/undefined')
                          alert('Invalid contract. Please try again.')
                          return
                        }
                        if (!contract.id) {
                          console.error('Contract has no ID:', contract)
                          alert('Contract has no ID. Please try again.')
                          return
                        }
                        setSelectedContract(contract)
                        // Tab value will be set by loadContractDetailsAndSetTab based on whether quarterly plans exist
                      } catch (error: any) {
                        console.error('ERROR selecting contract:', error)
                        console.error('Error stack:', error?.stack)
                        alert(`Error selecting contract: ${error?.message || 'Unknown error'}`)
                      }
                    }}
                    sx={{ 
                      cursor: 'pointer', 
                      transition: 'background-color 0.15s ease',
                      '&:hover': { bgcolor: 'rgba(71, 85, 105, 0.04)' } 
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B' }}>
                        {contract.contract_number}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#475569' }}>
                        {getCustomerName(contract.customer_id)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={contract.contract_category === 'SEMI_TERM' ? 'Semi-Term' : 
                               contract.contract_category === 'SPOT' ? 'Spot' : 'Term'}
                        size="small"
                        sx={{ 
                          fontWeight: 600,
                          bgcolor: contract.contract_category === 'TERM' ? '#E0E7FF' :
                                   contract.contract_category === 'SEMI_TERM' ? '#FEF3C7' : '#FCE7F3',
                          color: contract.contract_category === 'TERM' ? '#3730A3' :
                                 contract.contract_category === 'SEMI_TERM' ? '#92400E' : '#9D174D',
                          border: '1px solid',
                          borderColor: contract.contract_category === 'TERM' ? '#A5B4FC' :
                                       contract.contract_category === 'SEMI_TERM' ? '#FCD34D' : '#F9A8D4',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={contract.contract_type}
                        color={contract.contract_type === 'FOB' ? 'primary' : 'secondary'}
                        size="small"
                        sx={{ fontWeight: 500 }}
                      />
                    </TableCell>
                    <TableCell>
                      {contract.payment_method ? (
                        <Chip
                          label={contract.payment_method}
                          color={contract.payment_method === 'T/T' ? 'success' : 'warning'}
                          size="small"
                          sx={{ fontWeight: 500 }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ color: '#94A3B8' }}>—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#475569', fontSize: '0.8125rem' }}>
                        {contract.products && Array.isArray(contract.products) && contract.products.length > 0
                          ? contract.products.map((p: any) => (typeof p === 'object' ? p.name : p)).join(', ')
                          : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.8125rem' }}>
                        {new Date(contract.start_period).toLocaleDateString()} – {new Date(contract.end_period).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/contracts/${contract.id}/dashboard`)}
                          title="View Dashboard"
                          sx={{ color: '#475569', '&:hover': { bgcolor: 'rgba(71, 85, 105, 0.1)' } }}
                        >
                          <Dashboard fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleOpen(contract)}
                          title="Edit Contract"
                          sx={{ color: '#475569', '&:hover': { bgcolor: 'rgba(71, 85, 105, 0.1)' } }}
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(contract.id)}
                          title="Delete Contract"
                          sx={{ color: '#EF4444', '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.1)' } }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </TableContainer>
            {filteredContracts.length > 0 && (
              <TablePagination
                rowsPerPageOptions={[25, 50, { label: 'All', value: -1 }]}
                component="div"
                count={filteredContracts.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10))
                  setPage(0)
                }}
              />
            )}
          </Paper>
        </Grid>
        )}

        {selectedContract && selectedContract.id ? (
          <Grid item xs={12}>
            <Paper sx={{ minHeight: '400px', overflow: 'hidden' }}>
              <Box sx={{ p: 2, borderBottom: '1px solid rgba(148, 163, 184, 0.12)', bgcolor: '#F8FAFC' }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setSelectedContract(null)
                    setTabValue(0)
                  }}
                  sx={{ 
                    borderColor: '#E2E8F0',
                    color: '#475569',
                    '&:hover': {
                      borderColor: '#CBD5E1',
                      backgroundColor: '#F1F5F9',
                    }
                  }}
                >
                  ← Back to all contracts
                </Button>
              </Box>
              {/* SPOT contracts skip quarterly plan and go directly to monthly */}
              {selectedContract?.contract_category === 'SPOT' ? (
                <>
                  <Box sx={{ p: 2, bgcolor: '#FEF3C7', borderBottom: '1px solid #FCD34D' }}>
                    <Typography variant="body2" sx={{ color: '#92400E', fontWeight: 500 }}>
                      📋 Spot Contract — Monthly plan only (no quarterly planning required)
                    </Typography>
                  </Box>
                  <Box sx={{ p: 2 }}>
                    <MonthlyPlanForm
                      key={`monthly-spot-${selectedContract.id}`}
                      contractId={selectedContract.id}
                      contract={selectedContract}
                      quarterlyPlans={[]}
                      onPlanCreated={handlePlanCreated}
                      isSpotContract={true}
                    />
                  </Box>
                </>
              ) : (
                <>
                  <Tabs 
                    value={tabValue} 
                    onChange={(_, v) => {
                      try {
                        setTabValue(v)
                    } catch (error) {
                      console.error('Error changing tab:', error)
                    }
                  }}>
                    <Tab label="Quarterly Plan" />
                    <Tab label="Monthly Plan" />
                  </Tabs>
                  <TabPanel value={tabValue} index={0}>
                    {selectedContract && selectedContract.id ? (
                      <Box>
                        {/* Always show the QuarterlyPlanForm - it handles both create and edit */}
                        <QuarterlyPlanForm
                          contractId={selectedContract.id}
                          contract={selectedContract}
                          existingPlans={quarterlyPlans || []}
                          onPlanCreated={handlePlanCreated}
                        />
                      </Box>
                    ) : (
                      <Typography color="text.secondary">Please select a contract first</Typography>
                    )}
                  </TabPanel>
                  <TabPanel value={tabValue} index={1}>
                    {quarterlyPlans && quarterlyPlans.length > 0 && selectedContract ? (
                      <MonthlyPlanForm
                        key={`monthly-${selectedContract.id}`}
                        contractId={selectedContract.id}
                        contract={selectedContract}
                        quarterlyPlans={quarterlyPlans}
                        onPlanCreated={handlePlanCreated}
                      />
                    ) : (
                      <Typography color="text.secondary" sx={{ p: 2 }}>
                        Please create a quarterly plan first
                      </Typography>
                    )}
                  </TabPanel>
                </>
              )}
            </Paper>
          </Grid>
        ) : null}
      </Grid>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingContract ? 'Edit Contract' : 'Add New Contract'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Customer"
              value={formData.customer_id}
              onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
              select
              required
              fullWidth
              disabled={!!editingContract}
            >
              {customers.map((customer) => (
                <MenuItem key={customer.id} value={customer.id.toString()}>
                  {customer.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Contract Number"
              value={formData.contract_number}
              onChange={(e) => setFormData({ ...formData, contract_number: e.target.value })}
              required
              fullWidth
            />
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Contract Type"
                  value={formData.contract_type}
                  onChange={(e) => setFormData({ ...formData, contract_type: e.target.value as 'FOB' | 'CIF' })}
                  select
                  required
                  fullWidth
                >
                  <MenuItem value="FOB">FOB</MenuItem>
                  <MenuItem value="CIF">CIF</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Contract Category"
                  value={formData.contract_category}
                  onChange={(e) => setFormData({ ...formData, contract_category: e.target.value as 'TERM' | 'SEMI_TERM' | 'SPOT' })}
                  select
                  required
                  fullWidth
                  helperText={
                    formData.contract_category === 'TERM' ? 'Long-term, full quarterly planning by year' :
                    formData.contract_category === 'SEMI_TERM' ? '3-9 months, partial year' :
                    formData.contract_category === 'SPOT' ? 'Single cargo, 1 month or less' : ''
                  }
                >
                  <MenuItem value="TERM">Term (Long-term)</MenuItem>
                  <MenuItem value="SEMI_TERM">Semi-Term (3-9 months)</MenuItem>
                  <MenuItem value="SPOT">Spot (Single cargo)</MenuItem>
                </TextField>
              </Grid>
            </Grid>
            <TextField
              label="Payment Method"
              value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as '' | 'T/T' | 'LC' })}
              select
              fullWidth
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              <MenuItem value="T/T">T/T</MenuItem>
              <MenuItem value="LC">LC</MenuItem>
            </TextField>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Start Period"
                  type="date"
                  value={formData.start_period}
                  onChange={(e) => {
                    const newStartPeriod = e.target.value
                    // Auto-detect fiscal start month from start period
                    const startMonth = newStartPeriod ? new Date(newStartPeriod).getMonth() + 1 : ''
                    setFormData({ 
                      ...formData, 
                      start_period: newStartPeriod,
                      fiscal_start_month: formData.fiscal_start_month || startMonth
                    })
                  }}
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="End Period"
                  type="date"
                  value={formData.end_period}
                  onChange={(e) => setFormData({ ...formData, end_period: e.target.value })}
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                {formData.contract_category !== 'SPOT' && (
                  <TextField
                    label="Q1 Starts In"
                    value={formData.fiscal_start_month}
                    onChange={(e) => setFormData({ ...formData, fiscal_start_month: e.target.value ? parseInt(e.target.value) : '' })}
                    select
                    fullWidth
                    helperText="When does Q1 start for this contract?"
                  >
                    <MenuItem value={1}>January</MenuItem>
                    <MenuItem value={2}>February</MenuItem>
                    <MenuItem value={3}>March</MenuItem>
                    <MenuItem value={4}>April</MenuItem>
                    <MenuItem value={5}>May</MenuItem>
                    <MenuItem value={6}>June</MenuItem>
                    <MenuItem value={7}>July</MenuItem>
                    <MenuItem value={8}>August</MenuItem>
                    <MenuItem value={9}>September</MenuItem>
                    <MenuItem value={10}>October</MenuItem>
                    <MenuItem value={11}>November</MenuItem>
                    <MenuItem value={12}>December</MenuItem>
                  </TextField>
                )}
              </Grid>
            </Grid>

            <TextField
              label="Discharge Ranges"
              value={formData.discharge_ranges}
              onChange={(e) => setFormData({ ...formData, discharge_ranges: e.target.value })}
              fullWidth
              multiline
              minRows={5}
              placeholder="Enter discharge ranges (for reference)..."
            />

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Fax Received"
                  value={formData.fax_received}
                  onChange={(e) => setFormData({ ...formData, fax_received: e.target.value as any, fax_received_date: e.target.value === 'yes' ? formData.fax_received_date : '' })}
                  select
                  fullWidth
                >
                  <MenuItem value="">
                    <em>—</em>
                  </MenuItem>
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                {formData.fax_received === 'yes' && (
                  <TextField
                    label="Fax Received Date"
                    type="date"
                    value={formData.fax_received_date}
                    onChange={(e) => setFormData({ ...formData, fax_received_date: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                )}
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Concluded Memo Received"
                  value={formData.concluded_memo_received}
                  onChange={(e) => setFormData({ ...formData, concluded_memo_received: e.target.value as any, concluded_memo_received_date: e.target.value === 'yes' ? formData.concluded_memo_received_date : '' })}
                  select
                  fullWidth
                >
                  <MenuItem value="">
                    <em>—</em>
                  </MenuItem>
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                {formData.concluded_memo_received === 'yes' && (
                  <TextField
                    label="Concluded Memo Received Date"
                    type="date"
                    value={formData.concluded_memo_received_date}
                    onChange={(e) => setFormData({ ...formData, concluded_memo_received_date: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                )}
              </Grid>
            </Grid>
            
            <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Products</Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Add />}
                  onClick={handleAddProduct}
                >
                  Add Product
                </Button>
              </Box>
              
              {formData.products.map((product, index) => (
                <Box 
                  key={index} 
                  sx={{ 
                    p: 2.5, 
                    mb: 2,
                    bgcolor: '#FFFFFF',
                    borderRadius: 2,
                    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Typography variant="subtitle2">Product {index + 1}</Typography>
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveProduct(index)}
                      color="error"
                    >
                      <Delete />
                    </IconButton>
                  </Box>
                  
                  {/* Product Name Selection */}
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} md={numContractYears > 1 ? 12 : 4}>
                      <TextField
                        label="Product Name"
                        value={product.name}
                        onChange={(e) => handleProductChange(index, 'name', e.target.value)}
                        select
                        required
                        fullWidth
                      >
                        {productOptions.map((opt) => (
                          <MenuItem key={opt} value={opt}>
                            {opt}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    
                    {/* Single year contract - show simple quantity inputs */}
                    {numContractYears === 1 && (
                      <>
                        <Grid item xs={12} md={4}>
                          <TextField
                            label="Total Quantity (KT)"
                            type="number"
                            value={product.total_quantity}
                            onChange={(e) => handleProductChange(index, 'total_quantity', parseFloat(e.target.value) || 0)}
                            required
                            fullWidth
                            inputProps={{ min: 0, step: 0.01 }}
                          />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField
                            label="Optional Quantity (KT)"
                            type="number"
                            value={product.optional_quantity || 0}
                            onChange={(e) => handleProductChange(index, 'optional_quantity', parseFloat(e.target.value) || 0)}
                            fullWidth
                            inputProps={{ min: 0, step: 0.01 }}
                          />
                        </Grid>
                      </>
                    )}
                  </Grid>
                  
                  {/* Multi-year contract - show per-year quantity inputs */}
                  {numContractYears > 1 && (
                    <Box sx={{ 
                      p: 2, 
                      bgcolor: '#F8FAFC', 
                      borderRadius: 1, 
                      border: '1px solid #E2E8F0' 
                    }}>
                      <Typography variant="caption" sx={{ 
                        color: '#64748B', 
                        fontWeight: 600, 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.5px',
                        display: 'block',
                        mb: 2
                      }}>
                        Quantities per Year
                      </Typography>
                      
                      <Grid container spacing={2}>
                        {Array.from({ length: numContractYears }, (_, yearIndex) => {
                          const year = yearIndex + 1
                          const calendarYear = getCalendarYear(formData.start_period, year)
                          const yearQty = product.year_quantities?.find(yq => yq.year === year)
                          
                          return (
                            <Grid item xs={12} sm={6} md={4} key={year}>
                              <Box sx={{ 
                                p: 1.5, 
                                bgcolor: '#FFFFFF', 
                                borderRadius: 1,
                                border: '1px solid #E2E8F0'
                              }}>
                                <Typography variant="caption" sx={{ 
                                  color: '#1D4ED8', 
                                  fontWeight: 600,
                                  display: 'block',
                                  mb: 1
                                }}>
                                  Year {year} ({calendarYear})
                                </Typography>
                                <TextField
                                  label="Quantity (KT)"
                                  type="number"
                                  size="small"
                                  value={yearQty?.quantity || 0}
                                  onChange={(e) => handleYearQuantityChange(index, year, 'quantity', parseFloat(e.target.value) || 0)}
                                  fullWidth
                                  inputProps={{ min: 0, step: 0.01 }}
                                  sx={{ mb: 1 }}
                                />
                                <TextField
                                  label="Optional (KT)"
                                  type="number"
                                  size="small"
                                  value={yearQty?.optional_quantity || 0}
                                  onChange={(e) => handleYearQuantityChange(index, year, 'optional_quantity', parseFloat(e.target.value) || 0)}
                                  fullWidth
                                  inputProps={{ min: 0, step: 0.01 }}
                                />
                              </Box>
                            </Grid>
                          )
                        })}
                      </Grid>
                      
                      {/* Total summary */}
                      <Box sx={{ 
                        mt: 2, 
                        pt: 1.5, 
                        borderTop: '1px solid #E2E8F0',
                        display: 'flex',
                        gap: 3
                      }}>
                        <Typography variant="body2" sx={{ color: '#64748B' }}>
                          <strong>Total:</strong> {product.total_quantity.toLocaleString()} KT
                        </Typography>
                        {(product.optional_quantity || 0) > 0 && (
                          <Typography variant="body2" sx={{ color: '#64748B' }}>
                            <strong>Optional:</strong> {(product.optional_quantity || 0).toLocaleString()} KT
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}
                </Box>
              ))}
              
              {formData.products.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No products added. Click "Add Product" to add products to this contract.
                </Typography>
              )}

              {jetA1Selected && (
                <Box sx={{ mt: 1 }}>
                  <TextField
                    label="Additives Required"
                    value={formData.additives_required}
                    onChange={(e) => setFormData({ ...formData, additives_required: e.target.value as any })}
                    select
                    fullWidth
                  >
                    <MenuItem value="">
                      <em>—</em>
                    </MenuItem>
                    <MenuItem value="yes">Yes</MenuItem>
                    <MenuItem value="no">No</MenuItem>
                  </TextField>
                </Box>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.contract_number || !formData.customer_id || formData.products.length === 0}
          >
            {editingContract ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

