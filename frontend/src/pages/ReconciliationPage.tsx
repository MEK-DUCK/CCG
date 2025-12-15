import { useState, useEffect } from 'react'
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
import { auditLogAPI } from '../api/client'
import type { PlanAuditLog, MonthlyPlanAuditLog, QuarterlyPlanAuditLog } from '../types'

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function ReconciliationPage() {
  const [logs, setLogs] = useState<PlanAuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedAction, setSelectedAction] = useState<string>('')

  useEffect(() => {
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear, selectedAction])

  // Auto-refresh when window gains focus (user switches back to tab)
  useEffect(() => {
    const handleFocus = () => {
      console.log('Window focused, refreshing logs...')
      loadLogs()
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

  const isQuarterlyPlanLog = (log: PlanAuditLog): log is QuarterlyPlanAuditLog => {
    return !('month' in log)
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
