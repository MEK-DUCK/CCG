import { useState, useEffect, useCallback } from 'react'
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
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
} from '@mui/material'
import {
  Edit,
  PersonOff,
  PersonAdd,
  Refresh,
  Send,
  ContentCopy,
  Check,
  PersonOutline,
  AdminPanelSettings,
} from '@mui/icons-material'
import client from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useResizableColumns, ColumnConfig } from '../hooks/useResizableColumns'
import ResizableTableCell from './ResizableTableCell'

// Column configuration for resizable columns
const USER_COLUMNS: ColumnConfig[] = [
  { id: 'user', label: 'User', defaultWidth: 180, minWidth: 120 },
  { id: 'email', label: 'Email', defaultWidth: 220, minWidth: 150 },
  { id: 'initials', label: 'Initials', defaultWidth: 80, minWidth: 60 },
  { id: 'role', label: 'Role', defaultWidth: 100, minWidth: 80 },
  { id: 'status', label: 'Status', defaultWidth: 100, minWidth: 80 },
  { id: 'lastLogin', label: 'Last Login', defaultWidth: 150, minWidth: 100 },
  { id: 'actions', label: 'Actions', defaultWidth: 150, minWidth: 120 },
]

interface User {
  id: number
  email: string
  full_name: string
  initials: string
  role: 'admin' | 'user'
  status: 'pending' | 'active' | 'inactive'
  created_at: string
  updated_at?: string
  last_login?: string
  created_by_id?: number
}

interface UserForm {
  email: string
  full_name: string
  initials: string
  role: 'admin' | 'user'
}

export default function UserManagement() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Resizable columns
  const { columnWidths, handleResizeStart } = useResizableColumns('users', USER_COLUMNS)

  // Dialog states
  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  })
  const [inviteDialog, setInviteDialog] = useState<{
    open: boolean
    user: User | null
    token: string | null
    copied: boolean
  }>({
    open: false,
    user: null,
    token: null,
    copied: false,
  })

  // Form state
  const [form, setForm] = useState<UserForm>({
    email: '',
    full_name: '',
    initials: '',
    role: 'user',
  })

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const response = await client.get('/api/users/')
      setUsers(response.data)
    } catch (err: any) {
      setError('Failed to load users')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Create user
  const handleCreate = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await client.post('/api/users/', form)
      setSuccess(`User ${form.email} created successfully`)
      setCreateDialog(false)
      setForm({ email: '', full_name: '', initials: '', role: 'user' })

      // Show invite dialog with token
      const tokenResponse = await client.get(`/api/users/${response.data.id}/invite-token`)
      setInviteDialog({
        open: true,
        user: response.data,
        token: tokenResponse.data.invite_token,
        copied: false,
      })

      fetchUsers()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  // Keyboard shortcuts for create dialog: Ctrl+S to save, Escape to close
  useKeyboardShortcuts({
    onSave: createDialog ? handleCreate : undefined,
    onEscape: createDialog ? () => setCreateDialog(false) : undefined,
    enabled: createDialog,
  })

  // Update user
  const handleUpdate = async () => {
    if (!editDialog.user) return
    setLoading(true)
    setError(null)
    try {
      await client.put(`/api/users/${editDialog.user.id}`, form)
      setSuccess(`User ${form.email} updated successfully`)
      setEditDialog({ open: false, user: null })
      fetchUsers()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  // Keyboard shortcuts for edit dialog: Ctrl+S to save, Escape to close
  useKeyboardShortcuts({
    onSave: editDialog.open ? handleUpdate : undefined,
    onEscape: editDialog.open ? () => setEditDialog({ open: false, user: null }) : undefined,
    enabled: editDialog.open,
  })

  // Deactivate/Activate user
  const handleToggleStatus = async (user: User) => {
    setLoading(true)
    try {
      if (user.status === 'inactive') {
        await client.post(`/api/users/${user.id}/activate`)
        setSuccess(`User ${user.email} activated`)
      } else {
        await client.post(`/api/users/${user.id}/deactivate`)
        setSuccess(`User ${user.email} deactivated`)
      }
      fetchUsers()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update user status')
    } finally {
      setLoading(false)
    }
  }

  // Resend invite
  const handleResendInvite = async (user: User) => {
    setLoading(true)
    try {
      await client.post(`/api/users/${user.id}/resend-invite`)
      const tokenResponse = await client.get(`/api/users/${user.id}/invite-token`)
      setInviteDialog({
        open: true,
        user,
        token: tokenResponse.data.invite_token,
        copied: false,
      })
      setSuccess(`Invite resent to ${user.email}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to resend invite')
    } finally {
      setLoading(false)
    }
  }

  // Copy invite link
  const copyInviteLink = () => {
    if (inviteDialog.token) {
      const link = `${window.location.origin}/set-password?token=${inviteDialog.token}`
      navigator.clipboard.writeText(link)
      setInviteDialog((prev) => ({ ...prev, copied: true }))
      setTimeout(() => setInviteDialog((prev) => ({ ...prev, copied: false })), 2000)
    }
  }

  // Open edit dialog
  const openEditDialog = (user: User) => {
    setForm({
      email: user.email,
      full_name: user.full_name,
      initials: user.initials,
      role: user.role,
    })
    setEditDialog({ open: true, user })
  }

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success'
      case 'pending':
        return 'warning'
      case 'inactive':
        return 'default'
      default:
        return 'default'
    }
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">User Management ({users.length} users)</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={fetchUsers}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<PersonAdd />}
            onClick={() => {
              setForm({ email: '', full_name: '', initials: '', role: 'user' })
              setCreateDialog(true)
            }}
            sx={{
              background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
            }}
          >
            Add User
          </Button>
        </Box>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Info */}
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          Users can only be created by administrators. New users will receive an invite link to set
          their password. User initials are used for audit tracking.
        </Typography>
      </Alert>

      {/* Users Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <ResizableTableCell columnId="user" width={columnWidths['user']} minWidth={120} onResizeStart={handleResizeStart}>
                User
              </ResizableTableCell>
              <ResizableTableCell columnId="email" width={columnWidths['email']} minWidth={150} onResizeStart={handleResizeStart}>
                Email
              </ResizableTableCell>
              <ResizableTableCell columnId="initials" width={columnWidths['initials']} minWidth={60} onResizeStart={handleResizeStart}>
                Initials
              </ResizableTableCell>
              <ResizableTableCell columnId="role" width={columnWidths['role']} minWidth={80} onResizeStart={handleResizeStart}>
                Role
              </ResizableTableCell>
              <ResizableTableCell columnId="status" width={columnWidths['status']} minWidth={80} onResizeStart={handleResizeStart}>
                Status
              </ResizableTableCell>
              <ResizableTableCell columnId="lastLogin" width={columnWidths['lastLogin']} minWidth={100} onResizeStart={handleResizeStart}>
                Last Login
              </ResizableTableCell>
              <ResizableTableCell columnId="actions" width={columnWidths['actions']} minWidth={120} onResizeStart={handleResizeStart} align="right" resizable={false}>
                Actions
              </ResizableTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No users found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow
                  key={user.id}
                  hover
                  sx={{
                    bgcolor: user.status === 'inactive' ? '#f8fafc' : 'white',
                    opacity: user.status === 'inactive' ? 0.7 : 1,
                  }}
                >
                  <TableCell sx={{ width: columnWidths['user'] }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          bgcolor: user.role === 'admin' ? '#EDE9FE' : '#E0F2FE',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {user.role === 'admin' ? (
                          <AdminPanelSettings sx={{ fontSize: 20, color: '#7C3AED' }} />
                        ) : (
                          <PersonOutline sx={{ fontSize: 20, color: '#0284C7' }} />
                        )}
                      </Box>
                      <Typography sx={{ fontWeight: 500 }}>{user.full_name}</Typography>
                      {user.id === currentUser?.id && (
                        <Chip label="You" size="small" color="primary" variant="outlined" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ width: columnWidths['email'] }}>{user.email}</TableCell>
                  <TableCell sx={{ width: columnWidths['initials'] }}>
                    <Chip
                      label={user.initials}
                      size="small"
                      sx={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        bgcolor: '#F1F5F9',
                        color: '#475569',
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ width: columnWidths['role'] }}>
                    <Chip
                      label={user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      size="small"
                      color={user.role === 'admin' ? 'secondary' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ width: columnWidths['status'] }}>
                    <Chip
                      label={user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                      size="small"
                      color={getStatusColor(user.status) as any}
                    />
                  </TableCell>
                  <TableCell sx={{ width: columnWidths['lastLogin'], fontSize: '0.875rem', color: 'text.secondary' }}>
                    {user.last_login
                      ? new Date(user.last_login).toLocaleString()
                      : 'Never'}
                  </TableCell>
                  <TableCell sx={{ width: columnWidths['actions'] }} align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      {user.status === 'pending' && (
                        <Tooltip title="Resend Invite">
                          <IconButton
                            size="small"
                            onClick={() => handleResendInvite(user)}
                            sx={{ color: '#0284C7' }}
                          >
                            <Send fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEditDialog(user)}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {user.id !== currentUser?.id && (
                        <Tooltip title={user.status === 'inactive' ? 'Activate' : 'Deactivate'}>
                          <IconButton
                            size="small"
                            onClick={() => handleToggleStatus(user)}
                            sx={{
                              color: user.status === 'inactive' ? '#059669' : '#DC2626',
                            }}
                          >
                            <PersonOff fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create User Dialog */}
      <Dialog
        open={createDialog}
        onClose={() => setCreateDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create a new user account. They will receive an invite link to set their password.
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="Full Name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Initials"
                value={form.initials}
                onChange={(e) => setForm({ ...form, initials: e.target.value.toUpperCase() })}
                required
                inputProps={{ maxLength: 4 }}
                helperText="2-4 characters"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={form.role}
                  label="Role"
                  onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'user' })}
                >
                  <MenuItem value="user">User</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(false)} variant="outlined">Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={loading || !form.email || !form.full_name || !form.initials}
          >
            Create User
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false, user: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="Full Name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Initials"
                value={form.initials}
                onChange={(e) => setForm({ ...form, initials: e.target.value.toUpperCase() })}
                required
                inputProps={{ maxLength: 4 }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={form.role}
                  label="Role"
                  onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'user' })}
                  disabled={editDialog.user?.id === currentUser?.id}
                >
                  <MenuItem value="user">User</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                </Select>
              </FormControl>
              {editDialog.user?.id === currentUser?.id && (
                <Typography variant="caption" color="text.secondary">
                  You cannot change your own role
                </Typography>
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, user: null })} variant="outlined">Cancel</Button>
          <Button
            variant="contained"
            onClick={handleUpdate}
            disabled={loading || !form.email || !form.full_name || !form.initials}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Invite Link Dialog */}
      <Dialog
        open={inviteDialog.open}
        onClose={() => setInviteDialog({ open: false, user: null, token: null, copied: false })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Invite Link Generated</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            User <strong>{inviteDialog.user?.email}</strong> has been created!
          </Alert>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Share this link with the user to let them set their password. The link expires in 7
            days.
          </Typography>
          <TextField
            fullWidth
            value={
              inviteDialog.token
                ? `${window.location.origin}/set-password?token=${inviteDialog.token}`
                : ''
            }
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={copyInviteLink}>
                    {inviteDialog.copied ? (
                      <Check sx={{ color: '#059669' }} />
                    ) : (
                      <ContentCopy />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiInputBase-input': {
                fontFamily: 'monospace',
                fontSize: '0.75rem',
              },
            }}
          />
          {inviteDialog.copied && (
            <Typography variant="caption" sx={{ color: '#059669', mt: 1, display: 'block' }}>
              Link copied to clipboard!
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              setInviteDialog({ open: false, user: null, token: null, copied: false })
            }
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

