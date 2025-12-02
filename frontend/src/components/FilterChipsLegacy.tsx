import { Box, Chip, Typography, Button } from '@mui/material'
import { Clear } from '@mui/icons-material'
import { formatStatusLabel } from '../utils/statusUtils'

interface FilterChipsLegacyProps {
  filterCustomer: number | null
  filterContract: number | null
  filterType: string | null
  filterProduct: string | null
  filterStatus: string | null
  searchText: string
  customers: Array<{ id: number; name: string }>
  contracts: Array<{ id: number; contract_number: string }>
  onRemoveFilter: (filterKey: string) => void
  onClearAll?: () => void
}

export default function FilterChipsLegacy({
  filterCustomer,
  filterContract,
  filterType,
  filterProduct,
  filterStatus,
  searchText,
  customers,
  contracts,
  onRemoveFilter,
  onClearAll,
}: FilterChipsLegacyProps) {
  const activeFilters: Array<{ key: string; label: string }> = []

  // Search text
  if (searchText) {
    activeFilters.push({
      key: 'searchText',
      label: `Search: "${searchText}"`,
    })
  }

  // Customer
  if (filterCustomer) {
    const customer = customers.find((c) => c.id === filterCustomer)
    activeFilters.push({
      key: 'customer',
      label: `Customer: ${customer?.name || filterCustomer}`,
    })
  }

  // Contract
  if (filterContract) {
    const contract = contracts.find((c) => c.id === filterContract)
    activeFilters.push({
      key: 'contract',
      label: `Contract: ${contract?.contract_number || filterContract}`,
    })
  }

  // Type
  if (filterType) {
    activeFilters.push({
      key: 'type',
      label: `Type: ${filterType}`,
    })
  }

  // Product
  if (filterProduct) {
    activeFilters.push({
      key: 'product',
      label: `Product: ${filterProduct}`,
    })
  }

  // Status
  if (filterStatus) {
    activeFilters.push({
      key: 'status',
      label: `Status: ${formatStatusLabel(filterStatus)}`,
    })
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
      {activeFilters.map((filter) => (
        <Chip
          key={filter.key}
          label={filter.label}
          onDelete={() => onRemoveFilter(filter.key)}
          size="small"
          sx={{ mr: 0.5 }}
        />
      ))}
      {onClearAll && (
        <Button
          size="small"
          startIcon={<Clear />}
          onClick={onClearAll}
          sx={{ ml: 'auto' }}
        >
          Clear All
        </Button>
      )}
    </Box>
  )
}

