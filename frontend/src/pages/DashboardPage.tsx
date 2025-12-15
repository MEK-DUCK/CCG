import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  TextField,
  InputAdornment,
} from '@mui/material'
import { Visibility, Search } from '@mui/icons-material'
import { contractAPI, customerAPI } from '../api/client'
import type { Contract, Customer } from '../types'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [contractsRes, customersRes] = await Promise.all([
        contractAPI.getAll(),
        customerAPI.getAll(),
      ])
      setContracts(contractsRes.data || [])
      setCustomers(customersRes.data || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getCustomerName = (customerId: number) => {
    const customer = customers.find(c => c.id === customerId)
    return customer?.name || 'Unknown'
  }

  // Filter contracts based on search text
  const filteredContracts = contracts.filter((contract) => {
    if (!searchText.trim()) return true
    
    const searchLower = searchText.toLowerCase().trim()
    const customerName = getCustomerName(contract.customer_id).toLowerCase()
    const contractNumber = contract.contract_number.toLowerCase()
    const products = contract.products && Array.isArray(contract.products)
      ? contract.products.map((p: any) => p.name || '').join(' ').toLowerCase()
      : ''
    const contractType = contract.contract_type.toLowerCase()
    
    return (
      customerName.includes(searchLower) ||
      contractNumber.includes(searchLower) ||
      products.includes(searchLower) ||
      contractType.includes(searchLower)
    )
  })

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Contract Dashboards
        </Typography>
        <TextField
          placeholder="Search contracts..."
          variant="outlined"
          size="small"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 300 }}
        />
      </Box>

      {contracts.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No contracts found. Create a contract to view its dashboard.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Contract Number</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Products</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Period</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredContracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {searchText.trim() ? 'No contracts match your search.' : 'No contracts found.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredContracts.map((contract) => (
                <TableRow key={contract.id} hover>
                  <TableCell>{contract.contract_number}</TableCell>
                  <TableCell>{getCustomerName(contract.customer_id)}</TableCell>
                  <TableCell>
                    <Chip
                      label={contract.contract_type}
                      color={contract.contract_type === 'FOB' ? 'primary' : 'secondary'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {contract.products && contract.products.length > 0
                      ? contract.products.map((p: any) => p.name || 'Unknown').join(', ')
                      : 'No products'}
                  </TableCell>
                  <TableCell>
                    {new Date(contract.start_period).toLocaleDateString()} - {new Date(contract.end_period).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Visibility />}
                      onClick={() => navigate(`/contracts/${contract.id}/dashboard`)}
                    >
                      View Dashboard
                    </Button>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

