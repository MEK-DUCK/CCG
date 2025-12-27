/**
 * Recycle Bin Component
 * 
 * Displays soft-deleted entities and allows restoration.
 * Can be used as a standalone page or embedded in admin section.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Snackbar,
} from '@mui/material'
import {
  Restore as RestoreIcon,
  DeleteForever as DeleteForeverIcon,
  Visibility as ViewIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { recycleBinAPI } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { formatDistanceToNow } from 'date-fns'

interface DeletedEntity {
  id: number
  entity_type: string
  entity_id: number
  entity_display_name: string | null
  deleted_by_initials: string | null
  deleted_at: string
  deletion_reason: string | null
  permanent_delete_after: string | null
  restored_at: string | null
}

interface DeletedEntityDetail extends DeletedEntity {
  snapshot_data: Record<string, unknown>
  related_info: Record<string, unknown> | null
  restored_by_initials: string | null
  new_entity_id: number | null
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  cargo: 'Cargo',
  contract: 'Contract',
  monthly_plan: 'Monthly Plan',
  quarterly_plan: 'Quarterly Plan',
  customer: 'Customer',
}

const ENTITY_TYPE_COLORS: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'info'> = {
  cargo: 'primary',
  contract: 'secondary',
  monthly_plan: 'success',
  quarterly_plan: 'warning',
  customer: 'info',
}

export function RecycleBin() {
  const { isAdmin } = useAuth()
  const [deletedEntities, setDeletedEntities] = useState<DeletedEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('')
  
  // Dialog states
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [viewingEntity, setViewingEntity] = useState<DeletedEntityDetail | null>(null)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<DeletedEntity | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  
  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const loadDeletedEntities = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await recycleBinAPI.getDeleted(
        filterType || undefined,
        false, // Don't include already restored
        100
      )
      setDeletedEntities(response.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load recycle bin')
    } finally {
      setLoading(false)
    }
  }, [filterType])

  useEffect(() => {
    loadDeletedEntities()
  }, [loadDeletedEntities])

  const handleViewDetails = async (entity: DeletedEntity) => {
    try {
      const response = await recycleBinAPI.getDeletedDetail(entity.id)
      setViewingEntity(response.data)
      setViewDialogOpen(true)
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to load details',
        severity: 'error',
      })
    }
  }

  const handleRestoreClick = (entity: DeletedEntity) => {
    setSelectedEntity(entity)
    setRestoreDialogOpen(true)
  }

  const handleDeleteClick = (entity: DeletedEntity) => {
    setSelectedEntity(entity)
    setDeleteDialogOpen(true)
  }

  const handleRestore = async () => {
    if (!selectedEntity) return
    
    setActionLoading(true)
    try {
      const response = await recycleBinAPI.restore(selectedEntity.id)
      setSnackbar({
        open: true,
        message: `Successfully restored! New ID: ${response.data.entity_id}`,
        severity: 'success',
      })
      setRestoreDialogOpen(false)
      loadDeletedEntities()
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to restore',
        severity: 'error',
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handlePermanentDelete = async () => {
    if (!selectedEntity) return
    
    setActionLoading(true)
    try {
      await recycleBinAPI.permanentDelete(selectedEntity.id)
      setSnackbar({
        open: true,
        message: 'Permanently deleted',
        severity: 'success',
      })
      setDeleteDialogOpen(false)
      loadDeletedEntities()
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to delete',
        severity: 'error',
      })
    } finally {
      setActionLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return formatDistanceToNow(date, { addSuffix: true })
    } catch {
      return dateStr
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" component="h2">
          🗑️ Recycle Bin
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Filter by Type</InputLabel>
            <Select
              value={filterType}
              label="Filter by Type"
              onChange={(e) => setFilterType(e.target.value)}
            >
              <MenuItem value="">All Types</MenuItem>
              {Object.entries(ENTITY_TYPE_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadDeletedEntities}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : deletedEntities.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              Recycle bin is empty
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Deleted By</TableCell>
                  <TableCell>Deleted</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deletedEntities.map((entity) => (
                  <TableRow key={entity.id} hover>
                    <TableCell>
                      <Chip
                        label={ENTITY_TYPE_LABELS[entity.entity_type] || entity.entity_type}
                        color={ENTITY_TYPE_COLORS[entity.entity_type] || 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {entity.entity_display_name || `ID: ${entity.entity_id}`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={entity.deleted_by_initials || '?'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title={new Date(entity.deleted_at).toLocaleString()}>
                        <span>{formatDate(entity.deleted_at)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200 }} noWrap>
                        {entity.deletion_reason || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {entity.permanent_delete_after && (
                        <Tooltip title={`Will be permanently deleted ${formatDate(entity.permanent_delete_after)}`}>
                          <Typography variant="body2" color="warning.main">
                            {formatDate(entity.permanent_delete_after)}
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="View Details">
                        <IconButton size="small" onClick={() => handleViewDetails(entity)}>
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Restore">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleRestoreClick(entity)}
                        >
                          <RestoreIcon />
                        </IconButton>
                      </Tooltip>
                      {isAdmin && (
                        <Tooltip title="Delete Forever">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteClick(entity)}
                          >
                            <DeleteForeverIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* View Details Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Deleted {viewingEntity && ENTITY_TYPE_LABELS[viewingEntity.entity_type]} Details
        </DialogTitle>
        <DialogContent>
          {viewingEntity && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Original ID: {viewingEntity.entity_id}
              </Typography>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Deleted: {new Date(viewingEntity.deleted_at).toLocaleString()} by {viewingEntity.deleted_by_initials}
              </Typography>
              {viewingEntity.deletion_reason && (
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Reason: {viewingEntity.deletion_reason}
                </Typography>
              )}
              <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                Snapshot Data
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', maxHeight: 400, overflow: 'auto' }}>
                <pre style={{ margin: 0, fontSize: '0.875rem' }}>
                  {JSON.stringify(viewingEntity.snapshot_data, null, 2)}
                </pre>
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          {viewingEntity && (
            <Button
              variant="contained"
              color="success"
              startIcon={<RestoreIcon />}
              onClick={() => {
                setViewDialogOpen(false)
                handleRestoreClick(viewingEntity)
              }}
            >
              Restore
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={restoreDialogOpen} onClose={() => setRestoreDialogOpen(false)}>
        <DialogTitle>Restore {selectedEntity && ENTITY_TYPE_LABELS[selectedEntity.entity_type]}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will restore "{selectedEntity?.entity_display_name || `ID: ${selectedEntity?.entity_id}`}" 
            from the recycle bin. The restored item may have a new ID.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialogOpen(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleRestore}
            disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={16} /> : <RestoreIcon />}
          >
            Restore
          </Button>
        </DialogActions>
      </Dialog>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle color="error">Permanently Delete?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>Warning:</strong> This will permanently delete 
            "{selectedEntity?.entity_display_name || `ID: ${selectedEntity?.entity_id}`}". 
            This action cannot be undone!
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handlePermanentDelete}
            disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
          >
            Delete Forever
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default RecycleBin

