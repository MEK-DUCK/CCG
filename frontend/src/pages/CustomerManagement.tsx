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
} from '@mui/material'
import { Add, Edit, Delete } from '@mui/icons-material'
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
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Customer Management</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpen()}
        >
          Add Customer
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Customer ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <Typography variant="body2" color="text.secondary">
                    Loading customers...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No customers found. Click "Add Customer" to create one.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>{customer.customer_id}</TableCell>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleOpen(customer)}
                      color="primary"
                    >
                      <Edit />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(customer.id)}
                      color="error"
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Customer Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={!formData.name || isSubmitting}>
            {isSubmitting ? 'Saving...' : editingCustomer ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

