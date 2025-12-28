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
      alert('Error loading contract data')
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

  const getTotalPlannedQuantity = () => {
    return monthlyPlans.reduce((sum, plan) => sum + (plan.month_quantity || 0), 0)
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
  const totalPlanned = getTotalPlannedQuantity()
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
                color={contract.contract_type === 'FOB' ? 'primary' : 'secondary'}
                size="small"
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

      {/* Progress Metrics */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Total Planned Quantity
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {totalPlanned.toLocaleString()} KT
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Total Cargo Quantity
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {totalCargo.toLocaleString()} KT
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Completion Rate
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {totalPlanned > 0 ? ((totalCargo / totalPlanned) * 100).toFixed(1) : 0}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Remaining Quantities */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Remaining Quantities
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 3, bgcolor: 'background.default', textAlign: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Firm Total
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {firmTotal.toLocaleString()} KT
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 3, bgcolor: 'background.default', textAlign: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Optional Total
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {optionalTotal.toLocaleString()} KT
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 3, bgcolor: 'background.default', textAlign: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Lifted (Cargos)
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, color: 'success.main' }}>
                  {totalCargo.toLocaleString()} KT
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 3, bgcolor: 'background.default', textAlign: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
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
                  Remaining incl. optional: {remainingWithOptional.toLocaleString()} KT
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Status Breakdown */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Cargo Status Breakdown
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={6} sm={3}>
              <Box textAlign="center">
                <Typography variant="h4" color="primary">
                  {statusCounts['Planned'] || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Planned
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Box textAlign="center">
                <Typography variant="h4" color="warning.main">
                  {statusCounts['Pending Nomination'] || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Pending
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Box textAlign="center">
                <Typography variant="h4" color="success.main">
                  {statusCounts['Completed Loading'] || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Completed Loading
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Contract Progress */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Contract Progress
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, bgcolor: 'background.default', textAlign: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Total Planned Quantity
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {contractProgress.totalPlanned.toLocaleString()} KT
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, bgcolor: 'background.default', textAlign: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Monthly Plans Quantity
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600, color: 'info.main' }}>
                  {contractProgress.totalActual.toLocaleString()} KT
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {contractProgress.monthlyPlanRate.toFixed(1)}% of planned
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, bgcolor: 'background.default', textAlign: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Total Cargo Quantity
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600, color: 'success.main' }}>
                  {contractProgress.totalCargo.toLocaleString()} KT
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {contractProgress.completionRate.toFixed(1)}% of planned
                </Typography>
              </Paper>
            </Grid>
          </Grid>
          {/* Progress Bar */}
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Overall Progress
              </Typography>
              <Typography variant="body2" fontWeight="bold">
                {contractProgress.completionRate.toFixed(1)}%
              </Typography>
            </Box>
            <Box
              sx={{
                width: '100%',
                height: 24,
                bgcolor: 'grey.200',
                borderRadius: 12,
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
                  borderRadius: 12,
                }}
              />
            </Box>
          </Box>
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
          <TableContainer>
            <Table size={isMobile ? 'small' : 'medium'}>
              <TableHead>
                <TableRow>
                  <TableCell>Vessel Name</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Laycan</TableCell>
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
          <TableContainer>
            <Table size={isMobile ? 'small' : 'medium'}>
              <TableHead>
                <TableRow>
                  <TableCell>Month/Year</TableCell>
                  <TableCell>Planned Quantity</TableCell>
                  <TableCell>Cargos</TableCell>
                  <TableCell>Laycan</TableCell>
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
          <TableContainer>
            <Table size={isMobile ? 'small' : 'medium'}>
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Year</TableCell>
                  <TableCell>Q1</TableCell>
                  <TableCell>Q2</TableCell>
                  <TableCell>Q3</TableCell>
                  <TableCell>Q4</TableCell>
                  <TableCell>Total</TableCell>
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

