/**
 * Dialog shown when a save operation fails due to concurrent edit conflict.
 * Offers options to refresh data or retry the save.
 */
import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
} from '@mui/material'
import { Warning, Refresh, Close } from '@mui/icons-material'

interface ConflictDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Called when user wants to refresh data */
  onRefresh: () => void
  /** Called when user dismisses the dialog */
  onClose: () => void
  /** Custom title */
  title?: string
  /** Custom message */
  message?: string
  /** Name of the entity that had a conflict (e.g., "Monthly Plan", "Contract") */
  entityName?: string
}

/**
 * Dialog shown when optimistic locking detects a conflict.
 * 
 * @example
 * <ConflictDialog
 *   open={showConflict}
 *   onRefresh={() => {
 *     loadData()
 *     setShowConflict(false)
 *   }}
 *   onClose={() => setShowConflict(false)}
 *   entityName="Monthly Plan"
 * />
 */
export function ConflictDialog({
  open,
  onRefresh,
  onClose,
  title = 'Update Conflict',
  message,
  entityName = 'record',
}: ConflictDialogProps) {
  const defaultMessage = `This ${entityName} was modified by another user while you were editing. Your changes could not be saved to avoid overwriting their updates.`
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: '4px solid #ff9800',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Warning sx={{ color: '#ff9800' }} />
        {title}
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {message || defaultMessage}
        </Alert>
        
        <Typography variant="body2" color="text.secondary">
          To continue:
        </Typography>
        <Box component="ul" sx={{ mt: 1, pl: 2 }}>
          <Typography component="li" variant="body2" color="text.secondary">
            Click <strong>Refresh</strong> to load the latest data
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            Review the current values and make your changes again
          </Typography>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onClose}
          startIcon={<Close />}
          color="inherit"
        >
          Dismiss
        </Button>
        <Button
          onClick={onRefresh}
          variant="contained"
          startIcon={<Refresh />}
          sx={{
            bgcolor: '#ff9800',
            '&:hover': { bgcolor: '#f57c00' },
          }}
        >
          Refresh Data
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * Hook to handle optimistic locking conflicts from API responses.
 * 
 * @example
 * const { showConflict, handleApiError, ConflictDialogComponent } = useConflictHandler({
 *   onRefresh: () => loadData(),
 *   entityName: 'Monthly Plan'
 * })
 * 
 * try {
 *   await api.update(id, data)
 * } catch (error) {
 *   if (!handleApiError(error)) {
 *     // Handle other errors
 *   }
 * }
 * 
 * return (
 *   <>
 *     {ConflictDialogComponent}
 *     ...
 *   </>
 * )
 */
export function useConflictHandler(options: {
  onRefresh: () => void
  entityName?: string
}) {
  const [showConflict, setShowConflict] = React.useState(false)
  
  const handleApiError = React.useCallback((error: any): boolean => {
    // Check if this is a 409 conflict error
    if (error?.response?.status === 409) {
      setShowConflict(true)
      return true
    }
    return false
  }, [])
  
  const handleRefresh = React.useCallback(() => {
    setShowConflict(false)
    options.onRefresh()
  }, [options])
  
  const handleClose = React.useCallback(() => {
    setShowConflict(false)
  }, [])
  
  const ConflictDialogComponent = (
    <ConflictDialog
      open={showConflict}
      onRefresh={handleRefresh}
      onClose={handleClose}
      entityName={options.entityName}
    />
  )
  
  return {
    showConflict,
    setShowConflict,
    handleApiError,
    ConflictDialogComponent,
  }
}

export default ConflictDialog

