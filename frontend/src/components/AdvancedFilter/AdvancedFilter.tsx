import { useState } from 'react'
import {
  Box,
  Drawer,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Slider,
  Collapse,
  Divider,
  IconButton,
} from '@mui/material'
import { ExpandMore, ExpandLess, Close } from '@mui/icons-material'
import type { FilterConfig } from './types'
import type { CargoStatus, ContractType, PaymentMethod } from '../../types'
import { formatStatusLabel, IN_ROAD_STATUS_VALUE } from '../../utils/statusUtils'

interface AdvancedFilterProps {
  open: boolean
  onClose: () => void
  filters: FilterConfig
  onFiltersChange: (filters: FilterConfig) => void
  customers: Array<{ id: number; name: string }>
  contracts: Array<{ id: number; contract_number: string }>
  products?: string[]
  isMobile?: boolean
}

const CARGO_STATUSES: CargoStatus[] = [
  'Planned',
  'Loading',
  'Pending Nomination',
  IN_ROAD_STATUS_VALUE,
  'Completed Loading',
]

const CONTRACT_TYPES: ContractType[] = ['FOB', 'CIF']
const PAYMENT_METHODS: PaymentMethod[] = ['T/T', 'LC']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export default function AdvancedFilter({
  open,
  onClose,
  filters,
  onFiltersChange,
  customers,
  contracts,
  products = [],
  isMobile = false,
}: AdvancedFilterProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    search: true,
    basic: true,
    dates: false,
    quantity: false,
  })

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const updateFilter = (key: keyof FilterConfig, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    })
  }

  const handleMultiSelectChange = (
    key: 'customers' | 'contracts' | 'products' | 'statuses' | 'contractTypes' | 'paymentMethods' | 'years' | 'months',
    value: any
  ) => {
    const newValue = typeof value === 'string' ? value.split(',') : value
    updateFilter(key, newValue)
  }

  const handleQuantityRangeChange = (newValue: number | number[]) => {
    const [min, max] = Array.isArray(newValue) ? newValue : [0, newValue]
    updateFilter('quantityRange', {
      min: min === 0 ? null : min,
      max: max === 200 ? null : max,
    })
  }

  const content = (
    <Box sx={{ width: isMobile ? '100%' : 400, p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Advanced Filters</Typography>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </Box>

      {/* Search Text */}
      <Box sx={{ mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1,
            cursor: 'pointer',
          }}
          onClick={() => toggleSection('search')}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Search
          </Typography>
          {expandedSections.search ? <ExpandLess /> : <ExpandMore />}
        </Box>
        <Collapse in={expandedSections.search}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search vessel, contract, customer..."
            value={filters.searchText || ''}
            onChange={(e) => updateFilter('searchText', e.target.value)}
            sx={{ mt: 1 }}
          />
        </Collapse>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Basic Filters */}
      <Box sx={{ mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1,
            cursor: 'pointer',
          }}
          onClick={() => toggleSection('basic')}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Basic Filters
          </Typography>
          {expandedSections.basic ? <ExpandLess /> : <ExpandMore />}
        </Box>
        <Collapse in={expandedSections.basic}>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Customers */}
            <FormControl fullWidth size="small">
              <InputLabel>Customers</InputLabel>
              <Select
                multiple
                value={filters.customers || []}
                label="Customers"
                onChange={(e) => handleMultiSelectChange('customers', e.target.value)}
                renderValue={(selected) => {
                  if (selected.length === 0) return 'All Customers'
                  if (selected.length === 1) {
                    const customer = customers.find((c) => c.id === selected[0])
                    return customer?.name || selected[0]
                  }
                  return `${selected.length} selected`
                }}
              >
                {customers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    <Checkbox checked={(filters.customers || []).includes(customer.id)} />
                    <ListItemText primary={customer.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Contracts */}
            <FormControl fullWidth size="small">
              <InputLabel>Contracts</InputLabel>
              <Select
                multiple
                value={filters.contracts || []}
                label="Contracts"
                onChange={(e) => handleMultiSelectChange('contracts', e.target.value)}
                renderValue={(selected) => {
                  if (selected.length === 0) return 'All Contracts'
                  if (selected.length === 1) {
                    const contract = contracts.find((c) => c.id === selected[0])
                    return contract?.contract_number || selected[0]
                  }
                  return `${selected.length} selected`
                }}
              >
                {contracts.map((contract) => (
                  <MenuItem key={contract.id} value={contract.id}>
                    <Checkbox checked={(filters.contracts || []).includes(contract.id)} />
                    <ListItemText primary={contract.contract_number} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Products */}
            {products.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel>Products</InputLabel>
                <Select
                  multiple
                  value={filters.products || []}
                  label="Products"
                  onChange={(e) => handleMultiSelectChange('products', e.target.value)}
                  renderValue={(selected) => {
                    if (selected.length === 0) return 'All Products'
                    if (selected.length === 1) return selected[0]
                    return `${selected.length} selected`
                  }}
                >
                  {products.map((product) => (
                    <MenuItem key={product} value={product}>
                      <Checkbox checked={(filters.products || []).includes(product)} />
                      <ListItemText primary={product} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Statuses */}
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                multiple
                value={filters.statuses || []}
                label="Status"
                onChange={(e) => handleMultiSelectChange('statuses', e.target.value)}
                renderValue={(selected) => {
                  if (selected.length === 0) return 'All Statuses'
                  if (selected.length === 1) return formatStatusLabel(selected[0])
                  return `${selected.length} selected`
                }}
              >
                {CARGO_STATUSES.map((status) => (
                  <MenuItem key={status} value={status}>
                    <Checkbox checked={(filters.statuses || []).includes(status)} />
                    <ListItemText primary={formatStatusLabel(status)} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Contract Types */}
            <FormControl fullWidth size="small">
              <InputLabel>Contract Type</InputLabel>
              <Select
                multiple
                value={filters.contractTypes || []}
                label="Contract Type"
                onChange={(e) => handleMultiSelectChange('contractTypes', e.target.value)}
                renderValue={(selected) => {
                  if (selected.length === 0) return 'All Types'
                  if (selected.length === 1) return selected[0]
                  return `${selected.length} selected`
                }}
              >
                {CONTRACT_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    <Checkbox checked={(filters.contractTypes || []).includes(type)} />
                    <ListItemText primary={type} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Payment Methods */}
            <FormControl fullWidth size="small">
              <InputLabel>Payment Method</InputLabel>
              <Select
                multiple
                value={filters.paymentMethods || []}
                label="Payment Method"
                onChange={(e) => handleMultiSelectChange('paymentMethods', e.target.value)}
                renderValue={(selected) => {
                  if (selected.length === 0) return 'All Methods'
                  if (selected.length === 1) return selected[0]
                  return `${selected.length} selected`
                }}
              >
                {PAYMENT_METHODS.map((method) => (
                  <MenuItem key={method} value={method}>
                    <Checkbox checked={(filters.paymentMethods || []).includes(method)} />
                    <ListItemText primary={method} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Years */}
            <FormControl fullWidth size="small">
              <InputLabel>Years</InputLabel>
              <Select
                multiple
                value={filters.years || []}
                label="Years"
                onChange={(e) => handleMultiSelectChange('years', e.target.value)}
                renderValue={(selected) => {
                  if (selected.length === 0) return 'All Years'
                  if (selected.length === 1) return selected[0].toString()
                  return `${selected.length} selected`
                }}
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                  <MenuItem key={year} value={year}>
                    <Checkbox checked={(filters.years || []).includes(year)} />
                    <ListItemText primary={year.toString()} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Months */}
            <FormControl fullWidth size="small">
              <InputLabel>Months</InputLabel>
              <Select
                multiple
                value={filters.months || []}
                label="Months"
                onChange={(e) => handleMultiSelectChange('months', e.target.value)}
                renderValue={(selected) => {
                  if (selected.length === 0) return 'All Months'
                  if (selected.length === 1) return MONTHS[selected[0] - 1]
                  return `${selected.length} selected`
                }}
              >
                {MONTHS.map((month, index) => (
                  <MenuItem key={index + 1} value={index + 1}>
                    <Checkbox checked={(filters.months || []).includes(index + 1)} />
                    <ListItemText primary={month} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Collapse>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Quantity Range */}
      <Box sx={{ mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1,
            cursor: 'pointer',
          }}
          onClick={() => toggleSection('quantity')}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Quantity Range
          </Typography>
          {expandedSections.quantity ? <ExpandLess /> : <ExpandMore />}
        </Box>
        <Collapse in={expandedSections.quantity}>
          <Box sx={{ mt: 2, px: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {filters.quantityRange?.min ?? 0} - {filters.quantityRange?.max ?? '∞'} KT
            </Typography>
            <Slider
              value={[
                filters.quantityRange?.min ?? 0,
                filters.quantityRange?.max ?? 200,
              ]}
              onChange={(_, newValue) => handleQuantityRangeChange(newValue)}
              min={0}
              max={200}
              step={5}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value} KT`}
            />
          </Box>
        </Collapse>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
        <Button variant="outlined" fullWidth onClick={onClose}>
          Apply Filters
        </Button>
        <Button
          variant="text"
          fullWidth
          onClick={() => {
            onFiltersChange({})
            onClose()
          }}
        >
          Reset
        </Button>
      </Box>
    </Box>
  )

  if (isMobile) {
    return (
      <Drawer anchor="bottom" open={open} onClose={onClose} PaperProps={{ sx: { maxHeight: '80vh' } }}>
        {content}
      </Drawer>
    )
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 400 } }}>
      {content}
    </Drawer>
  )
}

