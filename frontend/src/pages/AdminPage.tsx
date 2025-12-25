import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Card,
  CardContent,
  Tooltip,
  Collapse,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
} from '@mui/material'
import {
  Edit,
  Delete,
  Refresh,
  ExpandMore,
  ExpandLess,
  Warning,
  Error as ErrorIcon,
  Info,
  CheckCircle,
  Storage,
  Description,
  CalendarMonth,
  LocalShipping,
  People,
  History,
  Shield,
} from '@mui/icons-material'
import client from '../api/client'

// Types
interface DatabaseStats {
  counts: {
    customers: number
    contracts: number
    quarterly_plans: number
    monthly_plans: number
    cargos: number
    audit_logs: {
      cargo: number
      monthly_plan: number
      quarterly_plan: number
      contract: number
      total: number
    }
  }
  contracts_with_topups: number
  issues: Array<{
    type: string
    count: number
    severity: string
  }>
  last_updated: string
}

interface IntegrityIssue {
  type: string
  severity: string
  entity: string
  message?: string
  [key: string]: any
}

interface AuditLogEntry {
  id: string
  type: string
  entity_id: number
  entity_ref: string
  action: string
  field_name?: string
  old_value?: string
  new_value?: string
  description?: string
  created_at: string
  product_name?: string
  topup_quantity?: number
}

interface EditDialogState {
  open: boolean
  entity: string
  data: any
  id: number | null
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Data states
  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const [contracts, setContracts] = useState<any[]>([])
  const [quarterlyPlans, setQuarterlyPlans] = useState<any[]>([])
  const [monthlyPlans, setMonthlyPlans] = useState<any[]>([])
  const [cargos, setCargos] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [integrityIssues, setIntegrityIssues] = useState<IntegrityIssue[]>([])
  const [integrityStats, setIntegrityStats] = useState<any>(null)
  
  // UI states
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [editDialog, setEditDialog] = useState<EditDialogState>({
    open: false,
    entity: '',
    data: {},
    id: null
  })
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; entity: string; id: number | null; name: string }>({
    open: false,
    entity: '',
    id: null,
    name: ''
  })
  const [logTypeFilter, setLogTypeFilter] = useState<string>('all')

  // Fetch functions
  const fetchStats = useCallback(async () => {
    try {
      const response = await client.get('/api/admin/stats')
      setStats(response.data)
    } catch (err: any) {
      console.error('Error fetching stats:', err)
    }
  }, [])

  const fetchContracts = useCallback(async () => {
    try {
      const response = await client.get('/api/admin/contracts')
      setContracts(response.data.items)
    } catch (err: any) {
      console.error('Error fetching contracts:', err)
    }
  }, [])

  const fetchQuarterlyPlans = useCallback(async () => {
    try {
      const response = await client.get('/api/admin/quarterly-plans')
      setQuarterlyPlans(response.data.items)
    } catch (err: any) {
      console.error('Error fetching quarterly plans:', err)
    }
  }, [])

  const fetchMonthlyPlans = useCallback(async () => {
    try {
      const response = await client.get('/api/admin/monthly-plans')
      setMonthlyPlans(response.data.items)
    } catch (err: any) {
      console.error('Error fetching monthly plans:', err)
    }
  }, [])

  const fetchCargos = useCallback(async () => {
    try {
      const response = await client.get('/api/admin/cargos')
      setCargos(response.data.items)
    } catch (err: any) {
      console.error('Error fetching cargos:', err)
    }
  }, [])

  const fetchCustomers = useCallback(async () => {
    try {
      const response = await client.get('/api/admin/customers')
      setCustomers(response.data.items)
    } catch (err: any) {
      console.error('Error fetching customers:', err)
    }
  }, [])

  const fetchAuditLogs = useCallback(async () => {
    try {
      const params = logTypeFilter !== 'all' ? { log_type: logTypeFilter } : {}
      const response = await client.get('/api/admin/audit-logs', { params })
      setAuditLogs(response.data.items)
    } catch (err: any) {
      console.error('Error fetching audit logs:', err)
    }
  }, [logTypeFilter])

  const fetchIntegrityCheck = useCallback(async () => {
    try {
      const response = await client.get('/api/admin/integrity-check')
      setIntegrityIssues(response.data.issues)
      setIntegrityStats(response.data)
    } catch (err: any) {
      console.error('Error fetching integrity check:', err)
    }
  }, [])

  const refreshAll = async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([
        fetchStats(),
        fetchContracts(),
        fetchQuarterlyPlans(),
        fetchMonthlyPlans(),
        fetchCargos(),
        fetchCustomers(),
        fetchAuditLogs(),
        fetchIntegrityCheck()
      ])
      setSuccess('Data refreshed successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError('Failed to refresh data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  useEffect(() => {
    fetchAuditLogs()
  }, [logTypeFilter, fetchAuditLogs])

  // Edit handlers
  const handleEdit = (entity: string, data: any) => {
    setEditDialog({
      open: true,
      entity,
      data: { ...data },
      id: data.id
    })
  }

  const handleSaveEdit = async () => {
    if (!editDialog.id) return
    
    setLoading(true)
    try {
      await client.put(`/api/admin/${editDialog.entity}/${editDialog.id}`, editDialog.data)
      setSuccess(`${editDialog.entity} updated successfully`)
      setEditDialog({ open: false, entity: '', data: {}, id: null })
      await refreshAll()
    } catch (err: any) {
      setError(`Failed to update: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Delete handlers
  const handleDelete = (entity: string, id: number, name: string) => {
    setDeleteConfirm({ open: true, entity, id, name })
  }

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    
    setLoading(true)
    try {
      await client.delete(`/api/admin/${deleteConfirm.entity}/${deleteConfirm.id}`)
      setSuccess(`${deleteConfirm.entity} deleted successfully`)
      setDeleteConfirm({ open: false, entity: '', id: null, name: '' })
      await refreshAll()
    } catch (err: any) {
      setError(`Failed to delete: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleRowExpand = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'error'
      case 'warning': return 'warning'
      case 'info': return 'info'
      default: return 'default'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <ErrorIcon fontSize="small" />
      case 'warning': return <Warning fontSize="small" />
      case 'info': return <Info fontSize="small" />
      default: return <CheckCircle fontSize="small" />
    }
  }

  // Tab panels
  const renderOverview = () => (
    <Box>
      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card sx={{ bgcolor: '#E0F2FE', border: '1px solid #0EA5E9' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <People sx={{ fontSize: 40, color: '#0284C7', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#0369A1' }}>
                {stats?.counts.customers || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Customers</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card sx={{ bgcolor: '#D1FAE5', border: '1px solid #10B981' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Description sx={{ fontSize: 40, color: '#059669', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#047857' }}>
                {stats?.counts.contracts || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Contracts</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card sx={{ bgcolor: '#FEF3C7', border: '1px solid #F59E0B' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <CalendarMonth sx={{ fontSize: 40, color: '#D97706', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#B45309' }}>
                {stats?.counts.quarterly_plans || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Quarterly Plans</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card sx={{ bgcolor: '#EDE9FE', border: '1px solid #8B5CF6' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <CalendarMonth sx={{ fontSize: 40, color: '#7C3AED', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#6D28D9' }}>
                {stats?.counts.monthly_plans || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Monthly Plans</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card sx={{ bgcolor: '#FEE2E2', border: '1px solid #EF4444' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <LocalShipping sx={{ fontSize: 40, color: '#DC2626', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#B91C1C' }}>
                {stats?.counts.cargos || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Cargos</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card sx={{ bgcolor: '#F1F5F9', border: '1px solid #64748B' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <History sx={{ fontSize: 40, color: '#475569', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#334155' }}>
                {stats?.counts.audit_logs?.total || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Audit Logs</Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Special Stats */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Shield color="primary" /> Contracts with Top-Ups
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#10B981' }}>
                {stats?.contracts_with_topups || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Contracts that have received authority top-up quantities
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Issues */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Warning color="warning" /> Quick Issues
              </Typography>
              {stats?.issues && stats.issues.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {stats.issues.map((issue, idx) => (
                    <Chip
                      key={idx}
                      icon={getSeverityIcon(issue.severity)}
                      label={`${issue.count} ${issue.type.replace(/_/g, ' ')}`}
                      color={getSeverityColor(issue.severity) as any}
                      variant="outlined"
                      size="small"
                    />
                  ))}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#10B981' }}>
                  <CheckCircle />
                  <Typography>No issues detected</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )

  const renderCustomersTable = () => (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Customer ID</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Contracts</TableCell>
            <TableCell>Created</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id} hover>
              <TableCell>{customer.id}</TableCell>
              <TableCell>
                <Chip label={customer.customer_id} size="small" variant="outlined" />
              </TableCell>
              <TableCell sx={{ fontWeight: 500 }}>{customer.name}</TableCell>
              <TableCell>
                <Chip label={customer.contracts_count} size="small" color="primary" />
              </TableCell>
              <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {customer.created_at ? new Date(customer.created_at).toLocaleDateString() : '-'}
              </TableCell>
              <TableCell align="right">
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => handleEdit('customers', customer)}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton 
                    size="small" 
                    color="error"
                    onClick={() => handleDelete('customers', customer.id, customer.name)}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderContractsTable = () => (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Contract #</TableCell>
            <TableCell>Customer</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Payment</TableCell>
            <TableCell>Period</TableCell>
            <TableCell>Products</TableCell>
            <TableCell>Top-ups</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {contracts.map((contract) => (
            <TableRow key={contract.id} hover>
              <TableCell>{contract.id}</TableCell>
              <TableCell sx={{ fontWeight: 500 }}>{contract.contract_number}</TableCell>
              <TableCell>{contract.customer_name}</TableCell>
              <TableCell>
                <Chip 
                  label={contract.contract_type} 
                  size="small" 
                  color={contract.contract_type === 'FOB' ? 'primary' : 'secondary'}
                />
              </TableCell>
              <TableCell>
                <Chip 
                  label={contract.payment_method || '-'} 
                  size="small" 
                  variant="outlined"
                />
              </TableCell>
              <TableCell sx={{ fontSize: '0.75rem' }}>
                {contract.start_period} - {contract.end_period}
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {contract.products?.map((p: any, idx: number) => (
                    <Chip 
                      key={idx} 
                      label={`${p.name}: ${p.total_quantity}KT`} 
                      size="small" 
                      variant="outlined"
                    />
                  ))}
                </Box>
              </TableCell>
              <TableCell>
                {contract.authority_topups?.length > 0 ? (
                  <Chip 
                    label={`${contract.authority_topups.length} top-up(s)`} 
                    size="small" 
                    color="success"
                  />
                ) : '-'}
              </TableCell>
              <TableCell align="right">
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => handleEdit('contracts', contract)}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton 
                    size="small" 
                    color="error"
                    onClick={() => handleDelete('contracts', contract.id, contract.contract_number)}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderQuarterlyPlansTable = () => (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Contract</TableCell>
            <TableCell>Customer</TableCell>
            <TableCell>Product</TableCell>
            <TableCell align="right">Q1</TableCell>
            <TableCell align="right">Q2</TableCell>
            <TableCell align="right">Q3</TableCell>
            <TableCell align="right">Q4</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {quarterlyPlans.map((qp) => {
            const total = (qp.q1_quantity || 0) + (qp.q2_quantity || 0) + (qp.q3_quantity || 0) + (qp.q4_quantity || 0)
            const totalTopup = (qp.q1_topup || 0) + (qp.q2_topup || 0) + (qp.q3_topup || 0) + (qp.q4_topup || 0)
            return (
              <TableRow key={qp.id} hover>
                <TableCell>{qp.id}</TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{qp.contract_number}</TableCell>
                <TableCell>{qp.customer_name}</TableCell>
                <TableCell>
                  <Chip label={qp.product_name} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">
                  {qp.q1_quantity || 0}
                  {qp.q1_topup > 0 && <Typography component="span" sx={{ color: '#10B981', fontSize: '0.7rem' }}> +{qp.q1_topup}</Typography>}
                </TableCell>
                <TableCell align="right">
                  {qp.q2_quantity || 0}
                  {qp.q2_topup > 0 && <Typography component="span" sx={{ color: '#10B981', fontSize: '0.7rem' }}> +{qp.q2_topup}</Typography>}
                </TableCell>
                <TableCell align="right">
                  {qp.q3_quantity || 0}
                  {qp.q3_topup > 0 && <Typography component="span" sx={{ color: '#10B981', fontSize: '0.7rem' }}> +{qp.q3_topup}</Typography>}
                </TableCell>
                <TableCell align="right">
                  {qp.q4_quantity || 0}
                  {qp.q4_topup > 0 && <Typography component="span" sx={{ color: '#10B981', fontSize: '0.7rem' }}> +{qp.q4_topup}</Typography>}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {total + totalTopup} KT
                  {totalTopup > 0 && <Typography component="span" sx={{ color: '#10B981', fontSize: '0.7rem' }}> (+{totalTopup})</Typography>}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => handleEdit('quarterly-plans', qp)}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton 
                      size="small" 
                      color="error"
                      onClick={() => handleDelete('quarterly-plans', qp.id, `${qp.contract_number} - ${qp.product_name}`)}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderMonthlyPlansTable = () => (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Contract</TableCell>
            <TableCell>Product</TableCell>
            <TableCell>Month/Year</TableCell>
            <TableCell align="right">Quantity</TableCell>
            <TableCell>Laycan 5-Day</TableCell>
            <TableCell>Laycan 2-Day</TableCell>
            <TableCell>Top-Up</TableCell>
            <TableCell>Combi</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {monthlyPlans.map((mp) => (
            <TableRow key={mp.id} hover>
              <TableCell>{mp.id}</TableCell>
              <TableCell sx={{ fontWeight: 500 }}>{mp.contract_number}</TableCell>
              <TableCell>
                <Chip label={mp.product_name} size="small" variant="outlined" />
              </TableCell>
              <TableCell>
                {mp.month}/{mp.year}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 500 }}>
                {mp.month_quantity} KT
              </TableCell>
              <TableCell sx={{ fontSize: '0.8rem' }}>{mp.laycan_5_days || '-'}</TableCell>
              <TableCell sx={{ fontSize: '0.8rem' }}>{mp.laycan_2_days || '-'}</TableCell>
              <TableCell>
                {mp.authority_topup_quantity > 0 ? (
                  <Tooltip title={`Ref: ${mp.authority_topup_reference || 'N/A'}`}>
                    <Chip 
                      label={`+${mp.authority_topup_quantity} KT`} 
                      size="small" 
                      color="success"
                    />
                  </Tooltip>
                ) : '-'}
              </TableCell>
              <TableCell>
                {mp.combi_group_id ? (
                  <Chip label="Combi" size="small" color="info" variant="outlined" />
                ) : '-'}
              </TableCell>
              <TableCell align="right">
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => handleEdit('monthly-plans', mp)}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton 
                    size="small" 
                    color="error"
                    onClick={() => handleDelete('monthly-plans', mp.id, `${mp.contract_number} - ${mp.month}/${mp.year}`)}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderCargosTable = () => (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Cargo ID</TableCell>
            <TableCell>Vessel</TableCell>
            <TableCell>Customer</TableCell>
            <TableCell>Product</TableCell>
            <TableCell align="right">Quantity</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Load Ports</TableCell>
            <TableCell>ETA</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {cargos.map((cargo) => (
            <TableRow key={cargo.id} hover>
              <TableCell>{cargo.id}</TableCell>
              <TableCell>
                <Chip label={cargo.cargo_id} size="small" variant="outlined" />
              </TableCell>
              <TableCell sx={{ fontWeight: 500 }}>{cargo.vessel_name}</TableCell>
              <TableCell>{cargo.customer_name}</TableCell>
              <TableCell>
                <Chip label={cargo.product_name} size="small" variant="outlined" />
              </TableCell>
              <TableCell align="right">{cargo.cargo_quantity} KT</TableCell>
              <TableCell>
                <Chip 
                  label={cargo.status} 
                  size="small"
                  color={
                    cargo.status === 'Completed Loading' ? 'success' :
                    cargo.status === 'Loading' ? 'warning' : 'default'
                  }
                />
              </TableCell>
              <TableCell sx={{ fontSize: '0.8rem' }}>{cargo.load_ports}</TableCell>
              <TableCell sx={{ fontSize: '0.8rem' }}>{cargo.eta || '-'}</TableCell>
              <TableCell align="right">
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => handleEdit('cargos', cargo)}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton 
                    size="small" 
                    color="error"
                    onClick={() => handleDelete('cargos', cargo.id, cargo.vessel_name)}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderAuditLogs = () => (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filter by Type</InputLabel>
          <Select
            value={logTypeFilter}
            label="Filter by Type"
            onChange={(e) => setLogTypeFilter(e.target.value)}
          >
            <MenuItem value="all">All Logs</MenuItem>
            <MenuItem value="cargo">Cargo Logs</MenuItem>
            <MenuItem value="monthly_plan">Monthly Plan Logs</MenuItem>
            <MenuItem value="quarterly_plan">Quarterly Plan Logs</MenuItem>
            <MenuItem value="contract">Contract Logs</MenuItem>
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          Showing {auditLogs.length} logs
        </Typography>
      </Box>
      
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Entity</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Field</TableCell>
              <TableCell>Old Value</TableCell>
              <TableCell>New Value</TableCell>
              <TableCell>Description</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {auditLogs.map((log) => (
              <TableRow key={log.id} hover>
                <TableCell sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                </TableCell>
                <TableCell>
                  <Chip 
                    label={log.type.replace('_', ' ')} 
                    size="small" 
                    variant="outlined"
                    color={
                      log.type === 'cargo' ? 'error' :
                      log.type === 'monthly_plan' ? 'primary' :
                      log.type === 'quarterly_plan' ? 'warning' : 'success'
                    }
                  />
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem' }}>{log.entity_ref || log.entity_id}</TableCell>
                <TableCell>
                  <Chip 
                    label={log.action} 
                    size="small"
                    color={
                      log.action === 'CREATE' ? 'success' :
                      log.action === 'DELETE' ? 'error' :
                      log.action === 'AUTHORITY_TOPUP' ? 'info' : 'default'
                    }
                  />
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem' }}>{log.field_name || '-'}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.old_value || '-'}
                </TableCell>
                <TableCell sx={{ fontSize: '0.75rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.new_value || '-'}
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem' }}>{log.description || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )

  const renderIntegrityCheck = () => (
    <Box>
      {/* Summary */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card sx={{ bgcolor: integrityStats?.issues_by_severity?.error > 0 ? '#FEE2E2' : '#D1FAE5' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <ErrorIcon sx={{ fontSize: 40, color: integrityStats?.issues_by_severity?.error > 0 ? '#DC2626' : '#10B981' }} />
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {integrityStats?.issues_by_severity?.error || 0}
              </Typography>
              <Typography variant="body2">Critical Errors</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card sx={{ bgcolor: integrityStats?.issues_by_severity?.warning > 0 ? '#FEF3C7' : '#D1FAE5' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Warning sx={{ fontSize: 40, color: integrityStats?.issues_by_severity?.warning > 0 ? '#D97706' : '#10B981' }} />
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {integrityStats?.issues_by_severity?.warning || 0}
              </Typography>
              <Typography variant="body2">Warnings</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card sx={{ bgcolor: '#E0F2FE' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Info sx={{ fontSize: 40, color: '#0284C7' }} />
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {integrityStats?.issues_by_severity?.info || 0}
              </Typography>
              <Typography variant="body2">Info</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Issues List */}
      {integrityIssues.length === 0 ? (
        <Alert severity="success" icon={<CheckCircle />}>
          No data integrity issues detected. All records are properly linked.
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell></TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Entity</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {integrityIssues.map((issue, idx) => (
                <>
                  <TableRow key={idx} hover onClick={() => toggleRowExpand(`issue-${idx}`)} sx={{ cursor: 'pointer' }}>
                    <TableCell>
                      <IconButton size="small">
                        {expandedRows.has(`issue-${idx}`) ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        icon={getSeverityIcon(issue.severity)}
                        label={issue.severity.toUpperCase()} 
                        size="small"
                        color={getSeverityColor(issue.severity) as any}
                      />
                    </TableCell>
                    <TableCell>{issue.type.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{issue.entity}</TableCell>
                    <TableCell>
                      {issue.message || `${issue.contract_number || ''} - ${issue.product || ''}`}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} sx={{ py: 0 }}>
                      <Collapse in={expandedRows.has(`issue-${idx}`)} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: '#F8FAFC' }}>
                          <Typography variant="body2" component="pre" sx={{ fontSize: '0.75rem' }}>
                            {JSON.stringify(issue, null, 2)}
                          </Typography>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ 
            width: 48, 
            height: 48, 
            borderRadius: 2, 
            bgcolor: '#EDE9FE', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}>
            <Storage sx={{ fontSize: 28, color: '#7C3AED' }} />
          </Box>
          <Box>
            <Typography variant="h4">Admin Dashboard</Typography>
            <Typography variant="body2" color="text.secondary">
              Database management and monitoring • Last updated: {stats?.last_updated ? new Date(stats.last_updated).toLocaleString() : '-'}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Refresh />}
          onClick={refreshAll}
          disabled={loading}
        >
          Refresh All
        </Button>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={activeTab} 
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Overview" icon={<Storage />} iconPosition="start" />
          <Tab label="Customers" icon={<People />} iconPosition="start" />
          <Tab label="Contracts" icon={<Description />} iconPosition="start" />
          <Tab label="Quarterly Plans" icon={<CalendarMonth />} iconPosition="start" />
          <Tab label="Monthly Plans" icon={<CalendarMonth />} iconPosition="start" />
          <Tab label="Cargos" icon={<LocalShipping />} iconPosition="start" />
          <Tab label="Audit Logs" icon={<History />} iconPosition="start" />
          <Tab label="Integrity Check" icon={<Shield />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <Box>
        {activeTab === 0 && renderOverview()}
        {activeTab === 1 && renderCustomersTable()}
        {activeTab === 2 && renderContractsTable()}
        {activeTab === 3 && renderQuarterlyPlansTable()}
        {activeTab === 4 && renderMonthlyPlansTable()}
        {activeTab === 5 && renderCargosTable()}
        {activeTab === 6 && renderAuditLogs()}
        {activeTab === 7 && renderIntegrityCheck()}
      </Box>

      {/* Edit Dialog */}
      <Dialog 
        open={editDialog.open} 
        onClose={() => setEditDialog({ open: false, entity: '', data: {}, id: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Edit {editDialog.entity.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {Object.entries(editDialog.data).map(([key, value]) => {
              // Skip non-editable fields
              if (['id', 'created_at', 'updated_at', 'customer_name', 'contract_number'].includes(key)) {
                return (
                  <Grid item xs={12} sm={6} key={key}>
                    <TextField
                      fullWidth
                      label={key.replace(/_/g, ' ')}
                      value={value?.toString() || ''}
                      disabled
                      size="small"
                    />
                  </Grid>
                )
              }
              // Handle JSON fields
              if (typeof value === 'object' && value !== null) {
                return (
                  <Grid item xs={12} key={key}>
                    <TextField
                      fullWidth
                      label={key.replace(/_/g, ' ')}
                      value={JSON.stringify(value, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value)
                          setEditDialog(prev => ({
                            ...prev,
                            data: { ...prev.data, [key]: parsed }
                          }))
                        } catch {
                          // Invalid JSON, just update the string
                        }
                      }}
                      multiline
                      rows={4}
                      size="small"
                    />
                  </Grid>
                )
              }
              return (
                <Grid item xs={12} sm={6} key={key}>
                  <TextField
                    fullWidth
                    label={key.replace(/_/g, ' ')}
                    value={value?.toString() || ''}
                    onChange={(e) => setEditDialog(prev => ({
                      ...prev,
                      data: { ...prev.data, [key]: e.target.value }
                    }))}
                    size="small"
                  />
                </Grid>
              )
            })}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, entity: '', data: {}, id: null })}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={loading}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirm.open} onClose={() => setDeleteConfirm({ open: false, entity: '', id: null, name: '' })}>
        <DialogTitle sx={{ color: 'error.main' }}>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
          </Typography>
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            This action cannot be undone. All related data will also be deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm({ open: false, entity: '', id: null, name: '' })}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={loading}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

