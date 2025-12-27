/**
 * Warning banner that shows when other users are editing the same resource.
 * Provides real-time awareness to prevent conflicts.
 */
import React from 'react'
import { Box, Alert, AlertTitle, Chip, Collapse, IconButton, Typography, Button } from '@mui/material'
import { Warning, Refresh, Close, Edit } from '@mui/icons-material'
import { PresenceUser } from '../../hooks/usePresence'

interface EditingWarningBannerProps {
  /** Other users currently viewing/editing */
  otherUsers: PresenceUser[]
  /** Whether the WebSocket is connected */
  isConnected?: boolean
  /** Resource type for display (e.g., "quarterly plan", "monthly plan") */
  resourceType?: string
  /** Called when user clicks refresh */
  onRefresh?: () => void
  /** Whether to show the banner even with no other users (for connection status) */
  showWhenEmpty?: boolean
  /** User currently editing a field (from onUserEditing callback) */
  editingUser?: { user: PresenceUser; field: string } | null
}

/**
 * Shows a warning banner when other users are viewing/editing the same resource.
 * 
 * @example
 * <EditingWarningBanner 
 *   otherUsers={otherUsers}
 *   resourceType="monthly plan"
 *   onRefresh={handleRefresh}
 * />
 */
export function EditingWarningBanner({
  otherUsers,
  isConnected = true,
  resourceType = 'record',
  onRefresh,
  showWhenEmpty = false,
  editingUser,
}: EditingWarningBannerProps) {
  const [dismissed, setDismissed] = React.useState(false)
  
  // Reset dismissed state when users change
  React.useEffect(() => {
    if (otherUsers.length > 0) {
      setDismissed(false)
    }
  }, [otherUsers.length])
  
  // Don't show if no other users and showWhenEmpty is false
  if (otherUsers.length === 0 && !showWhenEmpty) {
    return null
  }
  
  // Don't show if dismissed
  if (dismissed && otherUsers.length > 0) {
    // Show minimal indicator when dismissed
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1, 
          p: 1, 
          bgcolor: 'rgba(237, 108, 2, 0.08)',
          borderRadius: 1,
          cursor: 'pointer',
        }}
        onClick={() => setDismissed(false)}
      >
        <Warning sx={{ fontSize: 18, color: 'warning.main' }} />
        <Typography variant="caption" color="warning.main">
          {otherUsers.length} other{otherUsers.length > 1 ? 's' : ''} viewing
        </Typography>
      </Box>
    )
  }
  
  // Connection lost warning
  if (!isConnected && showWhenEmpty) {
    return (
      <Alert 
        severity="info" 
        sx={{ mb: 2 }}
        icon={<Warning />}
      >
        <AlertTitle sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
          Reconnecting...
        </AlertTitle>
        <Typography variant="body2">
          Real-time sync is temporarily unavailable. Your changes will still be saved.
        </Typography>
      </Alert>
    )
  }
  
  if (otherUsers.length === 0) {
    return null
  }
  
  // Generate consistent color from initials
  const getChipColor = (initials: string) => {
    const colors = [
      '#1976d2', '#388e3c', '#f57c00', '#7b1fa2',
      '#c2185b', '#00796b', '#5d4037', '#455a64',
    ]
    let hash = 0
    for (let i = 0; i < initials.length; i++) {
      hash = initials.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }
  
  return (
    <Collapse in={!dismissed}>
      <Alert
        severity="warning"
        sx={{ 
          mb: 2,
          '& .MuiAlert-message': { width: '100%' },
          bgcolor: 'rgba(237, 108, 2, 0.08)',
          border: '1px solid rgba(237, 108, 2, 0.3)',
        }}
        icon={<Warning />}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {onRefresh && (
              <IconButton
                size="small"
                color="inherit"
                onClick={onRefresh}
                title="Refresh data"
              >
                <Refresh fontSize="small" />
              </IconButton>
            )}
            <IconButton
              size="small"
              color="inherit"
              onClick={() => setDismissed(true)}
              title="Dismiss"
            >
              <Close fontSize="small" />
            </IconButton>
          </Box>
        }
      >
        <AlertTitle sx={{ fontSize: '0.875rem', fontWeight: 600, mb: 0.5 }}>
          {otherUsers.length === 1 
            ? `${otherUsers[0].full_name} is also viewing this ${resourceType}`
            : `${otherUsers.length} others are also viewing this ${resourceType}`
          }
        </AlertTitle>
        
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {otherUsers.map((user) => (
            <Chip
              key={user.user_id}
              size="small"
              label={user.initials}
              title={user.full_name}
              sx={{
                height: 22,
                fontSize: '0.7rem',
                fontWeight: 600,
                bgcolor: getChipColor(user.initials),
                color: 'white',
              }}
            />
          ))}
        </Box>
        
        {/* Show if someone is actively editing */}
        {editingUser && (
          <Box 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 0.5, 
              mt: 1,
              p: 0.75,
              bgcolor: 'rgba(237, 108, 2, 0.15)',
              borderRadius: 1,
            }}
          >
            <Edit sx={{ fontSize: 14, color: 'warning.dark' }} />
            <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 500 }}>
              {editingUser.user.initials} is editing {editingUser.field}
            </Typography>
          </Box>
        )}
        
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
          Coordinate with them to avoid overwriting each other's changes.
          {onRefresh && ' Click refresh to see the latest data.'}
        </Typography>
      </Alert>
    </Collapse>
  )
}

export default EditingWarningBanner

