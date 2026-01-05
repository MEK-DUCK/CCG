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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const getMonthName = (month: number): string => {
  return MONTH_NAMES[month - 1] || ''
}

export interface MoveEntryData {
  month: number
  year: number
  entryIndex: number
  entry: {
    id?: number
    is_combi?: boolean
    _combi_plan_ids?: number[]
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
  isMoving: boolean
  onTargetMonthChange: (month: number) => void
  onTargetYearChange: (year: number) => void
  onReasonChange: (reason: string) => void
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
  isMoving,
  onTargetMonthChange,
  onTargetYearChange,
  onReasonChange,
}: MoveEntryDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {moveAction === 'DEFER' ? 'Defer Cargo to Later Month' : 'Advance Cargo to Earlier Month'}
      </DialogTitle>
      <DialogContent>
        {moveEntryData && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" sx={{ color: '#64748B', mb: 2 }}>
              Moving {moveEntryData.entry.is_combi ? 'combi cargo' : 'cargo'} from{' '}
              <strong>{getMonthName(moveEntryData.month)} {moveEntryData.year}</strong>
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Target Month</InputLabel>
                <Select
                  value={targetMonth}
                  label="Target Month"
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
            </Box>
            
            <TextField
              size="small"
              label="Reason (optional)"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              fullWidth
              multiline
              rows={2}
              placeholder="e.g., Customer request, Authority approval"
            />
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
          disabled={isMoving}
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

