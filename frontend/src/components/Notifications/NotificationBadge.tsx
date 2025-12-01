import { IconButton, Badge, Popover, Box, Typography, List, ListItem, ListItemText, Divider, Chip, Button } from '@mui/material'
import { Notifications as NotificationsIcon, Clear } from '@mui/icons-material'
import { useState } from 'react'
import type { LaycanAlert } from '../../utils/alertUtils'
import { getAlertColor, getAlertMessage } from '../../utils/alertUtils'

interface NotificationBadgeProps {
  alerts: LaycanAlert[]
  criticalCount: number
  warningCount: number
  infoCount: number
  onClearAll?: () => void
}

export default function NotificationBadge({
  alerts,
  criticalCount: _criticalCount,
  warningCount: _warningCount,
  infoCount: _infoCount,
  onClearAll,
}: NotificationBadgeProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())

  // Filter out dismissed alerts
  const visibleAlerts = alerts.filter((alert) => !dismissedAlerts.has(alert.id))
  const visibleCriticalCount = visibleAlerts.filter((a) => a.severity === 'critical').length
  const visibleWarningCount = visibleAlerts.filter((a) => a.severity === 'warning').length
  const visibleTotalCount = visibleCriticalCount + visibleWarningCount

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleDismiss = (alertId: string) => {
    setDismissedAlerts((prev) => new Set([...prev, alertId]))
  }

  const handleClearAll = () => {
    const allAlertIds = new Set(alerts.map((a) => a.id))
    setDismissedAlerts(allAlertIds)
    if (onClearAll) {
      onClearAll()
    }
  }

  const open = Boolean(anchorEl)

  // Group visible alerts by severity
  const criticalAlerts = visibleAlerts.filter((a) => a.severity === 'critical')
  const warningAlerts = visibleAlerts.filter((a) => a.severity === 'warning')
  const infoAlerts = visibleAlerts.filter((a) => a.severity === 'info')

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClick}
        sx={{ position: 'relative' }}
      >
        <Badge badgeContent={visibleTotalCount} color="error" max={99}>
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            width: 400,
            maxHeight: 600,
            mt: 1,
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Laycan Alerts
            </Typography>
            {visibleAlerts.length > 0 && (
              <Button
                size="small"
                startIcon={<Clear />}
                onClick={handleClearAll}
                sx={{ textTransform: 'none' }}
              >
                Clear All
              </Button>
            )}
          </Box>
          {visibleAlerts.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No alerts at this time
            </Typography>
          ) : (
            <List sx={{ maxHeight: 500, overflow: 'auto' }}>
              {criticalAlerts.length > 0 && (
                <>
                  <Typography variant="subtitle2" color="error" sx={{ px: 2, py: 1, fontWeight: 600 }}>
                    Critical ({criticalAlerts.length})
                  </Typography>
                  {criticalAlerts.map((alert) => (
                    <ListItem 
                      key={alert.id} 
                      sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1 }}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleDismiss(alert.id)}
                          sx={{ color: 'text.secondary' }}
                        >
                          <Clear fontSize="small" />
                        </IconButton>
                      }
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mb: 0.5 }}>
                        <Chip
                          label={getAlertMessage(alert.daysUntil, alert.isOverdue)}
                          color={getAlertColor(alert.severity)}
                          size="small"
                          sx={{ mr: 1 }}
                        />
                      </Box>
                      <ListItemText
                        primary={alert.vesselName}
                        secondary={
                          <>
                            <Typography variant="body2" component="span">
                              {alert.contractNumber}
                            </Typography>
                            {alert.customerName && (
                              <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                                {alert.customerName}
                              </Typography>
                            )}
                            <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                              Laycan: {alert.laycan}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                  {warningAlerts.length > 0 && <Divider sx={{ my: 1 }} />}
                </>
              )}
              {warningAlerts.length > 0 && (
                <>
                  <Typography variant="subtitle2" color="warning.main" sx={{ px: 2, py: 1, fontWeight: 600 }}>
                    Warning ({warningAlerts.length})
                  </Typography>
                  {warningAlerts.map((alert) => (
                    <ListItem 
                      key={alert.id} 
                      sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1 }}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleDismiss(alert.id)}
                          sx={{ color: 'text.secondary' }}
                        >
                          <Clear fontSize="small" />
                        </IconButton>
                      }
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mb: 0.5 }}>
                        <Chip
                          label={getAlertMessage(alert.daysUntil, alert.isOverdue)}
                          color={getAlertColor(alert.severity)}
                          size="small"
                          sx={{ mr: 1 }}
                        />
                      </Box>
                      <ListItemText
                        primary={alert.vesselName}
                        secondary={
                          <>
                            <Typography variant="body2" component="span">
                              {alert.contractNumber}
                            </Typography>
                            {alert.customerName && (
                              <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                                {alert.customerName}
                              </Typography>
                            )}
                            <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                              Laycan: {alert.laycan}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                  {infoAlerts.length > 0 && <Divider sx={{ my: 1 }} />}
                </>
              )}
              {infoAlerts.length > 0 && (
                <>
                  <Typography variant="subtitle2" color="info.main" sx={{ px: 2, py: 1, fontWeight: 600 }}>
                    Info ({infoAlerts.length})
                  </Typography>
                  {infoAlerts.map((alert) => (
                    <ListItem 
                      key={alert.id} 
                      sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1 }}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleDismiss(alert.id)}
                          sx={{ color: 'text.secondary' }}
                        >
                          <Clear fontSize="small" />
                        </IconButton>
                      }
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mb: 0.5 }}>
                        <Chip
                          label={getAlertMessage(alert.daysUntil, alert.isOverdue)}
                          color={getAlertColor(alert.severity)}
                          size="small"
                          sx={{ mr: 1 }}
                        />
                      </Box>
                      <ListItemText
                        primary={alert.vesselName}
                        secondary={
                          <>
                            <Typography variant="body2" component="span">
                              {alert.contractNumber}
                            </Typography>
                            {alert.customerName && (
                              <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                                {alert.customerName}
                              </Typography>
                            )}
                            <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                              Laycan: {alert.laycan}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                </>
              )}
            </List>
          )}
        </Box>
      </Popover>
    </>
  )
}

