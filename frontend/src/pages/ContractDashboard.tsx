import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Button,
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { ArrowBack } from '@mui/icons-material'
import { contractAPI, cargoAPI, quarterlyPlanAPI, monthlyPlanAPI, customerAPI } from '../api/client'
import type { Contract, Cargo, QuarterlyPlan, MonthlyPlan, Customer, CargoStatus } from '../types'
import { getContractTypeColor } from '../utils/chipColors'
import { useToast } from '../contexts/ToastContext'
import { useResizableColumns, ColumnConfig } from '../hooks/useResizableColumns'
import ResizableTableCell from '../components/ResizableTableCell'

// Column configurations for tables
const CARGOS_COLUMNS: ColumnConfig[] = [
  { id: 'vessel', label: 'Vessel Name', defaultWidth: 150, minWidth: 120 },
  { id: 'product', label: 'Product', defaultWidth: 120, minWidth: 100 },
  { id: 'quantity', label: 'Quantity', defaultWidth: 100, minWidth: 80 },
  { id: 'status', label: 'Status', defaultWidth: 140, minWidth: 100 },
  { id: 'laycan', label: 'Laycan', defaultWidth: 140, minWidth: 100 },
]

const MONTHLY_PLANS_COLUMNS: ColumnConfig[] = [
  { id: 'monthYear', label: 'Month/Year', defaultWidth: 140, minWidth: 100 },
  { id: 'quantity', label: 'Planned Quantity', defaultWidth: 140, minWidth: 100 },
  { id: 'cargos', label: 'Cargos', defaultWidth: 100, minWidth: 80 },
  { id: 'laycan', label: 'Laycan', defaultWidth: 150, minWidth: 100 },
]

const QUARTERLY_PLANS_COLUMNS: ColumnConfig[] = [
  { id: 'product', label: 'Product', defaultWidth: 140, minWidth: 100 },
  { id: 'year', label: 'Year', defaultWidth: 80, minWidth: 60 },
  { id: 'q1', label: 'Q1', defaultWidth: 100, minWidth: 70 },
  { id: 'q2', label: 'Q2', defaultWidth: 100, minWidth: 70 },
  { id: 'q3', label: 'Q3', defaultWidth: 100, minWidth: 70 },
  { id: 'q4', label: 'Q4', defaultWidth: 100, minWidth: 70 },
  { id: 'total', label: 'Total', defaultWidth: 120, minWidth: 80 },
]

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
      id={`dashboard-tabpanel-${index}`}
      aria-labelledby={`dashboard-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  )
}

export default function ContractDashboard() {
  const { contractId } = useParams<{ contractId: string }>()
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const { showError } = useToast()

  // Resizable columns
  const cargosCols = useResizableColumns('contract-dashboard-cargos', CARGOS_COLUMNS)
  const monthlyPlansCols = useResizableColumns('contract-dashboard-monthly', MONTHLY_PLANS_COLUMNS)
  const quarterlyPlansCols = useResizableColumns('contract-dashboard-quarterly', QUARTERLY_PLANS_COLUMNS)

  const [contract, setContract] = useState<Contract | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [cargos, setCargos] = useState<Cargo[]>([])
  const [quarterlyPlans, setQuarterlyPlans] = useState<QuarterlyPlan[]>([])
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [tabValue, setTabValue] = useState(0)

  useEffect(() => {
    if (contractId) {
      loadContractData(parseInt(contractId))
    }
  }, [contractId])

  const loadContractData = async (id: number) => {
    try {
      setLoading(true)
      
      // Load contract
      const contractRes = await contractAPI.getById(id)
      const contractData = contractRes.data
      setContract(contractData)

      // Load customer
      if (contractData.customer_id) {
        const customerRes = await customerAPI.getById(contractData.customer_id)
        setCustomer(customerRes.data)
      }

      // Load cargos for this contract
      const cargosRes = await cargoAPI.getAll({ contract_id: id })
      setCargos(cargosRes.data || [])

      // Load quarterly plans
      const quarterlyRes = await quarterlyPlanAPI.getAll(id)
      const quarterlyData = quarterlyRes.data || []
      setQuarterlyPlans(quarterlyData)

      // Load monthly plans for all quarterly plans
      if (quarterlyData.length > 0) {
        const quarterlyPlanIds = quarterlyData.map((p: QuarterlyPlan) => p.id)
        const monthlyPromises = quarterlyPlanIds.map((qId: number) => monthlyPlanAPI.getAll(qId))
        const monthlyResults = await Promise.all(monthlyPromises)
        const allMonthlyPlans = monthlyResults.flatMap((res: any) => res.data || [])
        setMonthlyPlans(allMonthlyPlans)
      }
    } catch (error) {
      console.error('Error loading contract data:', error)
      showError('Error loading contract data')
    } finally {
      setLoading(false)
    }
  }

  const getStatusCounts = () => {
    const counts: Partial<Record<CargoStatus, number>> = {
      'Planned': 0,
      'Pending Nomination': 0,
      'Completed Loading': 0,
      'Loading': 0,
    }
    cargos.forEach(cargo => {
      if (cargo.status in counts) {
        counts[cargo.status as CargoStatus] = (counts[cargo.status as CargoStatus] || 0) + 1
      }
    })
    return counts
  }

  const getTotalCargoQuantity = () => {
    return cargos.reduce((sum, cargo) => sum + (cargo.cargo_quantity || 0), 0)
  }

  const getContractProgress = () => {
    // Calculate total planned from all quarterly plans
    const totalPlanned = quarterlyPlans.reduce((sum, qp) => {
      return sum + (qp.q1_quantity || 0) + (qp.q2_quantity || 0) + (qp.q3_quantity || 0) + (qp.q4_quantity || 0)
    }, 0)

    // Calculate total actual from all monthly plans
    const totalActual = monthlyPlans.reduce((sum, mp) => sum + (mp.month_quantity || 0), 0)

    // Calculate total cargo quantity
    const totalCargo = cargos.reduce((sum, cargo) => sum + (cargo.cargo_quantity || 0), 0)

    return {
      totalPlanned,
      totalActual,
      totalCargo,
      completionRate: totalPlanned > 0 ? (totalCargo / totalPlanned) * 100 : 0,
      monthlyPlanRate: totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    )
  }

  if (!contract) {
    return (
      <Box p={3}>
        <Typography variant="h6">Contract not found</Typography>
        <Button onClick={() => navigate('/dashboard')} sx={{ mt: 2 }}>
          Back to Dashboard
        </Button>
      </Box>
    )
  }

  const statusCounts = getStatusCounts()
  const totalCargo = getTotalCargoQuantity()
  const contractProgress = getContractProgress()

  const firmTotal = (contract.products || []).reduce((sum: number, p: any) => {
    return sum + (Number(p?.total_quantity) || 0)
  }, 0)

  const optionalTotal = (contract.products || []).reduce((sum: number, p: any) => {
    return sum + (Number(p?.optional_quantity) || 0)
  }, 0)

  const remainingFirm = firmTotal - totalCargo
  const remainingWithOptional = (firmTotal + optionalTotal) - totalCargo

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/dashboard')}
          variant="outlined"
        >
          Back
        </Button>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {contract.contract_number}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {customer?.name || 'Unknown Customer'}
          </Typography>
          {contract.discharge_ranges && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}
            >
              Discharge Ranges: {contract.discharge_ranges}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Contract Overview Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Contract Type
              </Typography>
              <Chip
                label={contract.contract_type}
                size="small"
                sx={getContractTypeColor(contract.contract_type)}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Payment Method
              </Typography>
              <Typography variant="h6">
                {contract.payment_method || 'N/A'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Period
              </Typography>
              <Typography variant="body1">
                {contract.start_period} - {contract.end_period}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Products
              </Typography>
              <Typography variant="body1">
                {contract.products && contract.products.length > 0
                  ? contract.products.map((p: any) => p.name || 'Unknown').join(', ')
                  : 'No products'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Consolidated Contract Summary */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
            Contract Summary
          </Typography>
          
          {/* Key Metrics Row */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Planned
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {contractProgress.totalPlanned.toLocaleString()} KT
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Quarterly Plans
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Monthly Plans
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, color: 'info.main' }}>
                  {contractProgress.totalActual.toLocaleString()} KT
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {contractProgress.monthlyPlanRate.toFixed(1)}% of planned
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Lifted (Cargos)
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, color: 'success.main' }}>
                  {totalCargo.toLocaleString()} KT
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {contractProgress.completionRate.toFixed(1)}% of planned
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Remaining (Firm)
                </Typography>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 600,
                    color: remainingFirm < 0 ? 'error.main' : 'primary.main',
                  }}
                >
                  {remainingFirm.toLocaleString()} KT
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  With optional: {remainingWithOptional.toLocaleString()} KT
                </Typography>
              </Box>
            </Grid>
          </Grid>

          {/* Progress Bar */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Overall Completion
              </Typography>
              <Typography variant="body2" fontWeight="bold">
                {contractProgress.completionRate.toFixed(1)}%
              </Typography>
            </Box>
            <Box
              sx={{
                width: '100%',
                height: 28,
                bgcolor: 'grey.200',
                borderRadius: 14,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <Box
                sx={{
                  width: `${Math.min(contractProgress.completionRate, 100)}%`,
                  height: '100%',
                  bgcolor: contractProgress.completionRate >= 100 ? 'success.main' : 'primary.main',
                  transition: 'width 0.3s ease',
                  borderRadius: 14,
                }}
              />
            </Box>
          </Box>

          {/* Contract Quantities & Status Row */}
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Contract Quantities
                </Typography>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Firm Total
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {firmTotal.toLocaleString()} KT
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Optional Total
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {optionalTotal.toLocaleString()} KT
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Cargo Status
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                  <Chip
                    label={`${statusCounts['Planned'] || 0} Planned`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    label={`${statusCounts['Pending Nomination'] || 0} Pending`}
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                  <Chip
                    label={`${statusCounts['Loading'] || 0} Loading`}
                    size="small"
                    color="info"
                    variant="outlined"
                  />
                  <Chip
                    label={`${statusCounts['Completed Loading'] || 0} Completed`}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabs for detailed views */}
      <Paper sx={{ mt: 3 }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label="All Cargos" />
          <Tab label="Monthly Plans" />
          <Tab label="Quarterly Plans" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <Table size={isMobile ? 'small' : 'medium'} sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow>
                  <ResizableTableCell columnId="vessel" width={cargosCols.columnWidths['vessel']} minWidth={120} onResizeStart={cargosCols.handleResizeStart}>Vessel Name</ResizableTableCell>
                  <ResizableTableCell columnId="product" width={cargosCols.columnWidths['product']} minWidth={100} onResizeStart={cargosCols.handleResizeStart}>Product</ResizableTableCell>
                  <ResizableTableCell columnId="quantity" width={cargosCols.columnWidths['quantity']} minWidth={80} onResizeStart={cargosCols.handleResizeStart}>Quantity</ResizableTableCell>
                  <ResizableTableCell columnId="status" width={cargosCols.columnWidths['status']} minWidth={100} onResizeStart={cargosCols.handleResizeStart}>Status</ResizableTableCell>
                  <ResizableTableCell columnId="laycan" width={cargosCols.columnWidths['laycan']} minWidth={100} onResizeStart={cargosCols.handleResizeStart}>Laycan</ResizableTableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cargos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No cargos found
                    </TableCell>
                  </TableRow>
                ) : (
                  cargos.map((cargo) => (
                    <TableRow key={cargo.id} hover>
                      <TableCell>{cargo.vessel_name}</TableCell>
                      <TableCell>{cargo.product_name}</TableCell>
                      <TableCell>{cargo.cargo_quantity} KT</TableCell>
                      <TableCell>
                        <Chip
                          label={cargo.status}
                          size="small"
                          color={
                            cargo.status === 'Completed Loading'
                              ? 'success'
                              : cargo.status === 'Pending Nomination'
                              ? 'warning'
                              : cargo.status === 'Loading'
                              ? 'primary'
                              : 'default'
                          }
                        />
                      </TableCell>
                      <TableCell>{cargo.laycan_window || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <Table size={isMobile ? 'small' : 'medium'} sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow>
                  <ResizableTableCell columnId="monthYear" width={monthlyPlansCols.columnWidths['monthYear']} minWidth={100} onResizeStart={monthlyPlansCols.handleResizeStart}>Month/Year</ResizableTableCell>
                  <ResizableTableCell columnId="quantity" width={monthlyPlansCols.columnWidths['quantity']} minWidth={100} onResizeStart={monthlyPlansCols.handleResizeStart}>Planned Quantity</ResizableTableCell>
                  <ResizableTableCell columnId="cargos" width={monthlyPlansCols.columnWidths['cargos']} minWidth={80} onResizeStart={monthlyPlansCols.handleResizeStart}>Cargos</ResizableTableCell>
                  <ResizableTableCell columnId="laycan" width={monthlyPlansCols.columnWidths['laycan']} minWidth={100} onResizeStart={monthlyPlansCols.handleResizeStart}>Laycan</ResizableTableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(() => {
                  // Group monthly plans by month/year
                  const groupedByMonth = new Map<string, { plans: MonthlyPlan[], cargos: Cargo[] }>()
                  
                  monthlyPlans.forEach(plan => {
                    const key = `${plan.year}-${plan.month}`
                    if (!groupedByMonth.has(key)) {
                      groupedByMonth.set(key, { plans: [], cargos: [] })
                    }
                    groupedByMonth.get(key)!.plans.push(plan)
                  })

                  // Add cargos to their respective months
                  cargos.forEach(cargo => {
                    const plan = monthlyPlans.find(p => p.id === cargo.monthly_plan_id)
                    if (plan) {
                      const key = `${plan.year}-${plan.month}`
                      const group = groupedByMonth.get(key)
                      if (group) {
                        group.cargos.push(cargo)
                      }
                    }
                  })

                  const sortedGroups = Array.from(groupedByMonth.entries()).sort(([keyA], [keyB]) => {
                    const [yearA, monthA] = keyA.split('-').map(Number)
                    const [yearB, monthB] = keyB.split('-').map(Number)
                    if (yearA !== yearB) return yearA - yearB
                    return monthA - monthB
                  })

                  if (sortedGroups.length === 0) {
                    return (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          No monthly plans found
                        </TableCell>
                      </TableRow>
                    )
                  }

                  return sortedGroups.map(([key, { plans, cargos: monthCargos }]) => {
                    const [year, month] = key.split('-').map(Number)
                    const totalPlanned = plans.reduce((sum, p) => sum + (p.month_quantity || 0), 0)
                    const totalCargo = monthCargos.reduce((sum, c) => sum + (c.cargo_quantity || 0), 0)
                    const laycans = plans
                      .map(p => p.laycan_5_days || p.laycan_2_days)
                      .filter(Boolean)
                      .join(', ') || '-'

                    return (
                      <TableRow key={key} hover>
                        <TableCell>
                          <Typography variant="body1" fontWeight={500}>
                            {new Date(year, month - 1).toLocaleString('default', {
                              month: 'long',
                              year: 'numeric',
                            })}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body1">
                            {totalPlanned.toLocaleString()} KT
                          </Typography>
                          {monthCargos.length > 0 && (
                            <Typography variant="caption" color="text.secondary">
                              ({totalCargo.toLocaleString()} KT in cargos)
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {monthCargos.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">No cargos</Typography>
                          ) : (
                            <Box>
                              {monthCargos.map((cargo, idx) => (
                                <Box key={cargo.id} sx={{ mb: idx < monthCargos.length - 1 ? 1 : 0 }}>
                                  <Typography variant="body2">
                                    {cargo.vessel_name} - {cargo.cargo_quantity} KT
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {cargo.product_name} • {cargo.status}
                                  </Typography>
                                </Box>
                              ))}
                            </Box>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{laycans}</Typography>
                        </TableCell>
                      </TableRow>
                    )
                  })
                })()}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <Table size={isMobile ? 'small' : 'medium'} sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow>
                  <ResizableTableCell columnId="product" width={quarterlyPlansCols.columnWidths['product']} minWidth={100} onResizeStart={quarterlyPlansCols.handleResizeStart}>Product</ResizableTableCell>
                  <ResizableTableCell columnId="year" width={quarterlyPlansCols.columnWidths['year']} minWidth={60} onResizeStart={quarterlyPlansCols.handleResizeStart}>Year</ResizableTableCell>
                  <ResizableTableCell columnId="q1" width={quarterlyPlansCols.columnWidths['q1']} minWidth={70} onResizeStart={quarterlyPlansCols.handleResizeStart}>Q1</ResizableTableCell>
                  <ResizableTableCell columnId="q2" width={quarterlyPlansCols.columnWidths['q2']} minWidth={70} onResizeStart={quarterlyPlansCols.handleResizeStart}>Q2</ResizableTableCell>
                  <ResizableTableCell columnId="q3" width={quarterlyPlansCols.columnWidths['q3']} minWidth={70} onResizeStart={quarterlyPlansCols.handleResizeStart}>Q3</ResizableTableCell>
                  <ResizableTableCell columnId="q4" width={quarterlyPlansCols.columnWidths['q4']} minWidth={70} onResizeStart={quarterlyPlansCols.handleResizeStart}>Q4</ResizableTableCell>
                  <ResizableTableCell columnId="total" width={quarterlyPlansCols.columnWidths['total']} minWidth={80} onResizeStart={quarterlyPlansCols.handleResizeStart}>Total</ResizableTableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quarterlyPlans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      No quarterly plans found
                    </TableCell>
                  </TableRow>
                ) : (
                  quarterlyPlans
                    .map((plan) => {
                      // Get year from monthly plans if available
                      const relatedMonthlyPlans = monthlyPlans.filter(mp => mp.quarterly_plan_id === plan.id)
                      const year = relatedMonthlyPlans.length > 0 ? relatedMonthlyPlans[0].year : 'N/A'
                      return { plan, year }
                    })
                    .sort((a, b) => {
                      // Sort by product name first, then by year
                      const productA = a.plan.product_name || ''
                      const productB = b.plan.product_name || ''
                      if (productA !== productB) return productA.localeCompare(productB)
                      if (typeof a.year === 'number' && typeof b.year === 'number') {
                        return a.year - b.year
                      }
                      return 0
                    })
                    .map(({ plan, year }) => (
                      <TableRow key={plan.id} hover>
                        <TableCell>
                          {plan.product_name ? (
                            <Chip label={plan.product_name} size="small" color="info" />
                          ) : (
                            <Typography variant="body2" color="text.secondary">All Products</Typography>
                          )}
                        </TableCell>
                        <TableCell>{year !== 'N/A' ? year : '-'}</TableCell>
                        <TableCell>{plan.q1_quantity || 0} KT</TableCell>
                        <TableCell>{plan.q2_quantity || 0} KT</TableCell>
                        <TableCell>{plan.q3_quantity || 0} KT</TableCell>
                        <TableCell>{plan.q4_quantity || 0} KT</TableCell>
                        <TableCell>
                          <strong>
                            {(plan.q1_quantity || 0) +
                              (plan.q2_quantity || 0) +
                              (plan.q3_quantity || 0) +
                              (plan.q4_quantity || 0)}{' '}
                            KT
                          </strong>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>
      </Paper>
    </Box>
  )
}

