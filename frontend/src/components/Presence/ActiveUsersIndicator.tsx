/**
 * Component to display active users viewing the same resource.
 * Shows avatars/initials of other users for collaborative awareness.
 */
import { Box, Chip, Tooltip, Typography, Badge, Avatar, AvatarGroup } from '@mui/material'
import { Visibility, Circle } from '@mui/icons-material'
import { PresenceUser } from '../../hooks/usePresence'

interface ActiveUsersIndicatorProps {
  /** List of other users (excluding current user) */
  users: PresenceUser[]
  /** Whether the WebSocket is connected */
  isConnected?: boolean
  /** Display variant */
  variant?: 'chips' | 'avatars' | 'compact' | 'minimal'
  /** Maximum users to show before "+N more" */
  maxDisplay?: number
  /** Show connection status indicator */
  showConnectionStatus?: boolean
  /** Custom label */
  label?: string
}

/**
 * Displays other users viewing the same resource.
 * 
 * @example
 * // Show as chips
 * <ActiveUsersIndicator users={otherUsers} variant="chips" />
 * 
 * @example
 * // Show as avatar group
 * <ActiveUsersIndicator users={otherUsers} variant="avatars" maxDisplay={3} />
 * 
 * @example
 * // Compact version for tight spaces
 * <ActiveUsersIndicator users={otherUsers} variant="compact" />
 */
export function ActiveUsersIndicator({
  users,
  isConnected = true,
  variant = 'chips',
  maxDisplay = 5,
  showConnectionStatus = false,
  label = 'Also viewing',
}: ActiveUsersIndicatorProps) {
  // Don't render if no other users
  if (users.length === 0 && !showConnectionStatus) {
    return null
  }
  
  // Generate consistent color from initials
  const getAvatarColor = (initials: string) => {
    const colors = [
      '#1976d2', // blue
      '#388e3c', // green
      '#f57c00', // orange
      '#7b1fa2', // purple
      '#c2185b', // pink
      '#00796b', // teal
      '#5d4037', // brown
      '#455a64', // blue-grey
    ]
    let hash = 0
    for (let i = 0; i < initials.length; i++) {
      hash = initials.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }
  
  // Connection status indicator
  const ConnectionStatus = () => (
    <Tooltip title={isConnected ? 'Real-time sync active' : 'Reconnecting...'}>
      <Circle
        sx={{
          fontSize: 8,
          color: isConnected ? '#4caf50' : '#ff9800',
          animation: isConnected ? 'none' : 'pulse 1.5s infinite',
          '@keyframes pulse': {
            '0%': { opacity: 1 },
            '50%': { opacity: 0.4 },
            '100%': { opacity: 1 },
          },
        }}
      />
    </Tooltip>
  )
  
  // Minimal variant - just a badge with count
  if (variant === 'minimal') {
    if (users.length === 0) {
      return showConnectionStatus ? <ConnectionStatus /> : null
    }
    
    return (
      <Tooltip title={`${users.length} other${users.length > 1 ? 's' : ''} viewing: ${users.map(u => u.full_name).join(', ')}`}>
        <Badge
          badgeContent={users.length}
          color="primary"
          sx={{ cursor: 'default' }}
        >
          <Visibility sx={{ fontSize: 20, color: 'text.secondary' }} />
        </Badge>
      </Tooltip>
    )
  }
  
  // Compact variant - icon with count
  if (variant === 'compact') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {showConnectionStatus && <ConnectionStatus />}
        {users.length > 0 && (
          <Tooltip title={`${users.map(u => u.full_name).join(', ')}`}>
            <Chip
              size="small"
              icon={<Visibility sx={{ fontSize: 14 }} />}
              label={users.length}
              sx={{
                height: 22,
                fontSize: '0.75rem',
                bgcolor: 'rgba(25, 118, 210, 0.08)',
                '& .MuiChip-icon': { color: '#1976d2' },
              }}
            />
          </Tooltip>
        )}
      </Box>
    )
  }
  
  // Avatar group variant
  if (variant === 'avatars') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {showConnectionStatus && <ConnectionStatus />}
        {users.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
              {label}:
            </Typography>
            <AvatarGroup
              max={maxDisplay}
              sx={{
                '& .MuiAvatar-root': {
                  width: 28,
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: '2px solid white',
                },
              }}
            >
              {users.map((user) => (
                <Tooltip key={user.user_id} title={user.full_name}>
                  <Avatar sx={{ bgcolor: getAvatarColor(user.initials) }}>
                    {user.initials}
                  </Avatar>
                </Tooltip>
              ))}
            </AvatarGroup>
          </>
        )}
      </Box>
    )
  }
  
  // Default chips variant
  const displayUsers = users.slice(0, maxDisplay)
  const remainingCount = users.length - maxDisplay
  
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      {showConnectionStatus && <ConnectionStatus />}
      {users.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary">
            {label}:
          </Typography>
          {displayUsers.map((user) => (
            <Tooltip key={user.user_id} title={user.full_name}>
              <Chip
                size="small"
                label={user.initials}
                sx={{
                  height: 24,
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  bgcolor: getAvatarColor(user.initials),
                  color: 'white',
                  '&:hover': {
                    bgcolor: getAvatarColor(user.initials),
                    filter: 'brightness(0.9)',
                  },
                }}
              />
            </Tooltip>
          ))}
          {remainingCount > 0 && (
            <Tooltip title={users.slice(maxDisplay).map(u => u.full_name).join(', ')}>
              <Chip
                size="small"
                label={`+${remainingCount}`}
                sx={{
                  height: 24,
                  bgcolor: '#f5f5f5',
                  color: 'text.secondary',
                }}
              />
            </Tooltip>
          )}
        </>
      )}
    </Box>
  )
}

export default ActiveUsersIndicator

