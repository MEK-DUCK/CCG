import { Box, Chip, Typography, Button } from '@mui/material'
import { Clear } from '@mui/icons-material'
import type { FilterConfig } from './types'

interface FilterChipsProps {
  filters: FilterConfig
  customers: Array<{ id: number; name: string }>
  contracts: Array<{ id: number; contract_number: string }>
  onRemoveFilter: (filterKey: string, value?: any) => void
  onClearAll: () => void
  resultCount?: number
  totalCount?: number
}

export default function FilterChips({
  filters,
  customers,
  contracts,
  onRemoveFilter,
  onClearAll,
  resultCount,
  totalCount,
}: FilterChipsProps) {
  const activeFilters: Array<{ key: string; label: string; value: any }> = []

  // Search text
  if (filters.searchText) {
    activeFilters.push({
      key: 'searchText',
      label: `Search: "${filters.searchText}"`,
      value: filters.searchText,
    })
  }

  // Customers
  if (filters.customers && filters.customers.length > 0) {
    filters.customers.forEach((customerId) => {
      const customer = customers.find((c) => c.id === customerId)
      activeFilters.push({
        key: 'customers',
        label: `Customer: ${customer?.name || customerId}`,
        value: customerId,
      })
    })
  }

  // Contracts
  if (filters.contracts && filters.contracts.length > 0) {
    filters.contracts.forEach((contractId) => {
      const contract = contracts.find((c) => c.id === contractId)
      activeFilters.push({
        key: 'contracts',
        label: `Contract: ${contract?.contract_number || contractId}`,
        value: contractId,
      })
    })
  }

  // Products
  if (filters.products && filters.products.length > 0) {
    filters.products.forEach((product) => {
      activeFilters.push({
        key: 'products',
        label: `Product: ${product}`,
        value: product,
      })
    })
  }

  // Statuses
  if (filters.statuses && filters.statuses.length > 0) {
    filters.statuses.forEach((status) => {
      activeFilters.push({
        key: 'statuses',
        label: `Status: ${status}`,
        value: status,
      })
    })
  }

  // Contract Types
  if (filters.contractTypes && filters.contractTypes.length > 0) {
    filters.contractTypes.forEach((type) => {
      activeFilters.push({
        key: 'contractTypes',
        label: `Type: ${type}`,
        value: type,
      })
    })
  }

  // Payment Methods
  if (filters.paymentMethods && filters.paymentMethods.length > 0) {
    filters.paymentMethods.forEach((method) => {
      activeFilters.push({
        key: 'paymentMethods',
        label: `Payment: ${method}`,
        value: method,
      })
    })
  }

  // Years
  if (filters.years && filters.years.length > 0) {
    filters.years.forEach((year) => {
      activeFilters.push({
        key: 'years',
        label: `Year: ${year}`,
        value: year,
      })
    })
  }

  // Months
  if (filters.months && filters.months.length > 0) {
    filters.months.forEach((month) => {
      const monthName = new Date(2000, month - 1).toLocaleString('default', { month: 'long' })
      activeFilters.push({
        key: 'months',
        label: `Month: ${monthName}`,
        value: month,
      })
    })
  }

  // Quantity Range
  if (filters.quantityRange) {
    if (filters.quantityRange.min !== null || filters.quantityRange.max !== null) {
      const min = filters.quantityRange.min ?? 0
      const max = filters.quantityRange.max ?? '∞'
      activeFilters.push({
        key: 'quantityRange',
        label: `Quantity: ${min} - ${max} KT`,
        value: filters.quantityRange,
      })
    }
  }

  // Date Range
  if (filters.dateRange) {
    if (filters.dateRange.start || filters.dateRange.end) {
      const start = filters.dateRange.start
        ? new Date(filters.dateRange.start).toLocaleDateString()
        : 'Any'
      const end = filters.dateRange.end
        ? new Date(filters.dateRange.end).toLocaleDateString()
        : 'Any'
      activeFilters.push({
        key: 'dateRange',
        label: `Date: ${start} to ${end}`,
        value: filters.dateRange,
      })
    }
  }

  if (activeFilters.length === 0) {
    return null
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        alignItems: 'center',
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        mb: 2,
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
        Active Filters:
      </Typography>
      {activeFilters.map((filter, index) => (
        <Chip
          key={`${filter.key}-${index}`}
          label={filter.label}
          onDelete={() => onRemoveFilter(filter.key, filter.value)}
          size="small"
          sx={{ mr: 0.5 }}
        />
      ))}
      <Button
        size="small"
        startIcon={<Clear />}
        onClick={onClearAll}
        sx={{ ml: 'auto' }}
      >
        Clear All
      </Button>
      {resultCount !== undefined && totalCount !== undefined && (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
          Showing {resultCount} of {totalCount}
        </Typography>
      )}
    </Box>
  )
}

