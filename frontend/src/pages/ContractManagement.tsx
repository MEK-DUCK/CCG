import { useState, useEffect, useRef } from 'react'
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
  Breadcrumbs,
  Link,
} from '@mui/material'
import { Add, Edit, Delete, Search, Dashboard, ArrowBack } from '@mui/icons-material'
import { contractAPI, customerAPI, quarterlyPlanAPI } from '../api/client'
import type { Contract, Customer, QuarterlyPlan, ContractProduct } from '../types'
import QuarterlyPlanForm from '../components/QuarterlyPlanForm'
import MonthlyPlanForm from '../components/MonthlyPlanForm'

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

const PRODUCT_OPTIONS = ['JET A-1', 'GASOIL', 'GASOIL 10PPM', 'HFO', 'LSFO']

export default function ContractManagement() {
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [quarterlyPlans, setQuarterlyPlans] = useState<QuarterlyPlan[]>([])
  const [open, setOpen] = useState(false)
  const [tabValue, setTabValue] = useState(0)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [editingQuarterlyPlan, setEditingQuarterlyPlan] = useState<QuarterlyPlan | null>(null)
  const [quarterlyPlanDialogOpen, setQuarterlyPlanDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [filterCustomer, setFilterCustomer] = useState<number[]>([])
  const [filterYear, setFilterYear] = useState<number[]>([])
  const [formData, setFormData] = useState({
    customer_id: '',
    contract_number: '',
    contract_type: 'FOB' as 'FOB' | 'CIF',
    payment_method: '' as '' | 'T/T' | 'LC',
    start_period: '',
    end_period: '',
    products: [] as ContractProduct[],  // Array of products with quantities
  })

  const dataLoadInProgress = useRef(false)


  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedContract && selectedContract.id) {
      try {
        loadContractDetails(selectedContract.id)
      } catch (error) {
        console.error('Error in useEffect for selectedContract:', error)
      }
    } else {
      setQuarterlyPlans([])
    }
  }, [selectedContract])

  const loadData = async () => {
    if (dataLoadInProgress.current) {
      console.log('⏸️ Contract data request already running, skipping duplicate call')
      return []
    }
    dataLoadInProgress.current = true
    try {
      // Load contracts and customers in parallel - they're independent
      const [contractsRes, customersRes] = await Promise.all([
        contractAPI.getAll(),
        customerAPI.getAll(),
      ])
      const loadedContracts = contractsRes.data || []
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
    } finally {
      dataLoadInProgress.current = false
    }
  }

  const loadContractDetails = async (contractId: number) => {
    try {
      setQuarterlyPlans([])
      const quarterlyRes = await quarterlyPlanAPI.getAll(contractId)
      const filteredQuarterlyPlans = (quarterlyRes.data || []).filter((p: QuarterlyPlan) => p.contract_id === contractId)
      setQuarterlyPlans(filteredQuarterlyPlans)
      
      // Nothing else needed; selected contract view uses first quarterly plan
    } catch (error) {
      console.error('Error loading contract details:', error)
      setQuarterlyPlans([])
    }
  }

  const handleOpen = (contract?: Contract) => {
    if (contract) {
      setEditingContract(contract)
      setFormData({
        customer_id: contract.customer_id.toString(),
        contract_number: contract.contract_number,
        contract_type: contract.contract_type,
        payment_method: contract.payment_method || '',
        start_period: contract.start_period,
        end_period: contract.end_period,
        products: contract.products || [],
      })
    } else {
      setEditingContract(null)
      setFormData({
        customer_id: '',
        contract_number: '',
        contract_type: 'FOB',
        payment_method: '',
        start_period: '',
        end_period: '',
        products: [],
      })
    }
    setOpen(true)
  }

  const handleAddProduct = () => {
    setFormData({
      ...formData,
      products: [...formData.products, { name: '', total_quantity: 0, optional_quantity: 0 }]
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

  const handleClose = () => {
    setOpen(false)
    setEditingContract(null)
    // Reset form data when closing
    setFormData({
      customer_id: '',
      contract_number: '',
      contract_type: 'FOB',
      payment_method: '' as '' | 'T/T' | 'LC',
      start_period: '',
      end_period: '',
      products: [],
    })
  }

  const handleSubmit = async () => {
    try {
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
        if (!product.name || !PRODUCT_OPTIONS.includes(product.name)) {
          alert(`Invalid product. Must be one of: ${PRODUCT_OPTIONS.join(', ')}`)
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
        payment_method: formData.payment_method || undefined,
        start_period: formData.start_period,
        end_period: formData.end_period,
        products: formData.products.map(p => ({
          name: p.name,
          total_quantity: p.total_quantity,
          optional_quantity: p.optional_quantity || 0
        }))
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

  const handlePlanCreated = async () => {
    if (selectedContract && selectedContract.id) {
      try {
        await loadContractDetails(selectedContract.id)
      } catch (error) {
        console.error('Error reloading contract details after plan creation:', error)
      }
    }
  }

  const handleEditQuarterlyPlan = (plan: QuarterlyPlan) => {
    setEditingQuarterlyPlan(plan)
    setQuarterlyPlanDialogOpen(true)
  }

  const handleCloseQuarterlyPlanDialog = () => {
    setQuarterlyPlanDialogOpen(false)
    setEditingQuarterlyPlan(null)
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
      {selectedContract ? (
        <Box sx={{ mb: 3 }}>
          <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
            <Link
              underline="hover"
              color="inherit"
              onClick={() => setSelectedContract(null)}
              sx={{ cursor: 'pointer' }}
            >
              Contract Management
            </Link>
            <Typography color="text.primary">
              {selectedContract.contract_number || 'Selected Contract'}
            </Typography>
            <Typography color="text.primary">
              {tabValue === 0 ? 'Quarterly Plan' : 'Monthly Plan'}
            </Typography>
          </Breadcrumbs>
        </Box>
      ) : (
        <Typography 
          variant="h4" 
          gutterBottom
          sx={{
            fontWeight: 700,
            color: '#000000',
            mb: 4,
            fontSize: { xs: '1.75rem', md: '2rem' },
            letterSpacing: '-0.02em',
          }}
        >
          Contract Management
        </Typography>
      )}
      
      {!selectedContract && (
        <>
      <Box 
        sx={{ 
          mb: 4, 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          gap: 0.5,
          p: 3,
          bgcolor: '#FFFFFF',
          borderRadius: 3,
          boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
        }}
      >
        <TextField
          size="small"
          placeholder="Search customer name or contract number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <Box sx={{ display: 'flex', alignItems: 'center', mr: 1, color: 'text.secondary' }}>
                <Search fontSize="small" />
              </Box>
            ),
          }}
          sx={{ minWidth: 300, fontSize: '0.875rem' }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
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
                <Checkbox checked={filterCustomer.includes(customer.id)} />
                {customer.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
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
              return `${selected.length} selected`
            }}
          >
            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
              <MenuItem key={year} value={year}>
                <Checkbox checked={filterYear.includes(year)} />
                {year}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          sx={{
            borderRadius: 2.5,
          }}
          startIcon={<Add />}
          onClick={() => handleOpen()}
          disabled={false}
        >
          Add Contract
        </Button>
      </Box>

      {customers.length === 0 && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Please create a customer first before adding contracts.
        </Typography>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box
            sx={{
              bgcolor: '#FFFFFF',
              borderRadius: 3,
              boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
              overflow: 'hidden',
            }}
          >
            <TableContainer>
              <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Contract Number</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Payment Method</TableCell>
                  <TableCell>Products</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contracts.filter((contract) => {
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
                }).map((contract) => (
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
                        setTabValue(0)
                      } catch (error: any) {
                        console.error('ERROR selecting contract:', error)
                        console.error('Error stack:', error?.stack)
                        alert(`Error selecting contract: ${error?.message || 'Unknown error'}`)
                      }
                    }}
                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <TableCell>{contract.contract_number}</TableCell>
                    <TableCell>{getCustomerName(contract.customer_id)}</TableCell>
                    <TableCell>
                      <Chip
                        label={contract.contract_type}
                        color={contract.contract_type === 'FOB' ? 'primary' : 'secondary'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {contract.payment_method ? (
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
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {contract.products && Array.isArray(contract.products) && contract.products.length > 0
                        ? contract.products.map((p: any) => (typeof p === 'object' ? p.name : p)).join(', ')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {new Date(contract.start_period).toLocaleDateString()} - {new Date(contract.end_period).toLocaleDateString()}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/contracts/${contract.id}/dashboard`)}
                        color="primary"
                        title="View Dashboard"
                      >
                        <Dashboard />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleOpen(contract)}
                        color="primary"
                        title="Edit Contract"
                      >
                        <Edit />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(contract.id)}
                        color="error"
                        title="Delete Contract"
                      >
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Grid>

      </Grid>

        </>
      )}

      {selectedContract && selectedContract.id && (
        <>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => setSelectedContract(null)}
            sx={{ mb: 2 }}
          >
            Back to Contracts
          </Button>
          <Box 
            sx={{ 
              minHeight: '400px',
              bgcolor: '#FFFFFF',
              borderRadius: 3,
              boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: 3, borderBottom: '1px solid rgba(0, 0, 0, 0.05)', bgcolor: '#F2F2F7' }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  Contract: {selectedContract?.contract_number || 'N/A'}
                {selectedContract?.contract_type && (
                  <Chip
                    label={selectedContract.contract_type}
                    color={selectedContract.contract_type === 'FOB' ? 'primary' : 'secondary'}
                    size="small"
                  />
                )}
                {selectedContract?.payment_method && (
                  <Chip
                    label={selectedContract.payment_method}
                    color={selectedContract.payment_method === 'T/T' ? 'success' : undefined}
                    sx={selectedContract.payment_method === 'LC' ? {
                      backgroundColor: '#9c27b0',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: '#7b1fa2',
                      }
                    } : {}}
                    size="small"
                  />
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Customer: {selectedContract?.customer_id ? getCustomerName(selectedContract.customer_id) : 'N/A'} | Products: {selectedContract?.products && Array.isArray(selectedContract.products) ? selectedContract.products.map((p: any) => (p && typeof p === 'object' ? (p.name || 'N/A') : p)).join(', ') : '-'}
              </Typography>
            </Box>
            <Tabs value={tabValue} onChange={(_, v) => {
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
                  {quarterlyPlans && quarterlyPlans.length === 0 ? (
                    (() => {
                      try {
                        return (
                          <QuarterlyPlanForm
                            contractId={selectedContract.id}
                            contract={selectedContract}
                            onPlanCreated={handlePlanCreated}
                          />
                        )
                      } catch (error: any) {
                        console.error('Error rendering QuarterlyPlanForm:', error)
                        return (
                          <Box sx={{ p: 2 }}>
                            <Typography color="error" variant="h6">Error Loading Form</Typography>
                            <Typography color="error">{error?.message || 'Unknown error'}</Typography>
                            <Typography variant="body2" sx={{ mt: 2 }}>
                              Contract ID: {selectedContract.id}
                            </Typography>
                          </Box>
                        )
                      }
                    })()
                  ) : (
                    <Box sx={{ p: 2 }}>
                      <Typography color="text.secondary" variant="body1">
                        A quarterly plan already exists for this contract. You can edit it using the edit button below.
                      </Typography>
                    </Box>
                  )}
                  {quarterlyPlanDialogOpen && editingQuarterlyPlan && (
                    <Dialog open={quarterlyPlanDialogOpen} onClose={handleCloseQuarterlyPlanDialog} maxWidth="sm" fullWidth>
                      <DialogTitle>Edit Quarterly Plan</DialogTitle>
                      <DialogContent>
                        <QuarterlyPlanForm
                          contractId={selectedContract.id}
                          contract={selectedContract}
                          editingPlan={editingQuarterlyPlan}
                          onPlanCreated={handlePlanCreated}
                          onCancel={handleCloseQuarterlyPlanDialog}
                        />
                      </DialogContent>
                    </Dialog>
                  )}
                </Box>
              ) : (
                <Typography color="text.secondary">Please select a contract first</Typography>
              )}
              {quarterlyPlans && quarterlyPlans.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  {selectedContract && selectedContract.products && Array.isArray(selectedContract.products) && selectedContract.products.length > 0 && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'info.light', borderRadius: 1 }}>
                      <Typography variant="body2" fontWeight="bold" gutterBottom sx={{ color: '#000000' }}>Contract Quantities:</Typography>
                      {selectedContract.products.map((p: any, idx: number) => (
                        <Typography key={idx} variant="body2" sx={{ color: '#000000' }}>
                          {p?.name || 'Unknown'}: {(p?.total_quantity || 0).toLocaleString()} KT total
                        </Typography>
                      ))}
                      <Typography variant="body2" sx={{ mt: 1, fontWeight: 'bold', color: '#000000' }}>
                        Total: {selectedContract.products.reduce((sum: number, p: any) => sum + (p?.total_quantity || 0), 0).toLocaleString()} KT
                      </Typography>
                    </Box>
                  )}
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Quarterly Plan:
                  </Typography>
                  {quarterlyPlans.map((plan) => {
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
                    
                    const getQuarterLabel = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): string => {
                      const labels: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', string> = {
                        Q1: 'Jan-Mar',
                        Q2: 'Apr-Jun',
                        Q3: 'Jul-Sep',
                        Q4: 'Oct-Dec',
                      }
                      return labels[quarter]
                    }
                    
                    const getQuarterQuantity = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): number => {
                      const dbQuantities = [
                        plan.q1_quantity || 0,
                        plan.q2_quantity || 0,
                        plan.q3_quantity || 0,
                        plan.q4_quantity || 0,
                      ]
                      const quarterIndex = quarterOrder.indexOf(quarter)
                      return dbQuantities[quarterIndex] || 0
                    }
                    
                    const startMonth = selectedContract?.start_period 
                      ? new Date(selectedContract.start_period).getMonth() + 1 
                      : 1
                    const quarterOrder = getQuarterOrder(startMonth)
                    
                    return (
                      <Box 
                        key={plan.id} 
                        sx={{ 
                          p: 2.5, 
                          mt: 2,
                          bgcolor: '#FFFFFF',
                          borderRadius: 2,
                          boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.05)',
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Box sx={{ flex: 1 }}>
                            {quarterOrder.map((quarter, index) => (
                              <Typography key={quarter} variant="body1" sx={{ mb: 1 }}>
                                <strong>{quarter} ({getQuarterLabel(quarter)}) - Contract Quarter {index + 1}:</strong> {getQuarterQuantity(quarter).toLocaleString()} KT
                              </Typography>
                            ))}
                            {(() => {
                              const quarterlyTotal = (plan.q1_quantity || 0) + (plan.q2_quantity || 0) + (plan.q3_quantity || 0) + (plan.q4_quantity || 0)
                              const contractTotal = selectedContract && selectedContract.products && Array.isArray(selectedContract.products)
                                ? selectedContract.products.reduce((sum: number, p: any) => sum + (p?.total_quantity || 0), 0)
                                : 0
                              
                              return (
                                <>
                                  <Typography variant="body1" sx={{ mt: 2, fontWeight: 'bold', borderTop: '1px solid', borderColor: 'divider', pt: 1, color: '#000000' }}>
                                    Total: {quarterlyTotal.toLocaleString()} KT
                                  </Typography>
                                  <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic', color: '#000000' }}>
                                    Note: Quarterly plan total (Q1+Q2+Q3+Q4) must equal the contract total ({contractTotal.toLocaleString()} KT)
                                  </Typography>
                                </>
                              )
                            })()}
                          </Box>
                          <IconButton
                            size="small"
                            onClick={() => handleEditQuarterlyPlan(plan)}
                            color="primary"
                            sx={{ ml: 2 }}
                          >
                            <Edit />
                          </IconButton>
                        </Box>
                      </Box>
                    )
                  })}
                </Box>
              )}
            </TabPanel>
            <TabPanel value={tabValue} index={1}>
              {quarterlyPlans && quarterlyPlans.length > 0 ? (
                <Box sx={{ p: 2 }}>
                  <MonthlyPlanForm
                    quarterlyPlanId={quarterlyPlans[0].id}
                    quarterlyPlan={quarterlyPlans[0]}
                    onPlanCreated={handlePlanCreated}
                  />
                </Box>
              ) : (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  Please create a quarterly plan first
                </Typography>
              )}
            </TabPanel>
          </Box>
        </>
      )}

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
              <Grid item xs={12} md={6}>
                <TextField
                  label="Start Period"
                  type="date"
                  value={formData.start_period}
                  onChange={(e) => setFormData({ ...formData, start_period: e.target.value })}
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
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
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Product Name"
                        value={product.name}
                        onChange={(e) => handleProductChange(index, 'name', e.target.value)}
                        select
                        required
                        fullWidth
                      >
                        {PRODUCT_OPTIONS.map((opt) => (
                          <MenuItem key={opt} value={opt}>
                            {opt}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
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
                  </Grid>
                </Box>
              ))}
              
              {formData.products.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No products added. Click "Add Product" to add products to this contract.
                </Typography>
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

