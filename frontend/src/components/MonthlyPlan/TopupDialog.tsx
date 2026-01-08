import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
} from '@mui/material'
import { TrendingUp } from '@mui/icons-material'
import { monthlyPlanAPI, MonthlyPlanTopUpRequest } from '../../api/client'
import { useToast } from '../../contexts/ToastContext'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const getMonthName = (month: number): string => {
  return MONTH_NAMES[month - 1] || ''
}

export interface TopupEntryData {
  month: number
  year: number
  entry: {
    id?: number
    is_combi?: boolean
    product_name?: string
    quantity?: string
    combi_quantities: Record<string, string>
    _combi_product_plan_map?: Record<string, number>
  }
}

export interface TopupFormData {
  quantity: string
  authority_reference: string
  reason: string
  date: string
  selected_product: string
}

interface TopupDialogProps {
  open: boolean
  onClose: () => void
  topupEntry: TopupEntryData | null
  topupForm: TopupFormData
  onFormChange: (form: TopupFormData) => void
  isAddingTopup: boolean
  setIsAddingTopup: (value: boolean) => void
  onSuccess: () => void
}

export default function TopupDialog({
  open,
  onClose,
  topupEntry,
  topupForm,
  onFormChange,
  isAddingTopup,
  setIsAddingTopup,
  onSuccess,
}: TopupDialogProps) {
  const { showSuccess, showError } = useToast()

  const handleClose = () => {
    onClose()
  }

  const handleSubmit = async () => {
    if (!topupForm.quantity || !topupForm.authority_reference) {
      showError('Please fill in quantity and authority reference')
      return
    }

    if (!topupEntry || !topupEntry.entry.id) {
      showError('No monthly plan selected. Please close the dialog and try again.')
      return
    }

    // For combie cargos, require product selection
    if (topupEntry.entry.is_combi && !topupForm.selected_product) {
      showError('Please select which product the top-up is for')
      return
    }
    
    setIsAddingTopup(true)
    try {
      const topupData: MonthlyPlanTopUpRequest = {
        quantity: parseFloat(topupForm.quantity),
        authority_reference: topupForm.authority_reference,
        reason: topupForm.reason || undefined,
        authorization_date: topupForm.date || undefined,
      }
      
      // Determine which plan ID to use
      let planIdToUpdate: number
      if (topupEntry.entry.is_combi && topupEntry.entry._combi_product_plan_map && topupForm.selected_product) {
        // For combie entries, use the specific product's plan ID
        planIdToUpdate = topupEntry.entry._combi_product_plan_map[topupForm.selected_product]
        if (!planIdToUpdate) {
          throw new Error(`Could not find plan ID for product ${topupForm.selected_product}`)
        }
      } else {
        // For single product entries, use the entry's ID
        planIdToUpdate = topupEntry.entry.id
      }
      
      await monthlyPlanAPI.addAuthorityTopup(planIdToUpdate, topupData)
      
      handleClose()
      const productInfo = topupEntry.entry.is_combi ? ` for ${topupForm.selected_product}` : ''
      showSuccess(`Authority top-up of ${parseFloat(topupForm.quantity).toLocaleString()} KT${productInfo} added successfully!`)

      // Reload data
      onSuccess()
    } catch (error: any) {
      console.error('Error adding authority top-up:', error)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error'
      showError(`Error adding top-up: ${errorMessage}`)
    } finally {
      setIsAddingTopup(false)
    }
  }

  const getHelperText = () => {
    if (!topupEntry) return ''
    if (topupEntry.entry.is_combi && topupForm.selected_product) {
      const currentQty = parseFloat(topupEntry.entry.combi_quantities[topupForm.selected_product]) || 0
      const newQty = currentQty + (parseFloat(topupForm.quantity) || 0)
      return `Current: ${currentQty} KT → New: ${newQty} KT`
    }
    if (topupEntry.entry.is_combi) {
      return 'Select a product first'
    }
    const currentQty = parseFloat(topupEntry.entry.quantity || '0') || 0
    const newQty = currentQty + (parseFloat(topupForm.quantity) || 0)
    return `Current quantity: ${currentQty} KT → New: ${newQty} KT`
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: '#F0FDF4', borderBottom: '1px solid #D1FAE5' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingUp sx={{ color: '#10B981' }} />
          <Typography variant="h6">Authority Top-Up</Typography>
        </Box>
        {topupEntry && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Add authorized quantity increase for{' '}
            <strong>
              {getMonthName(topupEntry.month)} {topupEntry.year}
              {topupEntry.entry.is_combi ? ' (Combie)' : ` - ${topupEntry.entry.product_name}`}
            </strong>
          </Typography>
        )}
      </DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Product selector for combie cargos */}
          {topupEntry?.entry.is_combi && (
            <FormControl fullWidth required>
              <InputLabel>Select Product for Top-Up</InputLabel>
              <Select
                value={topupForm.selected_product}
                label="Select Product for Top-Up"
                onChange={(e) => onFormChange({ ...topupForm, selected_product: e.target.value })}
              >
                {Object.keys(topupEntry.entry.combi_quantities || {}).map((productName) => (
                  <MenuItem key={productName} value={productName}>
                    {productName} (Current: {topupEntry.entry.combi_quantities[productName] || 0} KT)
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary' }}>
                Choose which product this top-up is for
              </Typography>
            </FormControl>
          )}
          <TextField
            label="Top-Up Quantity (KT)"
            type="number"
            value={topupForm.quantity}
            onChange={(e) => onFormChange({ ...topupForm, quantity: e.target.value })}
            required
            fullWidth
            InputProps={{
              endAdornment: <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>KT</Typography>
            }}
            helperText={getHelperText()}
          />
          <TextField
            label="Authority Reference"
            value={topupForm.authority_reference}
            onChange={(e) => onFormChange({ ...topupForm, authority_reference: e.target.value })}
            required
            fullWidth
            placeholder="e.g., AUTH-2025-001"
            helperText="Reference number for the authorization"
          />
          <TextField
            label="Date"
            type="date"
            value={topupForm.date}
            onChange={(e) => onFormChange({ ...topupForm, date: e.target.value })}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Reason (Optional)"
            value={topupForm.reason}
            onChange={(e) => onFormChange({ ...topupForm, reason: e.target.value })}
            fullWidth
            multiline
            rows={2}
            placeholder="e.g., Customer request, market demand"
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isAddingTopup}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isAddingTopup || !topupForm.quantity || !topupForm.authority_reference || (topupEntry?.entry.is_combi && !topupForm.selected_product)}
          sx={{ 
            bgcolor: '#10B981', 
            '&:hover': { bgcolor: '#059669' } 
          }}
        >
          {isAddingTopup ? 'Adding...' : 'Add Top-Up'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

