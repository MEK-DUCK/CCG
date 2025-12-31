/**
 * Version History Component
 * 
 * Displays version history for an entity and allows restoration to previous versions.
 * Shows user-friendly field names and highlights what changed between versions.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Alert,
  Chip,
  Tooltip,
  Divider,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material'
import {
  Restore as RestoreIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  History as HistoryIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material'
import { versionHistoryAPI } from '../../api/client'
import { formatDistanceToNow, format } from 'date-fns'

interface VersionSummary {
  id: number
  version_number: number
  change_summary: string | null
  changed_fields: string[] | null
  created_by_initials: string | null
  created_at: string
}

interface VersionDetail extends VersionSummary {
  entity_type: string
  entity_id: number
  snapshot_data: Record<string, unknown>
}

interface VersionHistoryProps {
  entityType: string
  entityId: number
  onRestore?: () => void
  maxHeight?: number | string
}

// Friendly field name mappings
const FIELD_LABELS: Record<string, Record<string, string>> = {
  cargo: {
    vessel_name: 'Vessel Name',
    cargo_quantity: 'Cargo Quantity (KT)',
    laycan_window: 'Laycan Window',
    load_ports: 'Load Ports',
    inspector_name: 'Inspector',
    status: 'Status',
    eta: 'ETA',
    etb: 'ETB',
    etc: 'ETC',
    etd: 'ETD',
    bl_date: 'B/L Date',
    bl_quantity: 'B/L Quantity',
    lc_status: 'L/C Status',
    lc_number: 'L/C Number',
    product_name: 'Product',
    five_nd_date: 'ND Due Date',
    nd_delivery_window: 'ND Delivery Window',
    discharge_port: 'Discharge Port',
    discharge_port_location: 'Discharge Location',
    eta_discharge_port: 'ETA Discharge Port',
    remarks: 'Remarks',
    combi_group_id: 'Combi Group',
    version: 'Version',
    created_at: 'Created',
    updated_at: 'Last Updated',
  },
  monthly_plan: {
    month: 'Month',
    year: 'Year',
    month_quantity: 'Quantity (KT)',
    number_of_liftings: 'Number of Liftings',
    laycan_5_days: '5-Day Laycan',
    laycan_2_days: '2-Day Laycan',
    laycan_2_days_remark: 'Laycan Remarks',
    loading_month: 'Loading Month',
    loading_window: 'Loading Window',
    delivery_month: 'Delivery Month',
    delivery_window: 'Delivery Window',
    delivery_window_remark: 'Delivery Remarks',
    authority_topup_quantity: 'Top-Up Quantity',
    authority_topup_reference: 'Top-Up Reference',
    authority_topup_reason: 'Top-Up Reason',
    authority_topup_date: 'Top-Up Date',
    product_name: 'Product',
    is_combi: 'Combi Cargo',
    combi_group_id: 'Combi Group',
    version: 'Version',
    created_at: 'Created',
    updated_at: 'Last Updated',
  },
  contract: {
    contract_number: 'Contract Number',
    contract_id: 'Contract ID',
    contract_type: 'Contract Type',
    category: 'Category',
    total_quantity: 'Total Quantity',
    contract_year: 'Contract Year',
    fiscal_start_month: 'Fiscal Start Month',
    start_date: 'Start Date',
    end_date: 'End Date',
    products: 'Products',
    version: 'Version',
  },
  quarterly_plan: {
    product_name: 'Product',
    contract_year: 'Contract Year',
    q1_quantity: 'Q1 Quantity',
    q2_quantity: 'Q2 Quantity',
    q3_quantity: 'Q3 Quantity',
    q4_quantity: 'Q4 Quantity',
    version: 'Version',
  },
}

// Fields to hide from display (internal/technical fields)
const HIDDEN_FIELDS = ['id', '_sa_instance_state', 'quarterly_plan_id', 'contract_id', 'customer_id', 'monthly_plan_id']

// Month names for formatting
const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function getFieldLabel(entityType: string, fieldName: string): string {
  return FIELD_LABELS[entityType]?.[fieldName] || fieldName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatValue(value: unknown, fieldName: string): string {
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  
  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  
  // Handle numbers
  if (typeof value === 'number') {
    if (fieldName.includes('quantity') || fieldName === 'month_quantity' || fieldName === 'cargo_quantity') {
      return `${value.toLocaleString()} KT`
    }
    if (fieldName === 'month') {
      return MONTH_NAMES[value] || String(value)
    }
    return value.toLocaleString()
  }
  
  // Handle dates
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
    try {
      const date = new Date(value)
      if (!isNaN(date.getTime())) {
        if (value.includes('T')) {
          return format(date, 'MMM d, yyyy h:mm a')
        }
        return format(date, 'MMM d, yyyy')
      }
    } catch {
      // Fall through to default
    }
  }
  
  // Handle JSON objects/arrays
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  
  return String(value)
}

interface FieldDiff {
  field: string
  label: string
  oldValue: unknown
  newValue: unknown
  changeType: 'added' | 'removed' | 'modified'
}

function computeDiff(oldData: Record<string, unknown> | null, newData: Record<string, unknown>, entityType: string): FieldDiff[] {
  const diffs: FieldDiff[] = []
  const allFields = new Set([
    ...Object.keys(newData),
    ...(oldData ? Object.keys(oldData) : [])
  ])
  
  for (const field of allFields) {
    if (HIDDEN_FIELDS.includes(field)) continue
    
    const oldVal = oldData?.[field]
    const newVal = newData[field]
    
    // Skip if both are empty/null
    if ((oldVal === null || oldVal === undefined || oldVal === '') && 
        (newVal === null || newVal === undefined || newVal === '')) {
      continue
    }
    
    // Check if values are different
    const oldStr = JSON.stringify(oldVal)
    const newStr = JSON.stringify(newVal)
    
    if (oldStr !== newStr) {
      let changeType: 'added' | 'removed' | 'modified' = 'modified'
      if (oldVal === null || oldVal === undefined || oldVal === '') {
        changeType = 'added'
      } else if (newVal === null || newVal === undefined || newVal === '') {
        changeType = 'removed'
      }
      
      diffs.push({
        field,
        label: getFieldLabel(entityType, field),
        oldValue: oldVal,
        newValue: newVal,
        changeType
      })
    }
  }
  
  return diffs
}

export function VersionHistory({ entityType, entityId, onRestore, maxHeight = 400 }: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null)
  const [versionDetails, setVersionDetails] = useState<Record<number, VersionDetail>>({})
  const [detailLoading, setDetailLoading] = useState(false)
  
  // Restore dialog
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [restoreVersion, setRestoreVersion] = useState<VersionSummary | null>(null)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await versionHistoryAPI.getVersions(entityType, entityId, 50)
      setVersions(response.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load version history')
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  const handleExpandVersion = async (version: VersionSummary, index: number) => {
    if (expandedVersion === version.version_number) {
      setExpandedVersion(null)
      return
    }

    setExpandedVersion(version.version_number)
    
    // Load this version's detail if not already loaded
    if (!versionDetails[version.version_number]) {
      setDetailLoading(true)
      try {
        const response = await versionHistoryAPI.getVersionDetail(
          entityType,
          entityId,
          version.version_number
        )
        setVersionDetails(prev => ({
          ...prev,
          [version.version_number]: response.data
        }))
        
        // Also load the previous version (older) for comparison if exists
        // This allows us to show what changed TO CREATE this version
        if (index < versions.length - 1) {
          const olderVersion = versions[index + 1]
          if (!versionDetails[olderVersion.version_number]) {
            const olderResponse = await versionHistoryAPI.getVersionDetail(
              entityType,
              entityId,
              olderVersion.version_number
            )
            setVersionDetails(prev => ({
              ...prev,
              [olderVersion.version_number]: olderResponse.data
            }))
          }
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load version details')
      } finally {
        setDetailLoading(false)
      }
    }
  }

  const handleRestoreClick = (version: VersionSummary) => {
    setRestoreVersion(version)
    setRestoreDialogOpen(true)
    setRestoreError(null)
  }

  const handleRestore = async () => {
    if (!restoreVersion) return

    setRestoreLoading(true)
    setRestoreError(null)
    try {
      await versionHistoryAPI.restoreVersion(
        entityType,
        entityId,
        restoreVersion.version_number
      )
      setRestoreDialogOpen(false)
      loadVersions()
      if (onRestore) {
        onRestore()
      }
    } catch (err: any) {
      setRestoreError(err.response?.data?.detail || 'Failed to restore version')
    } finally {
      setRestoreLoading(false)
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
  
  const formatFullDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return format(date, 'MMM d, yyyy h:mm a')
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 1 }}>
        {error}
      </Alert>
    )
  }

  if (versions.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <HistoryIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
        <Typography color="text.secondary">
          No version history available
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <List sx={{ maxHeight, overflow: 'auto' }}>
        {versions.map((version, index) => {
          const currentDetail = versionDetails[version.version_number]
          // Get the older (previous) version to compare what changed TO CREATE this version
          const olderDetail = index < versions.length - 1 ? versionDetails[versions[index + 1].version_number] : null
          // Diff: older snapshot → current snapshot (shows what changed to get to this version)
          const diffs = currentDetail && olderDetail 
            ? computeDiff(olderDetail.snapshot_data, currentDetail.snapshot_data, entityType)
            : []
          
          return (
            <React.Fragment key={version.id}>
              <ListItem
                sx={{
                  bgcolor: expandedVersion === version.version_number ? 'action.selected' : 'inherit',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  py: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Chip
                        label={`v${version.version_number}`}
                        size="small"
                        color={index === 0 ? 'primary' : 'default'}
                        variant={index === 0 ? 'filled' : 'outlined'}
                      />
                      {version.created_by_initials && (
                        <Chip
                          label={version.created_by_initials}
                          size="small"
                          variant="outlined"
                          sx={{ bgcolor: '#E0F2FE', borderColor: '#0EA5E9' }}
                        />
                      )}
                      <Tooltip title={formatFullDate(version.created_at)}>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(version.created_at)}
                        </Typography>
                      </Tooltip>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500 }}>
                      {version.change_summary || (index === versions.length - 1 ? 'Initial version' : 'Changes made')}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {index > 0 && (
                      <Tooltip title="Restore to this version">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleRestoreClick(version)}
                        >
                          <RestoreIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <IconButton
                      size="small"
                      onClick={() => handleExpandVersion(version, index)}
                    >
                      {expandedVersion === version.version_number ? (
                        <ExpandLessIcon />
                      ) : (
                        <ExpandMoreIcon />
                      )}
                    </IconButton>
                  </Box>
                </Box>
                
                <Collapse in={expandedVersion === version.version_number}>
                  <Box sx={{ mt: 1.5 }}>
                    {detailLoading ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={20} />
                      </Box>
                    ) : currentDetail ? (
                      <Paper variant="outlined" sx={{ bgcolor: '#F9FAFB', overflow: 'hidden' }}>
                        {/* Show diff if we have an older version to compare */}
                        {diffs.length > 0 ? (
                          <Box>
                            <Box sx={{ px: 2, py: 1, bgcolor: '#F3F4F6', borderBottom: '1px solid #E5E7EB' }}>
                              <Typography variant="caption" sx={{ fontWeight: 600, color: '#6B7280' }}>
                                What changed in this version
                              </Typography>
                            </Box>
                            <Table size="small">
                              <TableBody>
                                {diffs.map((diff) => (
                                  <TableRow key={diff.field}>
                                    <TableCell sx={{ width: 140, fontWeight: 500, color: '#374151', verticalAlign: 'top' }}>
                                      {diff.label}
                                    </TableCell>
                                    <TableCell>
                                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        {diff.changeType === 'added' ? (
                                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <AddIcon sx={{ fontSize: 14, color: '#10B981' }} />
                                            <Typography variant="body2" sx={{ color: '#10B981', bgcolor: '#D1FAE5', px: 0.5, borderRadius: 0.5 }}>
                                              {formatValue(diff.newValue, diff.field)}
                                            </Typography>
                                          </Box>
                                        ) : diff.changeType === 'removed' ? (
                                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <RemoveIcon sx={{ fontSize: 14, color: '#EF4444' }} />
                                            <Typography variant="body2" sx={{ color: '#EF4444', bgcolor: '#FEE2E2', px: 0.5, borderRadius: 0.5, textDecoration: 'line-through' }}>
                                              {formatValue(diff.oldValue, diff.field)}
                                            </Typography>
                                          </Box>
                                        ) : (
                                          <>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                              <RemoveIcon sx={{ fontSize: 14, color: '#EF4444' }} />
                                              <Typography variant="body2" sx={{ color: '#991B1B', bgcolor: '#FEE2E2', px: 0.5, borderRadius: 0.5 }}>
                                                {formatValue(diff.oldValue, diff.field)}
                                              </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                              <AddIcon sx={{ fontSize: 14, color: '#10B981' }} />
                                              <Typography variant="body2" sx={{ color: '#065F46', bgcolor: '#D1FAE5', px: 0.5, borderRadius: 0.5 }}>
                                                {formatValue(diff.newValue, diff.field)}
                                              </Typography>
                                            </Box>
                                          </>
                                        )}
                                      </Box>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </Box>
                        ) : (
                          // Show full snapshot for the oldest version or when no comparison available
                          <Box>
                            <Box sx={{ px: 2, py: 1, bgcolor: '#F3F4F6', borderBottom: '1px solid #E5E7EB' }}>
                              <Typography variant="caption" sx={{ fontWeight: 600, color: '#6B7280' }}>
                                {index === versions.length - 1 ? 'Initial state' : 'Snapshot at this version'}
                              </Typography>
                            </Box>
                            <Table size="small">
                              <TableBody>
                                {Object.entries(currentDetail.snapshot_data)
                                  .filter(([key]) => !HIDDEN_FIELDS.includes(key))
                                  .filter(([, value]) => value !== null && value !== undefined && value !== '')
                                  .map(([key, value]) => (
                                    <TableRow key={key}>
                                      <TableCell sx={{ width: 140, fontWeight: 500, color: '#374151' }}>
                                        {getFieldLabel(entityType, key)}
                                      </TableCell>
                                      <TableCell sx={{ color: '#6B7280' }}>
                                        {formatValue(value, key)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          </Box>
                        )}
                      </Paper>
                    ) : null}
                  </Box>
                </Collapse>
              </ListItem>
              {index < versions.length - 1 && <Divider />}
            </React.Fragment>
          )
        })}
      </List>

      {/* Restore Confirmation Dialog */}
      <Dialog open={restoreDialogOpen} onClose={() => setRestoreDialogOpen(false)}>
        <DialogTitle>Restore to Version {restoreVersion?.version_number}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will restore the {entityType.replace('_', ' ')} to version {restoreVersion?.version_number}.
            The current state will be saved as a new version before restoring.
          </DialogContentText>
          {restoreVersion?.change_summary && (
            <Typography variant="body2" sx={{ mt: 2 }}>
              <strong>Version description:</strong> {restoreVersion.change_summary}
            </Typography>
          )}
          {restoreError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {restoreError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialogOpen(false)} disabled={restoreLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleRestore}
            disabled={restoreLoading}
            startIcon={restoreLoading ? <CircularProgress size={16} /> : <RestoreIcon />}
          >
            Restore
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// Dialog wrapper for easy use
interface VersionHistoryDialogProps {
  open: boolean
  onClose: () => void
  entityType: string
  entityId: number
  entityName?: string
  onRestore?: () => void
}

export function VersionHistoryDialog({
  open,
  onClose,
  entityType,
  entityId,
  entityName,
  onRestore,
}: VersionHistoryDialogProps) {
  const handleRestore = () => {
    if (onRestore) {
      onRestore()
    }
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon />
          Version History
          {entityName && (
            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              - {entityName}
            </Typography>
          )}
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <VersionHistory
          entityType={entityType}
          entityId={entityId}
          onRestore={handleRestore}
          maxHeight={400}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default VersionHistory
