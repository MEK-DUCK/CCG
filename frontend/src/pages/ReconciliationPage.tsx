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
  Button,
  TablePagination,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
} from '@mui/material'
import { format } from 'date-fns'
import {
  Refresh,
  CompareArrows,
  AddCircleOutline,
  EditOutlined,
  DeleteOutline,
  SwapHoriz,
  TrendingUp,
} from '@mui/icons-material'
import { auditLogAPI, contractAPI } from '../api/client'
import type {
  PlanAuditLog,
  MonthlyPlanAuditLog,
  QuarterlyPlanAuditLog,
  WeeklyQuantityComparisonResponse,
  Contract,
} from '../types'
import { PLAN_TYPE_COLORS } from '../utils/chipColors'
import { useResizableColumns, ColumnConfig } from '../hooks/useResizableColumns'
import ResizableTableCell from '../components/ResizableTableCell'

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Column configuration for audit logs table
const AUDIT_LOGS_COLUMNS: ColumnConfig[] = [
  { id: 'dateTime', label: 'Date & Time', defaultWidth: 150, minWidth: 120 },
  { id: 'user', label: 'User', defaultWidth: 80, minWidth: 60 },
  { id: 'type', label: 'Type', defaultWidth: 100, minWidth: 80 },
  { id: 'action', label: 'Action', defaultWidth: 100, minWidth: 80 },
  { id: 'customer', label: 'Customer', defaultWidth: 140, minWidth: 100 },
  { id: 'contract', label: 'Contract', defaultWidth: 140, minWidth: 100 },
  { id: 'product', label: 'Product', defaultWidth: 120, minWidth: 90 },
  { id: 'planPeriod', label: 'Plan Period', defaultWidth: 120, minWidth: 90 },
  { id: 'description', label: 'Description', defaultWidth: 200, minWidth: 120 },
  { id: 'fieldChange', label: 'Field Change', defaultWidth: 200, minWidth: 120 },
]

export default function ReconciliationPage() {
  const PRODUCT_FILTERS = ['GASOIL', 'JET A-1', 'FUEL OIL'] as const

  // Resizable columns for audit logs table
  const auditLogsCols = useResizableColumns('reconciliation-audit-logs', AUDIT_LOGS_COLUMNS)

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
  const [_contracts, setContracts] = useState<Contract[]>([])

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

  // Calculate action counts for stat cards
  const actionCounts = useMemo(() => {
    const counts = { CREATE: 0, UPDATE: 0, DELETE: 0, DEFER: 0, ADVANCE: 0, AUTHORITY_TOPUP: 0 }
    logs.forEach((log) => {
      if (log.action in counts) {
        counts[log.action as keyof typeof counts]++
      }
    })
    return counts
  }, [logs])

  return (
    <Box>
      {/* Modern Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 3,
                background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(139, 92, 246, 0.35)',
              }}
            >
              <CompareArrows sx={{ color: 'white', fontSize: 26 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E293B', letterSpacing: '-0.02em' }}>
                Plan Reconciliation
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748B', mt: 0.25 }}>
                Track changes to monthly and quarterly plans
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Refresh data">
            <IconButton
              onClick={() => { loadLogs(); loadWeeklyComparison(); }}
              disabled={loading || weeklyLoading}
              sx={{
                width: 42,
                height: 42,
                bgcolor: 'white',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                '&:hover': {
                  bgcolor: '#F8FAFC',
                  borderColor: '#CBD5E1',
                },
              }}
            >
              <Refresh sx={{ fontSize: 20, color: '#64748B' }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Stat Cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' }, gap: 2 }}>
          {/* Creates */}
          <Paper
            elevation={0}
            onClick={() => setSelectedAction(selectedAction === 'CREATE' ? '' : 'CREATE')}
            sx={{
              p: 2,
              borderRadius: 2.5,
              cursor: 'pointer',
              border: selectedAction === 'CREATE' ? '2px solid #10B981' : '1px solid #E2E8F0',
              background: selectedAction === 'CREATE' ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' : 'white',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AddCircleOutline sx={{ color: 'white', fontSize: 16 }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E293B', lineHeight: 1 }}>
                  {actionCounts.CREATE}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>
                  Creates
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Updates */}
          <Paper
            elevation={0}
            onClick={() => setSelectedAction(selectedAction === 'UPDATE' ? '' : 'UPDATE')}
            sx={{
              p: 2,
              borderRadius: 2.5,
              cursor: 'pointer',
              border: selectedAction === 'UPDATE' ? '2px solid #3B82F6' : '1px solid #E2E8F0',
              background: selectedAction === 'UPDATE' ? 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)' : 'white',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <EditOutlined sx={{ color: 'white', fontSize: 16 }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E293B', lineHeight: 1 }}>
                  {actionCounts.UPDATE}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>
                  Updates
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Deletes */}
          <Paper
            elevation={0}
            onClick={() => setSelectedAction(selectedAction === 'DELETE' ? '' : 'DELETE')}
            sx={{
              p: 2,
              borderRadius: 2.5,
              cursor: 'pointer',
              border: selectedAction === 'DELETE' ? '2px solid #EF4444' : '1px solid #E2E8F0',
              background: selectedAction === 'DELETE' ? 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)' : 'white',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <DeleteOutline sx={{ color: 'white', fontSize: 16 }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E293B', lineHeight: 1 }}>
                  {actionCounts.DELETE}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>
                  Deletes
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Defers */}
          <Paper
            elevation={0}
            onClick={() => setSelectedAction(selectedAction === 'DEFER' ? '' : 'DEFER')}
            sx={{
              p: 2,
              borderRadius: 2.5,
              cursor: 'pointer',
              border: selectedAction === 'DEFER' ? '2px solid #F59E0B' : '1px solid #E2E8F0',
              background: selectedAction === 'DEFER' ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' : 'white',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SwapHoriz sx={{ color: 'white', fontSize: 16 }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E293B', lineHeight: 1 }}>
                  {actionCounts.DEFER}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>
                  Defers
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Advances */}
          <Paper
            elevation={0}
            onClick={() => setSelectedAction(selectedAction === 'ADVANCE' ? '' : 'ADVANCE')}
            sx={{
              p: 2,
              borderRadius: 2.5,
              cursor: 'pointer',
              border: selectedAction === 'ADVANCE' ? '2px solid #8B5CF6' : '1px solid #E2E8F0',
              background: selectedAction === 'ADVANCE' ? 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)' : 'white',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SwapHoriz sx={{ color: 'white', fontSize: 16, transform: 'scaleX(-1)' }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E293B', lineHeight: 1 }}>
                  {actionCounts.ADVANCE}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>
                  Advances
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Authority Top-Up */}
          <Paper
            elevation={0}
            onClick={() => setSelectedAction(selectedAction === 'AUTHORITY_TOPUP' ? '' : 'AUTHORITY_TOPUP')}
            sx={{
              p: 2,
              borderRadius: 2.5,
              cursor: 'pointer',
              border: selectedAction === 'AUTHORITY_TOPUP' ? '2px solid #06B6D4' : '1px solid #E2E8F0',
              background: selectedAction === 'AUTHORITY_TOPUP' ? 'linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 100%)' : 'white',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(6, 182, 212, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp sx={{ color: 'white', fontSize: 16 }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E293B', lineHeight: 1 }}>
                  {actionCounts.AUTHORITY_TOPUP}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  Top-Ups
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Box>
      </Box>

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          p: 2.5,
          borderRadius: 3,
          border: '1px solid #E2E8F0',
          background: 'linear-gradient(135deg, #FAFBFC 0%, #F8FAFC 100%)',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Month</InputLabel>
            <Select
              value={selectedMonth || ''}
              label="Month"
              onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : null)}
              sx={{
                borderRadius: 2,
                bgcolor: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E2E8F0' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#CBD5E1' },
              }}
            >
              <MenuItem value="">All Months</MenuItem>
              {monthNames.slice(1).map((month, index) => (
                <MenuItem key={index + 1} value={index + 1}>
                  {month}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Year"
            type="number"
            value={selectedYear || ''}
            onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
            inputProps={{ min: 2020, max: 2100 }}
            sx={{
              width: 120,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                bgcolor: 'white',
                '& fieldset': { borderColor: '#E2E8F0' },
                '&:hover fieldset': { borderColor: '#CBD5E1' },
              },
            }}
          />

          {selectedAction && (
            <Button
              size="small"
              onClick={() => setSelectedAction('')}
              sx={{
                textTransform: 'none',
                color: '#64748B',
                bgcolor: 'white',
                border: '1px solid #E2E8F0',
                borderRadius: 2,
                px: 2,
                '&:hover': {
                  bgcolor: '#F8FAFC',
                  borderColor: '#CBD5E1',
                },
              }}
            >
              Clear filter: {selectedAction}
            </Button>
          )}

          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 2,
                py: 0.75,
                bgcolor: 'white',
                border: '1px solid #E2E8F0',
                borderRadius: 2,
              }}
            >
              <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>
                {logs.length}
              </Typography>
              <Typography variant="body2" sx={{ color: '#94A3B8', ml: 0.5 }}>
                log{logs.length !== 1 ? 's' : ''}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Weekly Quantity Comparison */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          p: 3,
          borderRadius: 3,
          border: '1px solid #E2E8F0',
          background: 'white',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CompareArrows sx={{ color: 'white', fontSize: 18 }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E293B', letterSpacing: '-0.01em' }}>
                Weekly Quantity Comparison
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: '#64748B', ml: 6.5 }}>
              Sun–Thu snapshot comparing previous week to current live data
            </Typography>
            {weeklyData && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', mt: 1, ml: 6.5, px: 1.5, py: 0.5, bgcolor: '#F1F5F9', borderRadius: 1.5 }}>
                <Typography variant="caption" sx={{ color: '#475569', fontWeight: 500 }}>
                  {format(new Date(weeklyData.previous_week_start), 'MMM dd')} → {format(new Date(weeklyData.previous_week_end), 'MMM dd, yyyy')}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Product Tabs */}
        <Box sx={{ mb: 2.5, borderBottom: '1px solid #E2E8F0' }}>
          <Tabs
            value={PRODUCT_FILTERS.indexOf(weeklyProduct as typeof PRODUCT_FILTERS[number])}
            onChange={(_, newValue) => setWeeklyProduct(PRODUCT_FILTERS[newValue])}
            sx={{
              minHeight: 44,
              '& .MuiTabs-indicator': {
                backgroundColor: weeklyProduct === 'GASOIL' ? '#F59E0B' : weeklyProduct === 'JET A-1' ? '#3B82F6' : '#8B5CF6',
                height: 3,
                borderRadius: '3px 3px 0 0',
              },
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                color: '#64748B',
                minWidth: 100,
                minHeight: 44,
                px: 2.5,
                '&.Mui-selected': {
                  color: weeklyProduct === 'GASOIL' ? '#D97706' : weeklyProduct === 'JET A-1' ? '#2563EB' : '#7C3AED',
                },
                '&:hover': {
                  color: '#1E293B',
                  backgroundColor: '#F8FAFC',
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
          <TableContainer sx={{ borderRadius: 2, border: '1px solid rgba(148, 163, 184, 0.12)', mt: 2, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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

      {/* Audit Logs Table */}
      <Paper
        elevation={0}
        sx={{
          mt: 3,
          borderRadius: 3,
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 2.5, borderBottom: '1px solid #E2E8F0', background: 'linear-gradient(135deg, #FAFBFC 0%, #F8FAFC 100%)' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E293B', letterSpacing: '-0.01em' }}>
            Audit Logs
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B', mt: 0.25 }}>
            Detailed history of all plan modifications
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: '#8B5CF6' }} />
          </Box>
        ) : logs.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Box sx={{
              width: 64,
              height: 64,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
            }}>
              <CompareArrows sx={{ fontSize: 28, color: '#94A3B8' }} />
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#475569' }}>
              No reconciliation logs found
            </Typography>
            <Typography variant="body2" sx={{ color: '#94A3B8', mt: 0.5, maxWidth: 320, mx: 'auto' }}>
              Logs will appear here when plan changes are made. Try adjusting your filters.
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <Table sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                    <ResizableTableCell columnId="dateTime" width={auditLogsCols.columnWidths['dateTime']} minWidth={120} onResizeStart={auditLogsCols.handleResizeStart} sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Date & Time</ResizableTableCell>
                    <ResizableTableCell columnId="user" width={auditLogsCols.columnWidths['user']} minWidth={60} onResizeStart={auditLogsCols.handleResizeStart} sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>User</ResizableTableCell>
                    <ResizableTableCell columnId="type" width={auditLogsCols.columnWidths['type']} minWidth={80} onResizeStart={auditLogsCols.handleResizeStart} sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Type</ResizableTableCell>
                    <ResizableTableCell columnId="action" width={auditLogsCols.columnWidths['action']} minWidth={80} onResizeStart={auditLogsCols.handleResizeStart} sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Action</ResizableTableCell>
                    <ResizableTableCell columnId="customer" width={auditLogsCols.columnWidths['customer']} minWidth={100} onResizeStart={auditLogsCols.handleResizeStart} sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Customer</ResizableTableCell>
                    <ResizableTableCell columnId="contract" width={auditLogsCols.columnWidths['contract']} minWidth={100} onResizeStart={auditLogsCols.handleResizeStart} sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Contract</ResizableTableCell>
                    <ResizableTableCell columnId="product" width={auditLogsCols.columnWidths['product']} minWidth={90} onResizeStart={auditLogsCols.handleResizeStart} sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Product</ResizableTableCell>
                    <ResizableTableCell columnId="planPeriod" width={auditLogsCols.columnWidths['planPeriod']} minWidth={90} onResizeStart={auditLogsCols.handleResizeStart} sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Plan Period</ResizableTableCell>
                    <ResizableTableCell columnId="description" width={auditLogsCols.columnWidths['description']} minWidth={120} onResizeStart={auditLogsCols.handleResizeStart} sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Description</ResizableTableCell>
                    <ResizableTableCell columnId="fieldChange" width={auditLogsCols.columnWidths['fieldChange']} minWidth={120} onResizeStart={auditLogsCols.handleResizeStart} sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Field Change</ResizableTableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(logsRowsPerPage > 0
                    ? logs.slice(logsPage * logsRowsPerPage, logsPage * logsRowsPerPage + logsRowsPerPage)
                    : logs
                  ).map((log) => (
                    <TableRow
                      key={log.id}
                      sx={{
                        transition: 'background-color 0.15s ease',
                        '&:hover': {
                          bgcolor: '#F8FAFC',
                        },
                        '& td': {
                          borderBottom: '1px solid #F1F5F9',
                        },
                      }}
                    >
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
                          size="small"
                          sx={{ 
                            fontWeight: 500,
                            ...(isMonthlyPlanLog(log) ? PLAN_TYPE_COLORS.MONTHLY : PLAN_TYPE_COLORS.QUARTERLY)
                          }}
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
              sx={{
                borderTop: '1px solid #E2E8F0',
                '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                  color: '#64748B',
                  fontSize: '0.875rem',
                },
              }}
            />
          </>
        )}
      </Paper>
    </Box>
  )
}
