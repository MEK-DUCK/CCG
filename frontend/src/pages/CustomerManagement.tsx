import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  IconButton,
  TablePagination,
  CircularProgress,
  Tooltip,
  InputAdornment,
  Chip,
} from '@mui/material'
import { Add, Edit, Delete, People, Search, Refresh, Business } from '@mui/icons-material'
import { customerAPI } from '../api/client'
import { useToast } from '../contexts/ToastContext'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useResizableColumns, ColumnConfig } from '../hooks/useResizableColumns'
import ResizableTableCell from '../components/ResizableTableCell'
import type { Customer } from '../types'

// Column configuration for resizable columns
const CUSTOMER_COLUMNS: ColumnConfig[] = [
  { id: 'id', label: 'Customer ID', defaultWidth: 200, minWidth: 100 },
  { id: 'name', label: 'Name', defaultWidth: 300, minWidth: 150 },
  { id: 'actions', label: 'Actions', defaultWidth: 120, minWidth: 100 },
]

// Stat card component
function StatCard({
  title,
  value,
  icon: Icon,
  gradient
}: {
  title: string
  value: string | number
  icon: React.ElementType
  gradient: string
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        background: gradient,
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 25px -5px rgba(0, 0, 0, 0.2)',
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          right: 0,
          width: '100px',
          height: '100px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '50%',
          transform: 'translate(30%, -30%)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5, fontWeight: 500 }}>
            {title}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {value}
          </Typography>
        </Box>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            bgcolor: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon sx={{ fontSize: 24 }} />
        </Box>
      </Box>
    </Paper>
  )
}

export default function CustomerManagement() {
  const { showError } = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Resizable columns
  const { columnWidths, handleResizeStart } = useResizableColumns('customers', CUSTOMER_COLUMNS)
  const [open, setOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState({
    name: '',
  })
  const [isLoading, setIsLoading] = useState(false)

  // Pagination
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  // Filtered customers based on search
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers
    const query = searchQuery.toLowerCase()
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.customer_id?.toLowerCase().includes(query)
    )
  }, [customers, searchQuery])

  useEffect(() => {
    // Only load once on mount - use a ref to prevent duplicate calls
    let mounted = true
    if (mounted && !isLoading) {
      loadCustomers()
    }
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadCustomers = async () => {
    // Prevent duplicate calls
    if (isLoading) {
      console.log('Already loading, skipping duplicate call')
      return
    }

    setIsLoading(true)
    try {
      console.log('Loading customers...')
      const response = await customerAPI.getAll()

      if (response.data && Array.isArray(response.data)) {
        setCustomers(response.data)
      } else {
        console.warn('Response data is not an array:', response.data)
        setCustomers([])
      }
    } catch (error: any) {
      console.error('Error loading customers:', error)
      if (error?.code !== 'ECONNABORTED') {
        showError(`Error loading customers: ${error?.message || 'Unknown error'}`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpen = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer)
      setFormData({
        name: customer.name,
      })
    } else {
      setEditingCustomer(null)
      setFormData({
        name: '',
      })
    }
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditingCustomer(null)
  }

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (isSubmitting) {
      return
    }

    if (!formData.name || formData.name.trim() === '') {
      showError('Please enter a customer name')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingCustomer) {
        await customerAPI.update(editingCustomer.id, formData)
      } else {
        await customerAPI.create(formData)
      }

      handleClose()
      await loadCustomers()
    } catch (error: any) {
      console.error('Error saving customer:', error)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error occurred'
      showError(`Error saving customer: ${errorMessage}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Keyboard shortcuts for dialog: Ctrl+S to save, Escape to close
  useKeyboardShortcuts({
    onSave: open ? handleSubmit : undefined,
    onEscape: open ? handleClose : undefined,
    enabled: open,
  })

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await customerAPI.delete(id)
        loadCustomers()
      } catch (error) {
        console.error('Error deleting customer:', error)
        showError('Error deleting customer. Please try again.')
      }
    }
  }

  // Reset pagination when search changes
  useEffect(() => {
    setPage(0)
  }, [searchQuery])

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Modern Header */}
      <Box sx={{ mb: 4 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 3,
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                }}
              >
                <People sx={{ color: 'white', fontSize: 22 }} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#1E293B' }}>
                Customer Management
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: '#64748B', ml: 7 }}>
              Manage your customer database and relationships
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={loadCustomers}
              disabled={isLoading}
              sx={{
                borderColor: '#E2E8F0',
                color: '#475569',
                '&:hover': {
                  borderColor: '#CBD5E1',
                  bgcolor: '#F8FAFC',
                },
              }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => handleOpen()}
              sx={{
                px: 3,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)',
                  boxShadow: '0 6px 16px rgba(59, 130, 246, 0.4)',
                },
              }}
            >
              Add Customer
            </Button>
          </Box>
        </Box>

        {/* Stat Card */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2.5, mb: 3 }}>
          <StatCard
            title="Total Customers"
            value={customers.length}
            icon={Business}
            gradient="linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)"
          />
          <StatCard
            title="Active This Month"
            value={customers.length}
            icon={People}
            gradient="linear-gradient(135deg, #10B981 0%, #059669 100%)"
          />
          <StatCard
            title="Search Results"
            value={filteredCustomers.length}
            icon={Search}
            gradient="linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)"
          />
        </Box>

        {/* Search Bar */}
        <TextField
          placeholder="Search customers by name or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{
            width: { xs: '100%', sm: 350 },
            '& .MuiOutlinedInput-root': {
              bgcolor: 'white',
              borderRadius: 2,
              '& fieldset': {
                borderColor: '#E2E8F0',
              },
              '&:hover fieldset': {
                borderColor: '#CBD5E1',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#3B82F6',
              },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ color: '#94A3B8', fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Table */}
      <Paper
        elevation={0}
        sx={{
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
          borderRadius: 3,
        }}
      >
        <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Table sx={{ minWidth: 500 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                <ResizableTableCell
                  columnId="id"
                  width={columnWidths['id']}
                  minWidth={CUSTOMER_COLUMNS.find(c => c.id === 'id')?.minWidth}
                  onResizeStart={handleResizeStart}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#475569' }}>
                    Customer ID
                  </Typography>
                </ResizableTableCell>
                <ResizableTableCell
                  columnId="name"
                  width={columnWidths['name']}
                  minWidth={CUSTOMER_COLUMNS.find(c => c.id === 'name')?.minWidth}
                  onResizeStart={handleResizeStart}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#475569' }}>
                    Name
                  </Typography>
                </ResizableTableCell>
                <ResizableTableCell
                  columnId="actions"
                  width={columnWidths['actions']}
                  minWidth={CUSTOMER_COLUMNS.find(c => c.id === 'actions')?.minWidth}
                  onResizeStart={handleResizeStart}
                  align="right"
                  resizable={false}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#475569' }}>
                    Actions
                  </Typography>
                </ResizableTableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 10 }}>
                    <CircularProgress size={40} sx={{ mb: 2, color: '#3B82F6' }} />
                    <Typography variant="body1" sx={{ fontWeight: 500, color: '#475569' }}>
                      Loading customers...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 10 }}>
                    <Box sx={{
                      width: 80,
                      height: 80,
                      borderRadius: 4,
                      background: 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mx: 'auto',
                      mb: 2,
                    }}>
                      <People sx={{ fontSize: 36, color: '#94A3B8' }} />
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#475569', mb: 0.5 }}>
                      {searchQuery ? 'No customers found' : 'No customers yet'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {searchQuery
                        ? 'Try adjusting your search query'
                        : 'Click "Add Customer" to create your first customer.'
                      }
                    </Typography>
                    {!searchQuery && (
                      <Button
                        variant="outlined"
                        startIcon={<Add />}
                        onClick={() => handleOpen()}
                        sx={{ borderRadius: 2 }}
                      >
                        Add Your First Customer
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                (rowsPerPage > 0
                  ? filteredCustomers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  : filteredCustomers
                ).map((customer, index) => (
                  <TableRow
                    key={customer.id}
                    sx={{
                      '&:hover': { bgcolor: '#F8FAFC' },
                      '&:last-child td': { borderBottom: 0 },
                      bgcolor: index % 2 === 0 ? 'white' : '#FAFBFC',
                    }}
                  >
                    <TableCell sx={{ width: columnWidths['id'] }}>
                      <Chip
                        label={customer.customer_id}
                        size="small"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          bgcolor: '#EEF2FF',
                          color: '#4F46E5',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ width: columnWidths['name'] }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 2,
                            background: `linear-gradient(135deg, ${getCustomerColor(customer.name)} 0%, ${getCustomerColor(customer.name)}dd 100%)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 700,
                            fontSize: '0.875rem',
                          }}
                        >
                          {customer.name.charAt(0).toUpperCase()}
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B' }}>
                          {customer.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ width: columnWidths['actions'] }} align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="Edit customer">
                          <IconButton
                            size="small"
                            onClick={() => handleOpen(customer)}
                            sx={{
                              color: '#3B82F6',
                              bgcolor: '#EFF6FF',
                              '&:hover': { bgcolor: '#DBEAFE' }
                            }}
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete customer">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(customer.id)}
                            sx={{
                              color: '#EF4444',
                              bgcolor: '#FEF2F2',
                              '&:hover': { bgcolor: '#FEE2E2' }
                            }}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {filteredCustomers.length > 0 && (
          <TablePagination
            rowsPerPageOptions={[25, 50, { label: 'All', value: -1 }]}
            component="div"
            count={filteredCustomers.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10))
              setPage(0)
            }}
            sx={{
              borderTop: '1px solid #E2E8F0',
              '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                color: '#64748B',
              },
            }}
          />
        )}
      </Paper>

      {/* Modern Dialog */}
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
          }
        }}
      >
        <Box
          sx={{
            background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
            px: 3,
            py: 2.5,
            color: 'white',
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
            {editingCustomer ? 'Update customer information' : 'Create a new customer record'}
          </Typography>
        </Box>
        <DialogContent sx={{ pt: 3 }}>
          <TextField
            label="Customer Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            fullWidth
            autoFocus
            placeholder="Enter customer name"
            sx={{
              mt: 1,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={handleClose}
            disabled={isSubmitting}
            sx={{
              color: '#64748B',
              borderRadius: 2,
              px: 3,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.name || isSubmitting}
            sx={{
              minWidth: 120,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)',
              },
            }}
          >
            {isSubmitting ? 'Saving...' : editingCustomer ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// Helper function to generate consistent colors for customers
function getCustomerColor(name: string): string {
  const colors = [
    '#3B82F6', // blue
    '#10B981', // green
    '#8B5CF6', // purple
    '#F59E0B', // amber
    '#EF4444', // red
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#84CC16', // lime
  ]
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
}
