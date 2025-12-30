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
  Button,
  TablePagination,
  Tabs,
  Tab,
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
  const [weeklyProduct, setWeeklyProduct] = useState<string>('GASOIL') // Default to first tab
  const [contracts, setContracts] = useState<Contract[]>([])

  // Pagination for logs table
  const [logsPage, setLogsPage] = useState(0)
  const [logsRowsPerPage, setLogsRowsPerPage] = useState(25)

  // Reset page when filters change
  useEffect(() => {
    setLogsPage(0)
  }, [selectedMonth, selectedYear, selectedAction])

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

  // Helper to check if a product name matches the selected product category
  const productMatchesCategory = (productName: string | null | undefined): boolean => {
    if (!productName) return false
    const normalized = normalizeProductCategory(productName)
    return normalized === weeklyProduct
  }

  const weeklyTotals = useMemo(() => {
    if (!weeklyData || !Array.isArray(weeklyData.contracts)) return null

    const prevByMonth = Array(13).fill(0) as number[]
    const curByMonth = Array(13).fill(0) as number[]
    const remarkByMonth = Array(13).fill('') as string[]

    for (let m = 1; m <= 12; m++) {
      const allRemarks: string[] = []
      weeklyData.contracts.forEach((c) => {
        // Filter by product_name from API response
        if (!productMatchesCategory(c.product_name)) return
        const mm = c.months?.find((x) => x.month === m)
        if (!mm) return
        prevByMonth[m] += mm.previous_quantity || 0
        curByMonth[m] += mm.current_quantity || 0
        
        // Use remarks from API (includes defer/advance info)
        if (mm.remark) {
          // Split multi-line remarks and prefix with contract if not already included
          const remarkLines = mm.remark.split('\n').filter((r: string) => r.trim())
          allRemarks.push(...remarkLines)
        }
      })

      if (allRemarks.length) {
        // Limit to 6 remarks and show "+N more" if needed
        const displayRemarks = allRemarks.slice(0, 6)
        remarkByMonth[m] = displayRemarks.join('\n')
        if (allRemarks.length > 6) {
          remarkByMonth[m] += `\n+${allRemarks.length - 6} more`
        }
      }
    }

    const previousTotal = prevByMonth.slice(1).reduce((a, b) => a + b, 0)
    const currentTotal = curByMonth.slice(1).reduce((a, b) => a + b, 0)
    return { prevByMonth, curByMonth, remarkByMonth, previousTotal, currentTotal }
  }, [weeklyData, weeklyProduct])

  const getActionColor = (action: string): 'success' | 'info' | 'error' | 'warning' | 'secondary' | 'default' => {
    switch (action) {
      case 'CREATE':
        return 'success'
      case 'UPDATE':
        return 'info'
      case 'DELETE':
        return 'error'
      case 'DEFER':
        return 'warning'
      case 'ADVANCE':
        return 'secondary'
      case 'AUTHORITY_TOPUP':
        return 'success'
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
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1E293B', mb: 0.5 }}>
            Plan Reconciliation
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B' }}>
            Track all changes to monthly and quarterly plans including quantity updates, deletions, and creations.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={loadLogs}
          disabled={loading}
          sx={{ 
            minWidth: 110,
            borderColor: '#E2E8F0',
            color: '#475569',
            '&:hover': {
              borderColor: '#CBD5E1',
              backgroundColor: '#F8FAFC',
            }
          }}
        >
          Refresh
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ mb: 3, p: 2.5 }}>
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
                <MenuItem value="DEFER">Defer</MenuItem>
                <MenuItem value="ADVANCE">Advance</MenuItem>
                <MenuItem value="AUTHORITY_TOPUP">Authority Top-Up</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Box sx={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              px: 1.5, 
              py: 0.75, 
              bgcolor: '#F1F5F9', 
              borderRadius: 2 
            }}>
              <Typography variant="body2" sx={{ color: '#475569', fontWeight: 500 }}>
                {logs.length} log{logs.length !== 1 ? 's' : ''} found
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Weekly quantity comparison (new) */}
      <Paper sx={{ mb: 3, p: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
              Weekly Quantity Comparison
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
              Sun–Thu snapshot for {weeklyProduct}
            </Typography>
            {weeklyData && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', mt: 1, px: 1.5, py: 0.5, bgcolor: 'rgba(71, 85, 105, 0.08)', borderRadius: 1.5 }}>
                <Typography variant="caption" sx={{ color: '#475569', fontWeight: 500 }}>
                  {format(new Date(weeklyData.previous_week_start), 'MMM dd')} → {format(new Date(weeklyData.previous_week_end), 'MMM dd, yyyy')}
                </Typography>
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button 
              variant="outlined" 
              size="small"
              onClick={loadWeeklyComparison} 
              disabled={weeklyLoading} 
              startIcon={<Refresh />}
              sx={{ 
                minWidth: 100,
                borderColor: '#E2E8F0',
                color: '#475569',
                '&:hover': {
                  borderColor: '#CBD5E1',
                  backgroundColor: '#F8FAFC',
                }
              }}
            >
              Refresh
            </Button>
          </Box>
        </Box>

        {/* Product Tabs */}
        <Box sx={{ mb: 2 }}>
          <Tabs
            value={PRODUCT_FILTERS.indexOf(weeklyProduct as typeof PRODUCT_FILTERS[number])}
            onChange={(_, newValue) => setWeeklyProduct(PRODUCT_FILTERS[newValue])}
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

        {weeklyLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : weeklyError ? (
          <Box sx={{ mt: 2, p: 3, bgcolor: 'rgba(239, 68, 68, 0.06)', borderRadius: 2, border: '1px solid rgba(239, 68, 68, 0.12)' }}>
            <Typography variant="body2" sx={{ color: '#DC2626', fontWeight: 600 }}>
              Couldn't load weekly comparison
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
              {weeklyError}
            </Typography>
          </Box>
        ) : !weeklyTotals ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: '#94A3B8' }}>
              No comparison data found.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ borderRadius: 2, border: '1px solid rgba(148, 163, 184, 0.12)', mt: 2, overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap', bgcolor: '#F8FAFC' }}>Row</TableCell>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <TableCell key={m} align="right" sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>
                      {monthNames[m]}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow sx={{ bgcolor: '#FAFBFC' }}>
                  <TableCell sx={{ fontWeight: 500, whiteSpace: 'nowrap', color: '#64748B' }}>Previous week</TableCell>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <TableCell key={m} align="right" sx={{ color: '#64748B' }}>
                      {fmtQty(weeklyTotals.prevByMonth[m] || 0)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap', color: '#1E293B' }}>Current live</TableCell>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <TableCell key={m} align="right" sx={{ fontWeight: 600, color: '#1E293B' }}>
                      {fmtQty(weeklyTotals.curByMonth[m] || 0)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow sx={{ bgcolor: '#FAFBFC' }}>
                  <TableCell sx={{ fontWeight: 500, whiteSpace: 'nowrap', color: '#64748B', verticalAlign: 'top' }}>Remarks</TableCell>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <TableCell key={m} align="right" sx={{ minWidth: 140, fontSize: '0.75rem', color: '#64748B', whiteSpace: 'pre-line', verticalAlign: 'top' }}>
                      {weeklyTotals.remarkByMonth[m] || '—'}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Logs Table */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B', mb: 2 }}>
          Audit Logs
        </Typography>
        
        {loading ? (
          <Paper sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} />
          </Paper>
        ) : logs.length === 0 ? (
          <Paper sx={{ py: 8, textAlign: 'center' }}>
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
              <Refresh sx={{ fontSize: 28, color: '#94A3B8' }} />
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 500, color: '#475569' }}>
              No reconciliation logs found
            </Typography>
            <Typography variant="body2" sx={{ color: '#94A3B8', mt: 0.5 }}>
              Logs will appear here when plan changes are made.
            </Typography>
          </Paper>
        ) : (
          <Paper>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Date & Time</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Contract</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell>Plan Period</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Field Change</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(logsRowsPerPage > 0
                    ? logs.slice(logsPage * logsRowsPerPage, logsPage * logsRowsPerPage + logsRowsPerPage)
                    : logs
                  ).map((log) => (
                    <TableRow key={log.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#475569', fontSize: '0.8125rem' }}>
                          {formatDate(log.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {log.user_initials ? (
                          <Chip 
                            label={log.user_initials} 
                            size="small" 
                            sx={{ 
                              fontFamily: 'monospace', 
                              fontWeight: 700,
                              bgcolor: '#F1F5F9',
                              color: '#475569',
                              fontSize: '0.7rem',
                            }} 
                          />
                        ) : (
                          <Typography variant="body2" sx={{ color: '#94A3B8' }}>—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={isMonthlyPlanLog(log) ? 'Monthly' : 'Quarterly'}
                          color={isMonthlyPlanLog(log) ? 'primary' : 'secondary'}
                          size="small"
                          sx={{ fontWeight: 500 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={log.action}
                          color={getActionColor(log.action) as any}
                          size="small"
                          sx={{ fontWeight: 500 }}
                        />
                      </TableCell>
                      <TableCell>
                        {(isMonthlyPlanLog(log) ? log.contract_name : (log as QuarterlyPlanAuditLog).contract_name) ? (
                          <Typography variant="body2" sx={{ fontWeight: 500, color: '#1E293B' }}>
                            {isMonthlyPlanLog(log) ? log.contract_name : (log as QuarterlyPlanAuditLog).contract_name}
                          </Typography>
                        ) : (
                          <Typography variant="body2" sx={{ color: '#94A3B8' }}>—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {(isMonthlyPlanLog(log) ? log.contract_number : (log as QuarterlyPlanAuditLog).contract_number) ? (
                            <Typography variant="body2" sx={{ fontWeight: 500, color: '#1E293B' }}>
                              {isMonthlyPlanLog(log) ? log.contract_number : (log as QuarterlyPlanAuditLog).contract_number}
                            </Typography>
                        ) : (
                          <Typography variant="body2" sx={{ color: '#94A3B8' }}>—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const productName = isMonthlyPlanLog(log) ? log.product_name : (log as QuarterlyPlanAuditLog).product_name
                          return productName ? (
                            <Chip
                              label={productName}
                              size="small"
                              sx={{ 
                                fontWeight: 500, 
                                fontSize: '0.75rem',
                                bgcolor: productName.includes('GASOIL') ? '#FEF3C7' : 
                                         productName.includes('JET') ? '#DBEAFE' : 
                                         productName.includes('FUEL') ? '#F3E8FF' : '#F1F5F9',
                                color: productName.includes('GASOIL') ? '#92400E' : 
                                       productName.includes('JET') ? '#1E40AF' : 
                                       productName.includes('FUEL') ? '#6B21A8' : '#475569',
                              }}
                            />
                          ) : (
                            <Typography variant="body2" sx={{ color: '#94A3B8' }}>—</Typography>
                          )
                        })()}
                      </TableCell>
                      <TableCell>
                        {isMonthlyPlanLog(log) ? (
                          <Typography variant="body2" sx={{ fontWeight: 500, color: '#1E293B' }}>
                            {formatMonthYear(log.month, log.year)}
                          </Typography>
                        ) : (
                          <Typography variant="body2" sx={{ color: '#64748B' }}>
                            Quarterly
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#475569', fontSize: '0.8125rem' }}>
                          {log.description || `${log.action} ${isMonthlyPlanLog(log) ? 'monthly plan' : 'quarterly plan'}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {log.field_name && log.old_value !== null && log.new_value !== null ? (
                          <Box>
                            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 500 }} display="block">
                              {log.field_name}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                              <Typography variant="body2" sx={{ color: '#EF4444', fontSize: '0.8125rem', textDecoration: 'line-through' }}>
                                {log.old_value}
                              </Typography>
                              <Typography variant="body2" sx={{ color: '#94A3B8' }}>→</Typography>
                              <Typography variant="body2" sx={{ color: '#10B981', fontWeight: 600, fontSize: '0.8125rem' }}>
                                {log.new_value}
                              </Typography>
                            </Box>
                          </Box>
                        ) : (
                          <Typography variant="body2" sx={{ color: '#94A3B8' }}>—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {logs.length > 0 && (
              <TablePagination
                rowsPerPageOptions={[25, 50, { label: 'All', value: -1 }]}
                component="div"
                count={logs.length}
                rowsPerPage={logsRowsPerPage}
                page={logsPage}
                onPageChange={(_, newPage) => setLogsPage(newPage)}
                onRowsPerPageChange={(e) => {
                  setLogsRowsPerPage(parseInt(e.target.value, 10))
                  setLogsPage(0)
                }}
              />
            )}
          </Paper>
        )}
      </Box>
    </Box>
  )
}
