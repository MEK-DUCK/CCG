import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  FormControlLabel,
  Checkbox,
  TextField,
  Button,
} from '@mui/material'
import { Add } from '@mui/icons-material'
import { useToast } from '../../contexts/ToastContext'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const getMonthName = (month: number): string => {
  return MONTH_NAMES[month - 1] || ''
}

export interface CrossContractEntryData {
  month: number
  year: number
  entryIndex: number
  entry: {
    id?: number
  }
}

export interface CrossContractItem {
  contractId: number
  contractNumber: string
  monthlyPlanId: number
  productName: string
  quantity: string
}

export interface EligibleContract {
  id: number
  contract_number: string
  contract_type: string
  monthly_plans: Array<{
    id: number
    product_name: string
    month_quantity: number
    has_cargo: boolean
  }>
}

interface CrossContractCombiDialogProps {
  open: boolean
  onClose: () => void
  crossContractEntry: CrossContractEntryData | null
  contractType: 'FOB' | 'CIF' | null
  isLoadingEligible: boolean
  eligibleContracts: EligibleContract[]
  selectedItems: CrossContractItem[]
  onToggleItem: (contractId: number, contractNumber: string, monthlyPlanId: number, productName: string) => void
  onQuantityChange: (monthlyPlanId: number, quantity: string) => void
}

export default function CrossContractCombiDialog({
  open,
  onClose,
  crossContractEntry,
  contractType,
  isLoadingEligible,
  eligibleContracts,
  selectedItems,
  onToggleItem,
  onQuantityChange,
}: CrossContractCombiDialogProps) {
  const { showError, showInfo } = useToast()

  const handleCreate = () => {
    if (!crossContractEntry) return
    
    // Validate all items have quantities
    const invalidItems = selectedItems.filter(item => !item.quantity || parseFloat(item.quantity) <= 0)
    if (invalidItems.length > 0) {
      showError('Please enter quantities for all selected products')
      return
    }

    // For now, show info message - full implementation requires cargo creation
    showInfo('Cross-contract combi feature will be fully integrated in the next update.')

    onClose()
  }

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
    >
      <DialogTitle sx={{ bgcolor: '#EDE9FE', borderBottom: '1px solid #C4B5FD' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Add sx={{ color: '#7C3AED' }} />
          <Typography variant="h6">Cross-Contract Combi</Typography>
        </Box>
        {crossContractEntry && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Add products from other contracts to create a cross-contract combi for{' '}
            <strong>{getMonthName(crossContractEntry.month)} {crossContractEntry.year}</strong>
          </Typography>
        )}
      </DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        {isLoadingEligible ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography color="text.secondary">Loading eligible contracts...</Typography>
          </Box>
        ) : eligibleContracts.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No eligible contracts found for cross-contract combi.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Eligible contracts must:
              <br />• Belong to the same customer
              <br />• Be the same type ({contractType})
              <br />• Have an active period covering {crossContractEntry ? `${getMonthName(crossContractEntry.month)} ${crossContractEntry.year}` : 'this month'}
            </Typography>
          </Box>
        ) : (
          <Box>
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              Select products from other contracts to combine with this cargo. All selected products will share the same vessel and timing.
            </Typography>
            
            {eligibleContracts.map((eligibleContract) => (
              <Box 
                key={eligibleContract.id} 
                sx={{ 
                  mb: 2, 
                  p: 2, 
                  border: '1px solid #E2E8F0', 
                  borderRadius: 1,
                  bgcolor: selectedItems.some(item => item.contractId === eligibleContract.id) ? '#F5F3FF' : 'white'
                }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1, color: '#1E293B' }}>
                  {eligibleContract.contract_number} ({eligibleContract.contract_type})
                </Typography>
                
                {eligibleContract.monthly_plans.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    No monthly plans for this month. Create a plan in this contract first.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {eligibleContract.monthly_plans.map((mp) => {
                      const isSelected = selectedItems.some(item => item.monthlyPlanId === mp.id)
                      const selectedItem = selectedItems.find(item => item.monthlyPlanId === mp.id)
                      
                      return (
                        <Box 
                          key={mp.id} 
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 2,
                            p: 1,
                            borderRadius: 1,
                            bgcolor: isSelected ? '#EDE9FE' : '#F8FAFC'
                          }}
                        >
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={isSelected}
                                onChange={() => onToggleItem(
                                  eligibleContract.id,
                                  eligibleContract.contract_number,
                                  mp.id,
                                  mp.product_name
                                )}
                                disabled={mp.has_cargo}
                                size="small"
                              />
                            }
                            label={
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {mp.product_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Plan: {mp.month_quantity} KT
                                  {mp.has_cargo && ' (Already has cargo)'}
                                </Typography>
                              </Box>
                            }
                            sx={{ flex: 1, m: 0 }}
                          />
                          
                          {isSelected && (
                            <TextField
                              label="Qty (KT)"
                              type="number"
                              size="small"
                              value={selectedItem?.quantity || ''}
                              onChange={(e) => onQuantityChange(mp.id, e.target.value)}
                              sx={{ width: 120 }}
                              inputProps={{ min: 0, step: 0.01 }}
                            />
                          )}
                        </Box>
                      )
                    })}
                  </Box>
                )}
              </Box>
            ))}
            
            {selectedItems.length > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#F0FDF4', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ color: '#10B981', mb: 1 }}>
                  Selected for Cross-Contract Combi:
                </Typography>
                {selectedItems.map((item, idx) => (
                  <Typography key={idx} variant="body2">
                    • {item.contractNumber} - {item.productName}: {item.quantity || '(no quantity)'} KT
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button
          variant="contained"
          disabled={selectedItems.length === 0 || selectedItems.some(item => !item.quantity || parseFloat(item.quantity) <= 0)}
          onClick={handleCreate}
          sx={{ bgcolor: '#7C3AED', '&:hover': { bgcolor: '#6D28D9' } }}
        >
          Create Cross-Contract Combi
        </Button>
      </DialogActions>
    </Dialog>
  )
}

