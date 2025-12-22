import { useMemo, useState, useEffect } from 'react'
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
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Card,
  CardContent,
  Button,
} from '@mui/material'
import { format } from 'date-fns'
import { Refresh } from '@mui/icons-material'
import { auditLogAPI, contractAPI } from '../api/client'
import type {
  PlanAuditLog,
  MonthlyPlanAuditLog,
  QuarterlyPlanAuditLog,
  WeeklyQuantityComparisonResponse,
  Contract,
  ContractProduct,
} from '../types'

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function ReconciliationPage() {
  const PRODUCT_FILTERS = ['GASOIL', 'JET A-1', 'FUEL OIL'] as const
  const [logs, setLogs] = useState<PlanAuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedAction, setSelectedAction] = useState<string>('')

  // Weekly quantity comparison (Sun–Thu)
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [weeklyData, setWeeklyData] = useState<WeeklyQuantityComparisonResponse | null>(null)
  const [weeklyError, setWeeklyError] = useState<string | null>(null)
  const [weeklyProduct, setWeeklyProduct] = useState<string>('') // '' = all
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear, selectedAction])

  useEffect(() => {
    // Load contracts once so weekly recon can filter by product category
    contractAPI
      .getAll()
      .then((res) => setContracts(Array.isArray(res.data) ? (res.data as Contract[]) : []))
      .catch((e) => {
        console.error('Error loading contracts (weekly product filter):', e)
        setContracts([])
      })
  }, [])

  useEffect(() => {
    loadWeeklyComparison()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear])

  // Auto-refresh when window gains focus (user switches back to tab)
  useEffect(() => {
    const handleFocus = () => {
      console.log('Window focused, refreshing logs...')
      loadLogs()
      loadWeeklyComparison()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadLogs = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (selectedMonth) params.month = selectedMonth
      if (selectedYear) params.year = selectedYear
      if (selectedAction) params.action = selectedAction
      
      console.log('Loading reconciliation logs with params:', params)
      const response = await auditLogAPI.getReconciliationLogs(params)
      console.log('Full response:', response)
      console.log('Response data:', response.data)
      
      // Handle both direct array response and wrapped response
      const logsData = Array.isArray(response.data) ? response.data : (Array.isArray(response) ? response : [])
      console.log('Processed logs:', logsData.length, 'items')
      console.log('Sample log:', logsData[0])
      
      setLogs(logsData)
    } catch (error) {
      console.error('Error loading reconciliation logs:', error)
      console.error('Error details:', error)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  const loadWeeklyComparison = async () => {
    setWeeklyLoading(true)
    setWeeklyError(null)
    try {
      const params: any = {}
      if (selectedYear) params.year = selectedYear
      const res = await auditLogAPI.getWeeklyQuantityComparison(params)
      setWeeklyData(res.data as WeeklyQuantityComparisonResponse)
    } catch (e) {
      console.error('Error loading weekly quantity comparison:', e)
      setWeeklyData(null)
      const anyErr: any = e
      const detail = anyErr?.response?.data?.detail
      setWeeklyError(typeof detail === 'string' ? detail : (anyErr?.message ? String(anyErr.message) : 'Failed to load comparison data'))
    } finally {
      setWeeklyLoading(false)
    }
  }

  const fmtQty = (qty: number) => {
    // Quantities are treated as KT across the app (match Lifting Plan display).
    if (Math.abs(qty - Math.round(qty)) < 1e-9) return `${Math.round(qty).toLocaleString()} KT`
    return `${qty.toLocaleString(undefined, { maximumFractionDigits: 1 })} KT`
  }

  const normalizeProductCategory = (raw: unknown): (typeof PRODUCT_FILTERS)[number] | null => {
    if (typeof raw !== 'string') return null
    const v = raw.trim()
    if (!v) return null
    const u = v.toUpperCase()
    if (u === 'GASOIL' || u === 'GASOIL 10PPM') return 'GASOIL'
    if (u === 'HFO' || u === 'LSFO') return 'FUEL OIL'
    if (u === 'JET A-1' || u === 'JET A1') return 'JET A-1'
    return null
  }

  const contractIdToCategories = useMemo(() => {
    const map = new Map<number, Set<string>>()
    contracts.forEach((c) => {
      const cats = new Set<string>()
      if (Array.isArray(c.products)) {
        c.products.forEach((p: ContractProduct) => {
          const cat = normalizeProductCategory(p?.name)
          if (cat) cats.add(cat)
        })
      }
      map.set(c.id, cats)
    })
    return map
  }, [contracts])

  const isContractIncludedByProduct = (contractId: number): boolean => {
    if (!weeklyProduct) return true
    const cats = contractIdToCategories.get(contractId)
    if (!cats) return false
    return cats.has(weeklyProduct)
  }

  const weeklyTotals = useMemo(() => {
    if (!weeklyData || !Array.isArray(weeklyData.contracts)) return null

    const prevByMonth = Array(13).fill(0) as number[]
    const curByMonth = Array(13).fill(0) as number[]
    const remarkByMonth = Array(13).fill('') as string[]

    for (let m = 1; m <= 12; m++) {
      const changes: Array<{ label: string; delta: number }> = []
      weeklyData.contracts.forEach((c) => {
        if (!isContractIncludedByProduct(c.contract_id)) return
        const mm = c.months?.find((x) => x.month === m)
        if (!mm) return
        prevByMonth[m] += mm.previous_quantity || 0
        curByMonth[m] += mm.current_quantity || 0
        const d = mm.delta || 0
        if (Math.abs(d) > 1e-6) {
          const label = c.contract_number || `Contract ${c.contract_id}`
          changes.push({ label, delta: d })
        }
      })

      if (changes.length) {
        changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        remarkByMonth[m] = changes
          .slice(0, 6)
          .map((x) => `${x.label} ${x.delta > 0 ? '+' : ''}${fmtQty(x.delta)}`)
          .join('; ')
        if (changes.length > 6) remarkByMonth[m] += `; +${changes.length - 6} more`
      }
    }

    const previousTotal = prevByMonth.slice(1).reduce((a, b) => a + b, 0)
    const currentTotal = curByMonth.slice(1).reduce((a, b) => a + b, 0)
    return { prevByMonth, curByMonth, remarkByMonth, previousTotal, currentTotal }
  }, [weeklyData, weeklyProduct, contractIdToCategories])

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'success'
      case 'UPDATE':
        return 'info'
      case 'DELETE':
        return 'error'
      default:
        return 'default'
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm')
    } catch {
      return dateString
    }
  }

  const formatMonthYear = (month?: number, year?: number) => {
    if (!month || !year) return '-'
    return `${monthNames[month]} ${year}`
  }

  const isMonthlyPlanLog = (log: PlanAuditLog): log is MonthlyPlanAuditLog => {
    return 'month' in log && 'year' in log
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Plan Reconciliation
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Track all changes to monthly and quarterly plans including quantity updates, deletions, and creations.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={loadLogs}
          disabled={loading}
          sx={{ minWidth: 120 }}
        >
          Refresh
        </Button>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Month</InputLabel>
                <Select
                  value={selectedMonth || ''}
                  label="Month"
                  onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : null)}
                >
                  <MenuItem value="">All Months</MenuItem>
                  {monthNames.slice(1).map((month, index) => (
                    <MenuItem key={index + 1} value={index + 1}>
                      {month}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                size="small"
                label="Year"
                type="number"
                value={selectedYear || ''}
                onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
                inputProps={{ min: 2020, max: 2100 }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Action</InputLabel>
                <Select
                  value={selectedAction}
                  label="Action"
                  onChange={(e) => setSelectedAction(e.target.value)}
                >
                  <MenuItem value="">All Actions</MenuItem>
                  <MenuItem value="CREATE">Create</MenuItem>
                  <MenuItem value="UPDATE">Update</MenuItem>
                  <MenuItem value="DELETE">Delete</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Typography variant="body2" color="text.secondary">
                {logs.length} log{logs.length !== 1 ? 's' : ''} found
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Weekly quantity comparison (new) */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Weekly Quantity Comparison (Sun–Thu)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Total quantities across {weeklyProduct ? weeklyProduct : 'all products'}. Remarks show which contracts changed for each month.
              </Typography>
              {weeklyData && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Snapshot: {format(new Date(weeklyData.previous_week_start), 'MMM dd')} →{' '}
                  {format(new Date(weeklyData.previous_week_end), 'MMM dd, yyyy')}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Product</InputLabel>
                <Select value={weeklyProduct} label="Product" onChange={(e) => setWeeklyProduct(String(e.target.value))}>
                  <MenuItem value="">All Products</MenuItem>
                  {PRODUCT_FILTERS.map((p) => (
                    <MenuItem key={p} value={p}>
                      {p}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="outlined" onClick={loadWeeklyComparison} disabled={weeklyLoading} sx={{ minWidth: 120 }}>
                Refresh
              </Button>
            </Box>
          </Box>

          {weeklyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : weeklyError ? (
            <Paper sx={{ mt: 2, p: 2 }}>
              <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
                Couldn’t load weekly comparison
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {weeklyError}
              </Typography>
            </Paper>
          ) : !weeklyTotals ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              No comparison data found.
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2, overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 1100 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Row</TableCell>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <TableCell key={m} align="right" sx={{ fontWeight: 700 }}>
                        {monthNames[m]}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Previous week total</TableCell>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <TableCell key={m} align="right">
                        {fmtQty(weeklyTotals.prevByMonth[m] || 0)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Current live total</TableCell>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <TableCell key={m} align="right" sx={{ fontWeight: 700 }}>
                        {fmtQty(weeklyTotals.curByMonth[m] || 0)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Remarks</TableCell>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <TableCell key={m} sx={{ minWidth: 200 }}>
                        {weeklyTotals.remarkByMonth[m] || ''}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Logs Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : logs.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No reconciliation logs found
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date & Time</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Contract</TableCell>
                <TableCell>Plan Period</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Field Change</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell>
                    <Typography variant="body2">
                      {formatDate(log.created_at)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={isMonthlyPlanLog(log) ? 'Monthly Plan' : 'Quarterly Plan'}
                      color={isMonthlyPlanLog(log) ? 'primary' : 'secondary'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.action}
                      color={getActionColor(log.action) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {(isMonthlyPlanLog(log) ? log.contract_number : (log as QuarterlyPlanAuditLog).contract_number) ? (
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {isMonthlyPlanLog(log) ? log.contract_number : (log as QuarterlyPlanAuditLog).contract_number}
                        </Typography>
                        {(isMonthlyPlanLog(log) ? log.contract_name : (log as QuarterlyPlanAuditLog).contract_name) && (
                          <Typography variant="caption" color="text.secondary">
                            {isMonthlyPlanLog(log) ? log.contract_name : (log as QuarterlyPlanAuditLog).contract_name}
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {isMonthlyPlanLog(log) ? (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatMonthYear(log.month, log.year)}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Quarterly Plan
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {log.description || `${log.action} ${isMonthlyPlanLog(log) ? 'monthly plan' : 'quarterly plan'}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {log.field_name && log.old_value !== null && log.new_value !== null ? (
                      <Box>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {log.field_name}:
                        </Typography>
                        <Typography variant="body2" color="error" component="span">
                          {log.old_value}
                        </Typography>
                        <Typography variant="body2" component="span" sx={{ mx: 1 }}>
                          →
                        </Typography>
                        <Typography variant="body2" color="success.main" component="span" sx={{ fontWeight: 600 }}>
                          {log.new_value}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}
