import React, { useState, useEffect, useCallback } from 'react'
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
  Inventory,
  Add,
  ManageAccounts,
  DeleteSweep,
} from '@mui/icons-material'
import client from '../api/client'
import UserManagement from '../components/UserManagement'
import { RecycleBin } from '../components/RecycleBin'

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
  user_initials?: string
}

interface EditDialogState {
  open: boolean
  entity: string
  data: any
  id: number | null
}

interface Product {
  id: number
  code: string
  name: string
  description?: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at?: string
}

interface LoadPort {
  id: number
  code: string
  name: string
  country?: string
  description?: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at?: string
}

interface Inspector {
  id: number
  code: string
  name: string
  description?: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at?: string
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
  const [products, setProducts] = useState<Product[]>([])
  const [loadPorts, setLoadPorts] = useState<LoadPort[]>([])
  const [inspectors, setInspectors] = useState<Inspector[]>([])
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
  const [productDialog, setProductDialog] = useState<{ open: boolean; editing: Product | null }>({
    open: false,
    editing: null
  })
  const [productForm, setProductForm] = useState({
    code: '',
    name: '',
    description: '',
    is_active: true,
    sort_order: 0
  })
  const [loadPortDialog, setLoadPortDialog] = useState<{ open: boolean; editing: LoadPort | null }>({
    open: false,
    editing: null
  })
  const [loadPortForm, setLoadPortForm] = useState({
    code: '',
    name: '',
    country: '',
    description: '',
    is_active: true,
    sort_order: 0
  })
  const [inspectorDialog, setInspectorDialog] = useState<{ open: boolean; editing: Inspector | null }>({
    open: false,
    editing: null
  })
  const [inspectorForm, setInspectorForm] = useState({
    code: '',
    name: '',
    description: '',
    is_active: true,
    sort_order: 0
  })

  // System-generated fields that cannot be modified (per entity type)
  const protectedFields: Record<string, string[]> = {
    'customers': ['id', 'customer_id', 'created_at', 'updated_at'],
    'contracts': ['id', 'contract_id', 'created_at', 'updated_at'],
    'quarterly-plans': ['id', 'created_at', 'updated_at'],
    'monthly-plans': ['id', 'created_at', 'updated_at'],
    'cargos': ['id', 'cargo_id', 'created_at', 'updated_at'],
    'products': ['id', 'created_at', 'updated_at'],
  }

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

  const fetchProducts = useCallback(async () => {
    try {
      const response = await client.get('/api/products?include_inactive=true')
      // Auto-seed if empty
      if (response.data.length === 0) {
        await client.post('/api/products/seed-defaults')
        const seededResponse = await client.get('/api/products?include_inactive=true')
        setProducts(seededResponse.data)
      } else {
        setProducts(response.data)
      }
    } catch (err: any) {
      console.error('Error fetching products:', err)
    }
  }, [])

  const fetchLoadPorts = useCallback(async () => {
    try {
      const response = await client.get('/api/load-ports?include_inactive=true')
      // Auto-seed if empty
      if (response.data.length === 0) {
        await client.post('/api/load-ports/seed-defaults')
        const seededResponse = await client.get('/api/load-ports?include_inactive=true')
        setLoadPorts(seededResponse.data)
      } else {
        setLoadPorts(response.data)
      }
    } catch (err: any) {
      console.error('Error fetching load ports:', err)
    }
  }, [])

  const fetchInspectors = useCallback(async () => {
    try {
      const response = await client.get('/api/inspectors?include_inactive=true')
      // Auto-seed if empty
      if (response.data.length === 0) {
        await client.post('/api/inspectors/seed-defaults')
        const seededResponse = await client.get('/api/inspectors?include_inactive=true')
        setInspectors(seededResponse.data)
      } else {
        setInspectors(response.data)
      }
    } catch (err: any) {
      console.error('Error fetching inspectors:', err)
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
        fetchProducts(),
        fetchLoadPorts(),
        fetchInspectors(),
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

  // Product handlers
  const handleOpenProductDialog = (product?: Product) => {
    if (product) {
      setProductForm({
        code: product.code,
        name: product.name,
        description: product.description || '',
        is_active: product.is_active,
        sort_order: product.sort_order
      })
      setProductDialog({ open: true, editing: product })
    } else {
      setProductForm({
        code: '',
        name: '',
        description: '',
        is_active: true,
        sort_order: products.length + 1
      })
      setProductDialog({ open: true, editing: null })
    }
  }

  const handleSaveProduct = async () => {
    setLoading(true)
    try {
      if (productDialog.editing) {
        await client.put(`/api/products/${productDialog.editing.id}`, productForm)
        setSuccess('Product updated successfully')
      } else {
        await client.post('/api/products', productForm)
        setSuccess('Product created successfully')
      }
      setProductDialog({ open: false, editing: null })
      await fetchProducts()
    } catch (err: any) {
      setError(`Failed to save product: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`Are you sure you want to delete "${product.name}"? This cannot be undone.`)) {
      return
    }
    setLoading(true)
    try {
      await client.delete(`/api/products/${product.id}`)
      setSuccess('Product deleted successfully')
      await fetchProducts()
    } catch (err: any) {
      setError(`Failed to delete product: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleProductActive = async (product: Product) => {
    setLoading(true)
    try {
      await client.put(`/api/products/${product.id}`, { is_active: !product.is_active })
      setSuccess(`Product ${product.is_active ? 'deactivated' : 'activated'} successfully`)
      await fetchProducts()
    } catch (err: any) {
      setError(`Failed to update product: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Load Port handlers
  const handleOpenLoadPortDialog = (port?: LoadPort) => {
    if (port) {
      setLoadPortForm({
        code: port.code,
        name: port.name,
        country: port.country || '',
        description: port.description || '',
        is_active: port.is_active,
        sort_order: port.sort_order
      })
      setLoadPortDialog({ open: true, editing: port })
    } else {
      setLoadPortForm({
        code: '',
        name: '',
        country: '',
        description: '',
        is_active: true,
        sort_order: loadPorts.length + 1
      })
      setLoadPortDialog({ open: true, editing: null })
    }
  }

  const handleSaveLoadPort = async () => {
    setLoading(true)
    try {
      if (loadPortDialog.editing) {
        await client.put(`/api/load-ports/${loadPortDialog.editing.id}`, loadPortForm)
        setSuccess('Load port updated successfully')
      } else {
        await client.post('/api/load-ports', loadPortForm)
        setSuccess('Load port created successfully')
      }
      setLoadPortDialog({ open: false, editing: null })
      await fetchLoadPorts()
    } catch (err: any) {
      setError(`Failed to save load port: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteLoadPort = async (port: LoadPort) => {
    if (!confirm(`Are you sure you want to delete "${port.name}"? This cannot be undone.`)) {
      return
    }
    setLoading(true)
    try {
      await client.delete(`/api/load-ports/${port.id}`)
      setSuccess('Load port deleted successfully')
      await fetchLoadPorts()
    } catch (err: any) {
      setError(`Failed to delete load port: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleLoadPortActive = async (port: LoadPort) => {
    setLoading(true)
    try {
      await client.put(`/api/load-ports/${port.id}`, { is_active: !port.is_active })
      setSuccess(`Load port ${port.is_active ? 'deactivated' : 'activated'} successfully`)
      await fetchLoadPorts()
    } catch (err: any) {
      setError(`Failed to update load port: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Inspector handlers
  const handleOpenInspectorDialog = (inspector?: Inspector) => {
    if (inspector) {
      setInspectorForm({
        code: inspector.code,
        name: inspector.name,
        description: inspector.description || '',
        is_active: inspector.is_active,
        sort_order: inspector.sort_order
      })
      setInspectorDialog({ open: true, editing: inspector })
    } else {
      setInspectorForm({
        code: '',
        name: '',
        description: '',
        is_active: true,
        sort_order: inspectors.length + 1
      })
      setInspectorDialog({ open: true, editing: null })
    }
  }

  const handleSaveInspector = async () => {
    setLoading(true)
    try {
      if (inspectorDialog.editing) {
        await client.put(`/api/inspectors/${inspectorDialog.editing.id}`, inspectorForm)
        setSuccess('Inspector updated successfully')
      } else {
        await client.post('/api/inspectors', inspectorForm)
        setSuccess('Inspector created successfully')
      }
      setInspectorDialog({ open: false, editing: null })
      await fetchInspectors()
    } catch (err: any) {
      setError(`Failed to save inspector: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteInspector = async (inspector: Inspector) => {
    if (!confirm(`Are you sure you want to delete "${inspector.name}"? This cannot be undone.`)) {
      return
    }
    setLoading(true)
    try {
      await client.delete(`/api/inspectors/${inspector.id}`)
      setSuccess('Inspector deleted successfully')
      await fetchInspectors()
    } catch (err: any) {
      setError(`Failed to delete inspector: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleInspectorActive = async (inspector: Inspector) => {
    setLoading(true)
    try {
      await client.put(`/api/inspectors/${inspector.id}`, { is_active: !inspector.is_active })
      setSuccess(`Inspector ${inspector.is_active ? 'deactivated' : 'activated'} successfully`)
      await fetchInspectors()
    } catch (err: any) {
      setError(`Failed to update inspector: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
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
    <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <Table size="small" sx={{ minWidth: 700 }}>
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
    <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <Table size="small" sx={{ minWidth: 1000 }}>
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
    <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <Table size="small" sx={{ minWidth: 900 }}>
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
    <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <Table size="small" sx={{ minWidth: 900 }}>
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
    <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <Table size="small" sx={{ minWidth: 900 }}>
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
      
      <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <Table size="small" sx={{ minWidth: 1100 }}>
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>User</TableCell>
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
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>-</Typography>
                  )}
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
        <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Table size="small" sx={{ minWidth: 700 }}>
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
                <React.Fragment key={idx}>
                  <TableRow hover onClick={() => toggleRowExpand(`issue-${idx}`)} sx={{ cursor: 'pointer' }}>
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
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )

  const renderProductsTable = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Products Configuration ({products.length} total)
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenProductDialog()}
          sx={{ bgcolor: '#7C3AED', '&:hover': { bgcolor: '#6D28D9' } }}
        >
          Add Product
        </Button>
      </Box>
      
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          Products defined here will be available for selection when creating contracts and cargos.
          Deactivated products won't appear in dropdowns but existing data using them will remain intact.
        </Typography>
      </Alert>

      <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <Table size="small" sx={{ minWidth: 700 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8FAFC' }}>
              <TableCell sx={{ fontWeight: 600 }}>Order</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((product) => (
              <TableRow 
                key={product.id} 
                hover
                sx={{ 
                  bgcolor: product.is_active ? 'white' : '#F8FAFC',
                  opacity: product.is_active ? 1 : 0.7
                }}
              >
                <TableCell>{product.sort_order}</TableCell>
                <TableCell>
                  <Chip 
                    label={product.code} 
                    size="small" 
                    sx={{ 
                      fontFamily: 'monospace', 
                      fontWeight: 600,
                      bgcolor: '#E0E7FF',
                      color: '#3730A3'
                    }} 
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{product.name}</TableCell>
                <TableCell sx={{ color: 'text.secondary', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {product.description || '-'}
                </TableCell>
                <TableCell>
                  <Chip
                    label={product.is_active ? 'Active' : 'Inactive'}
                    size="small"
                    color={product.is_active ? 'success' : 'default'}
                    onClick={() => handleToggleProductActive(product)}
                    sx={{ cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => handleOpenProductDialog(product)}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => handleDeleteProduct(product)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">Loading products...</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Product Edit/Create Dialog */}
      <Dialog
        open={productDialog.open}
        onClose={() => setProductDialog({ open: false, editing: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {productDialog.editing ? 'Edit Product' : 'Add New Product'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Product Code"
                value={productForm.code}
                onChange={(e) => setProductForm({ ...productForm, code: e.target.value.toUpperCase() })}
                helperText="Short identifier (e.g., JETA1)"
                required
                inputProps={{ maxLength: 20 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Sort Order"
                type="number"
                value={productForm.sort_order}
                onChange={(e) => setProductForm({ ...productForm, sort_order: parseInt(e.target.value) || 0 })}
                helperText="Display order in lists"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Product Name"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                helperText="Full display name (e.g., JET A-1)"
                required
                inputProps={{ maxLength: 64 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={productForm.description}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                helperText="Optional description"
                multiline
                rows={2}
                inputProps={{ maxLength: 255 }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={productForm.is_active ? 'active' : 'inactive'}
                  label="Status"
                  onChange={(e) => setProductForm({ ...productForm, is_active: e.target.value === 'active' })}
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProductDialog({ open: false, editing: null })}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSaveProduct} 
            disabled={loading || !productForm.code || !productForm.name}
          >
            {productDialog.editing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )

  const renderLoadPortsTable = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Load Ports Configuration ({loadPorts.length} total)
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenLoadPortDialog()}
          sx={{ bgcolor: '#0EA5E9', '&:hover': { bgcolor: '#0284C7' } }}
        >
          Add Load Port
        </Button>
      </Box>
      
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          Load ports defined here will be available for selection when creating cargos.
          Deactivated ports won't appear in dropdowns but existing data using them will remain intact.
        </Typography>
      </Alert>

      <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <Table size="small" sx={{ minWidth: 800 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8FAFC' }}>
              <TableCell sx={{ fontWeight: 600 }}>Order</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Country</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loadPorts.map((port) => (
              <TableRow 
                key={port.id} 
                hover
                sx={{ 
                  bgcolor: port.is_active ? 'white' : '#F8FAFC',
                  opacity: port.is_active ? 1 : 0.7
                }}
              >
                <TableCell>{port.sort_order}</TableCell>
                <TableCell>
                  <Chip 
                    label={port.code} 
                    size="small" 
                    sx={{ 
                      fontFamily: 'monospace', 
                      fontWeight: 600,
                      bgcolor: '#E0F2FE',
                      color: '#0369A1'
                    }} 
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{port.name}</TableCell>
                <TableCell>{port.country || '-'}</TableCell>
                <TableCell sx={{ color: 'text.secondary', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {port.description || '-'}
                </TableCell>
                <TableCell>
                  <Chip
                    label={port.is_active ? 'Active' : 'Inactive'}
                    size="small"
                    color={port.is_active ? 'success' : 'default'}
                    onClick={() => handleToggleLoadPortActive(port)}
                    sx={{ cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => handleOpenLoadPortDialog(port)}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => handleDeleteLoadPort(port)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {loadPorts.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">Loading load ports...</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Load Port Edit/Create Dialog */}
      <Dialog
        open={loadPortDialog.open}
        onClose={() => setLoadPortDialog({ open: false, editing: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {loadPortDialog.editing ? 'Edit Load Port' : 'Add New Load Port'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Port Code"
                value={loadPortForm.code}
                onChange={(e) => setLoadPortForm({ ...loadPortForm, code: e.target.value.toUpperCase() })}
                helperText="Short identifier (e.g., MAA)"
                required
                inputProps={{ maxLength: 10 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Sort Order"
                type="number"
                value={loadPortForm.sort_order}
                onChange={(e) => setLoadPortForm({ ...loadPortForm, sort_order: parseInt(e.target.value) || 0 })}
                helperText="Display order in lists"
              />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="Port Name"
                value={loadPortForm.name}
                onChange={(e) => setLoadPortForm({ ...loadPortForm, name: e.target.value })}
                helperText="Full name (e.g., Mina Al Ahmadi)"
                required
                inputProps={{ maxLength: 100 }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Country"
                value={loadPortForm.country}
                onChange={(e) => setLoadPortForm({ ...loadPortForm, country: e.target.value })}
                inputProps={{ maxLength: 50 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={loadPortForm.description}
                onChange={(e) => setLoadPortForm({ ...loadPortForm, description: e.target.value })}
                helperText="Optional description"
                multiline
                rows={2}
                inputProps={{ maxLength: 255 }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={loadPortForm.is_active ? 'active' : 'inactive'}
                  label="Status"
                  onChange={(e) => setLoadPortForm({ ...loadPortForm, is_active: e.target.value === 'active' })}
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoadPortDialog({ open: false, editing: null })}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSaveLoadPort} 
            disabled={loading || !loadPortForm.code || !loadPortForm.name}
          >
            {loadPortDialog.editing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )

  const renderInspectorsTable = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Inspectors Configuration ({inspectors.length} total)
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenInspectorDialog()}
          sx={{ bgcolor: '#F59E0B', '&:hover': { bgcolor: '#D97706' } }}
        >
          Add Inspector
        </Button>
      </Box>
      
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          Inspectors defined here will be available for selection when creating cargos.
          Deactivated inspectors won't appear in dropdowns but existing data using them will remain intact.
        </Typography>
      </Alert>

      <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <Table size="small" sx={{ minWidth: 700 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8FAFC' }}>
              <TableCell sx={{ fontWeight: 600 }}>Order</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {inspectors.map((inspector) => (
              <TableRow 
                key={inspector.id} 
                hover
                sx={{ 
                  bgcolor: inspector.is_active ? 'white' : '#F8FAFC',
                  opacity: inspector.is_active ? 1 : 0.7
                }}
              >
                <TableCell>{inspector.sort_order}</TableCell>
                <TableCell>
                  <Chip 
                    label={inspector.code} 
                    size="small" 
                    sx={{ 
                      fontFamily: 'monospace', 
                      fontWeight: 600,
                      bgcolor: '#FEF3C7',
                      color: '#92400E'
                    }} 
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{inspector.name}</TableCell>
                <TableCell sx={{ color: 'text.secondary', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {inspector.description || '-'}
                </TableCell>
                <TableCell>
                  <Chip
                    label={inspector.is_active ? 'Active' : 'Inactive'}
                    size="small"
                    color={inspector.is_active ? 'success' : 'default'}
                    onClick={() => handleToggleInspectorActive(inspector)}
                    sx={{ cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => handleOpenInspectorDialog(inspector)}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => handleDeleteInspector(inspector)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {inspectors.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">Loading inspectors...</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Inspector Edit/Create Dialog */}
      <Dialog
        open={inspectorDialog.open}
        onClose={() => setInspectorDialog({ open: false, editing: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {inspectorDialog.editing ? 'Edit Inspector' : 'Add New Inspector'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Inspector Code"
                value={inspectorForm.code}
                onChange={(e) => setInspectorForm({ ...inspectorForm, code: e.target.value.toUpperCase() })}
                helperText="Short identifier (e.g., SGS)"
                required
                inputProps={{ maxLength: 20 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Sort Order"
                type="number"
                value={inspectorForm.sort_order}
                onChange={(e) => setInspectorForm({ ...inspectorForm, sort_order: parseInt(e.target.value) || 0 })}
                helperText="Display order in lists"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Inspector Name"
                value={inspectorForm.name}
                onChange={(e) => setInspectorForm({ ...inspectorForm, name: e.target.value })}
                helperText="Full name (e.g., SGS SA)"
                required
                inputProps={{ maxLength: 100 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={inspectorForm.description}
                onChange={(e) => setInspectorForm({ ...inspectorForm, description: e.target.value })}
                helperText="Optional description"
                multiline
                rows={2}
                inputProps={{ maxLength: 255 }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={inspectorForm.is_active ? 'active' : 'inactive'}
                  label="Status"
                  onChange={(e) => setInspectorForm({ ...inspectorForm, is_active: e.target.value === 'active' })}
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInspectorDialog({ open: false, editing: null })}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSaveInspector} 
            disabled={loading || !inspectorForm.code || !inspectorForm.name}
          >
            {inspectorDialog.editing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
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
          <Tab label="Users" icon={<ManageAccounts />} iconPosition="start" />
          <Tab label="Products" icon={<Inventory />} iconPosition="start" />
          <Tab label="Load Ports" icon={<LocalShipping />} iconPosition="start" />
          <Tab label="Inspectors" icon={<People />} iconPosition="start" />
          <Tab label="Customers" icon={<People />} iconPosition="start" />
          <Tab label="Contracts" icon={<Description />} iconPosition="start" />
          <Tab label="Quarterly Plans" icon={<CalendarMonth />} iconPosition="start" />
          <Tab label="Monthly Plans" icon={<CalendarMonth />} iconPosition="start" />
          <Tab label="Cargos" icon={<LocalShipping />} iconPosition="start" />
          <Tab label="Audit Logs" icon={<History />} iconPosition="start" />
          <Tab label="Integrity Check" icon={<Shield />} iconPosition="start" />
          <Tab label="Recycle Bin" icon={<DeleteSweep />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <Box>
        {activeTab === 0 && renderOverview()}
        {activeTab === 1 && <UserManagement />}
        {activeTab === 2 && renderProductsTable()}
        {activeTab === 3 && renderLoadPortsTable()}
        {activeTab === 4 && renderInspectorsTable()}
        {activeTab === 5 && renderCustomersTable()}
        {activeTab === 6 && renderContractsTable()}
        {activeTab === 7 && renderQuarterlyPlansTable()}
        {activeTab === 8 && renderMonthlyPlansTable()}
        {activeTab === 9 && renderCargosTable()}
        {activeTab === 10 && renderAuditLogs()}
        {activeTab === 11 && renderIntegrityCheck()}
        {activeTab === 12 && <RecycleBin />}
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
          <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
            <Typography variant="body2">
              🔒 <strong>Protected fields</strong> (gray background) are system-generated and cannot be modified.
            </Typography>
          </Alert>
          <Grid container spacing={2}>
            {Object.entries(editDialog.data).map(([key, value]) => {
              // Check if this is a protected field
              const entityProtectedFields = protectedFields[editDialog.entity] || []
              const isProtected = entityProtectedFields.includes(key)
              
              // Also mark lookup fields as read-only (they come from joins)
              const lookupFields = ['customer_name', 'contract_number', 'product_name']
              const isLookup = lookupFields.includes(key) && !['contracts', 'quarterly-plans', 'monthly-plans'].includes(editDialog.entity)
              
              const isDisabled = isProtected || isLookup
              
              // Handle JSON fields
              if (typeof value === 'object' && value !== null) {
                return (
                  <Grid item xs={12} key={key}>
                    <TextField
                      fullWidth
                      label={
                        isProtected 
                          ? `🔒 ${key.replace(/_/g, ' ')} (protected)` 
                          : key.replace(/_/g, ' ')
                      }
                      value={JSON.stringify(value, null, 2)}
                      onChange={(e) => {
                        if (isDisabled) return
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
                      disabled={isDisabled}
                      sx={{
                        '& .MuiInputBase-root': {
                          bgcolor: isDisabled ? '#F1F5F9' : 'white',
                        },
                        '& .MuiInputBase-input.Mui-disabled': {
                          WebkitTextFillColor: '#64748B',
                        }
                      }}
                    />
                  </Grid>
                )
              }
              return (
                <Grid item xs={12} sm={6} key={key}>
                  <TextField
                    fullWidth
                    label={
                      isProtected 
                        ? `🔒 ${key.replace(/_/g, ' ')} (protected)` 
                        : isLookup
                        ? `${key.replace(/_/g, ' ')} (lookup)`
                        : key.replace(/_/g, ' ')
                    }
                    value={value?.toString() || ''}
                    onChange={(e) => {
                      if (isDisabled) return
                      setEditDialog(prev => ({
                        ...prev,
                        data: { ...prev.data, [key]: e.target.value }
                      }))
                    }}
                    size="small"
                    disabled={isDisabled}
                    sx={{
                      '& .MuiInputBase-root': {
                        bgcolor: isDisabled ? '#F1F5F9' : 'white',
                      },
                      '& .MuiInputBase-input.Mui-disabled': {
                        WebkitTextFillColor: '#64748B',
                      }
                    }}
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

