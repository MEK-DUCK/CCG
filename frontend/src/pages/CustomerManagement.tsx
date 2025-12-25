import { useState, useEffect } from 'react'
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
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  IconButton,
  TablePagination,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import { Add, Edit, Delete, People } from '@mui/icons-material'
import { customerAPI } from '../api/client'
import type { Customer } from '../types'

export default function CustomerManagement() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [open, setOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState({
    name: '',
  })
  const [isLoading, setIsLoading] = useState(false)

  // Pagination
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)

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
      console.log('⏸️ Already loading, skipping duplicate call')
      return
    }
    
    setIsLoading(true)
    try {
      console.log('🔄 Loading customers...')
      const response = await customerAPI.getAll()
      console.log('✅ Response received:', response.status, response.data?.length || 0, 'customers')
      console.log('✅ Customer data:', response.data)
      
      if (response.data && Array.isArray(response.data)) {
        setCustomers(response.data)
        console.log('✅ State updated with', response.data.length, 'customers')
      } else {
        console.warn('⚠️ Response data is not an array:', response.data)
        setCustomers([])
      }
    } catch (error: any) {
      console.error('❌ Error loading customers:', error)
      console.error('❌ Error details:', {
        message: error?.message,
        code: error?.code,
        response: error?.response,
        request: error?.request
      })
      if (error?.code !== 'ECONNABORTED') {
        alert(`Error loading customers: ${error?.message || 'Unknown error'}`)
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
      alert('Please enter a customer name')
      return
    }
    
    setIsSubmitting(true)
    try {
      if (editingCustomer) {
        await customerAPI.update(editingCustomer.id, formData)
      } else {
        const response = await customerAPI.create(formData)
        console.log('✅ Customer created:', response.data)
      }
      
      handleClose()
      // Reload immediately after successful creation
      await loadCustomers()
      console.log('✅ Customer list reloaded')
    } catch (error: any) {
      console.error('Error saving customer:', error)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error occurred'
      alert(`Error saving customer: ${errorMessage}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await customerAPI.delete(id)
        loadCustomers()
      } catch (error) {
        console.error('Error deleting customer:', error)
        alert('Error deleting customer. Please try again.')
      }
    }
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start', 
          mb: 4,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1E293B', mb: 0.5 }}>
            Customer Management
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B' }}>
            Manage your customer database
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpen()}
          sx={{ 
            px: 3,
            py: 1,
            fontWeight: 600,
            bgcolor: '#2563EB',
            '&:hover': {
              bgcolor: '#1D4ED8',
            },
          }}
        >
          Add Customer
        </Button>
      </Box>

      {/* Table */}
      <Paper sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 200 }}>Customer ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell sx={{ width: 120 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 8 }}>
                    <CircularProgress size={32} sx={{ mb: 2 }} />
                    <Typography variant="body2" color="text.secondary" display="block">
                      Loading customers...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 8 }}>
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
                      <People sx={{ fontSize: 28, color: '#94A3B8' }} />
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500, color: '#475569', mb: 0.5 }}>
                      No customers yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Click "Add Customer" to create your first customer.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                (rowsPerPage > 0
                  ? customers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  : customers
                ).map((customer) => (
                  <TableRow key={customer.id} sx={{ '&:hover': { bgcolor: 'rgba(71, 85, 105, 0.04)' } }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#64748B' }}>
                        {customer.customer_id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#1E293B' }}>
                        {customer.name}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="Edit customer">
                          <IconButton
                            size="small"
                            onClick={() => handleOpen(customer)}
                            sx={{ 
                              color: '#475569',
                              '&:hover': { bgcolor: 'rgba(71, 85, 105, 0.1)' }
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
                              '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.1)' }
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
        {customers.length > 0 && (
          <TablePagination
            rowsPerPageOptions={[25, 50, { label: 'All', value: -1 }]}
            component="div"
            count={customers.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10))
              setPage(0)
            }}
          />
        )}
      </Paper>

      {/* Dialog */}
      <Dialog 
        open={open} 
        onClose={handleClose} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        <DialogTitle component="div" sx={{ pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {editingCustomer ? 'Update customer information' : 'Create a new customer record'}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            label="Customer Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            fullWidth
            autoFocus
            placeholder="Enter customer name"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button 
            onClick={handleClose} 
            disabled={isSubmitting}
            sx={{ color: '#64748B' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            disabled={!formData.name || isSubmitting}
            sx={{ minWidth: 100 }}
          >
            {isSubmitting ? 'Saving...' : editingCustomer ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

