import { useState, useEffect, useMemo } from 'react'
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
  Alert,
  Chip,
} from '@mui/material'
import { Warning, CheckCircle } from '@mui/icons-material'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const getMonthName = (month: number): string => {
  return MONTH_NAMES[month - 1] || ''
}

/**
 * Calculate fiscal quarter for a given month
 * @param month - Calendar month (1-12)
 * @param fiscalStartMonth - Month when fiscal Q1 starts (1=January, 4=April, etc.)
 */
const getFiscalQuarter = (month: number, fiscalStartMonth: number = 1): number => {
  const adjustedMonth = (month - fiscalStartMonth + 12) % 12
  return Math.floor(adjustedMonth / 3) + 1
}

export interface MoveEntryData {
  month: number
  year: number
  entryIndex: number
  entry: {
    id?: number
    is_combi?: boolean
    _combi_plan_ids?: number[]
    delivery_month?: string  // For CIF contracts
  }
}

interface MoveEntryDialogProps {
  open: boolean
  onClose: () => void
  onExecute: () => void
  moveAction: 'DEFER' | 'ADVANCE' | null
  moveEntryData: MoveEntryData | null
  targetMonth: number
  targetYear: number
  reason: string
  authorityReference: string
  isMoving: boolean
  onTargetMonthChange: (month: number) => void
  onTargetYearChange: (year: number) => void
  onReasonChange: (reason: string) => void
  onAuthorityReferenceChange: (ref: string) => void
  // Contract info for cross-quarter detection
  contractType?: 'FOB' | 'CIF'
  fiscalStartMonth?: number  // 1 = Jan, 4 = Apr, etc.
  isSpotContract?: boolean
}

export default function MoveEntryDialog({
  open,
  onClose,
  onExecute,
  moveAction,
  moveEntryData,
  targetMonth,
  targetYear,
  reason,
  authorityReference,
  isMoving,
  onTargetMonthChange,
  onTargetYearChange,
  onReasonChange,
  onAuthorityReferenceChange,
  contractType = 'FOB',
  fiscalStartMonth = 1,
  isSpotContract = false,
}: MoveEntryDialogProps) {
  
  // Parse delivery month for CIF contracts
  const parseDeliveryMonth = (deliveryMonth?: string): { month: number; year: number } | null => {
    if (!deliveryMonth) return null
    try {
      const parts = deliveryMonth.split(' ')
      if (parts.length === 2) {
        const monthIdx = MONTH_NAMES.indexOf(parts[0])
        if (monthIdx >= 0) {
          return { month: monthIdx + 1, year: parseInt(parts[1]) }
        }
      }
    } catch {
      // Ignore parse errors
    }
    return null
  }
  
  // Calculate source month/year based on contract type
  const sourceData = useMemo(() => {
    if (!moveEntryData) return { month: 1, year: 2025 }
    
    if (contractType === 'CIF') {
      const parsed = parseDeliveryMonth(moveEntryData.entry.delivery_month)
      if (parsed) return parsed
    }
    return { month: moveEntryData.month, year: moveEntryData.year }
  }, [moveEntryData, contractType])
  
  // Calculate quarters
  const sourceQuarter = getFiscalQuarter(sourceData.month, fiscalStartMonth)
  const targetQuarter = getFiscalQuarter(targetMonth, fiscalStartMonth)
  
  // Determine if this is a cross-quarter move
  const isCrossQuarter = sourceQuarter !== targetQuarter || sourceData.year !== targetYear
  
  // Validation
  const canExecute = useMemo(() => {
    if (!moveEntryData || !moveAction) return false
    if (isSpotContract) return false  // SPOT contracts can't be moved
    
    // Cross-quarter requires authority reference and reason
    if (isCrossQuarter) {
      if (!authorityReference?.trim()) return false
      if (!reason?.trim()) return false
    }
    
    return true
  }, [moveEntryData, moveAction, isSpotContract, isCrossQuarter, authorityReference, reason])
  
  // Show warning for cross-quarter
  const showCrossQuarterWarning = isCrossQuarter && moveEntryData && !isSpotContract
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {moveAction === 'DEFER' ? 'Defer Cargo to Later Month' : 'Advance Cargo to Earlier Month'}
      </DialogTitle>
      <DialogContent>
        {isSpotContract ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            Defer/Advance is not available for SPOT contracts. SPOT contracts are one-time operations.
          </Alert>
        ) : moveEntryData && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" sx={{ color: '#64748B', mb: 2 }}>
              Moving {moveEntryData.entry.is_combi ? 'combi cargo' : 'cargo'} from{' '}
              <strong>
                {contractType === 'CIF' && moveEntryData.entry.delivery_month 
                  ? `${moveEntryData.entry.delivery_month} (delivery)`
                  : `${getMonthName(moveEntryData.month)} ${moveEntryData.year}`
                }
              </strong>
              {' '}
              <Chip 
                label={`Q${sourceQuarter}`} 
                size="small" 
                sx={{ ml: 1, bgcolor: '#E0E7FF', color: '#3730A3', fontWeight: 600 }}
              />
            </Typography>
            
            {/* Cross-Quarter Warning */}
            {showCrossQuarterWarning && (
              <Alert 
                severity="warning" 
                icon={<Warning />}
                sx={{ mb: 2 }}
              >
                <Typography variant="body2" fontWeight={600}>
                  Cross-Quarter Move: Q{sourceQuarter} → Q{targetQuarter}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  This move requires authority reference and reason. 
                  Laycan dates will be cleared and need to be re-negotiated.
                </Typography>
              </Alert>
            )}
            
            {/* Target Selection */}
            <Typography variant="subtitle2" sx={{ mb: 1, color: '#475569' }}>
              {contractType === 'CIF' ? 'Target Delivery Month' : 'Target Month'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Month</InputLabel>
                <Select
                  value={targetMonth}
                  label="Month"
                  onChange={(e) => onTargetMonthChange(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <MenuItem key={m} value={m}>
                      {getMonthName(m)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Year"
                type="number"
                value={targetYear}
                onChange={(e) => onTargetYearChange(Number(e.target.value))}
                sx={{ width: 100 }}
                inputProps={{ min: 2020, max: 2100 }}
              />
              <Chip 
                label={`Q${targetQuarter}`} 
                size="small" 
                sx={{ 
                  bgcolor: isCrossQuarter ? '#FEF3C7' : '#D1FAE5', 
                  color: isCrossQuarter ? '#92400E' : '#065F46',
                  fontWeight: 600 
                }}
              />
            </Box>
            
            {/* Authority Reference (required for cross-quarter) */}
            {isCrossQuarter && (
              <TextField
                size="small"
                label="Authority Reference"
                value={authorityReference}
                onChange={(e) => onAuthorityReferenceChange(e.target.value)}
                fullWidth
                required
                error={isCrossQuarter && !authorityReference?.trim()}
                helperText={isCrossQuarter && !authorityReference?.trim() ? 'Required for cross-quarter moves' : ''}
                placeholder="e.g., AUTH-2025-007, Email from John dated 15/01"
                sx={{ mb: 2 }}
              />
            )}
            
            {/* Reason */}
            <TextField
              size="small"
              label={isCrossQuarter ? 'Reason (required)' : 'Reason (optional)'}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              fullWidth
              required={isCrossQuarter}
              error={isCrossQuarter && !reason?.trim()}
              helperText={isCrossQuarter && !reason?.trim() ? 'Required for cross-quarter moves' : ''}
              multiline
              rows={2}
              placeholder="e.g., Customer request, Vessel delay, Authority approval"
            />
            
            {/* Same Quarter Indicator */}
            {!isCrossQuarter && (
              <Alert 
                severity="success" 
                icon={<CheckCircle />}
                sx={{ mt: 2 }}
              >
                Within-quarter move (Q{sourceQuarter}) - no authority required
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={isMoving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onExecute}
          disabled={isMoving || !canExecute}
          sx={{
            bgcolor: moveAction === 'DEFER' ? '#2563EB' : '#7C3AED',
            '&:hover': { bgcolor: moveAction === 'DEFER' ? '#1D4ED8' : '#6D28D9' },
          }}
        >
          {isMoving ? 'Moving...' : moveAction === 'DEFER' ? 'Defer Cargo' : 'Advance Cargo'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
