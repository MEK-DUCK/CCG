import { ReactNode, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  useTheme,
  Menu as MuiMenu,
  MenuItem,
  Divider,
  Chip,
} from '@mui/material'
import { Storage, People, Description, Menu, Close, CalendarMonth, History, Dashboard, Summarize, AdminPanelSettings, Logout, KeyboardArrowDown, Event } from '@mui/icons-material'
import { useAuth } from '../contexts/AuthContext'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null)
  const { user, logout, isAdmin } = useAuth()

  // Filter nav items based on user role
  const navItems = [
    { label: 'Home', path: '/', icon: <Storage /> },
    { label: 'Customers', path: '/customers', icon: <People /> },
    { label: 'Contracts', path: '/contracts', icon: <Description /> },
    { label: 'Lifting Plan', path: '/lifting-plan', icon: <CalendarMonth /> },
    { label: 'Dashboard', path: '/dashboard', icon: <Dashboard /> },
    { label: 'Calendar', path: '/calendar', icon: <Event /> },
    { label: 'Reconciliation', path: '/reconciliation', icon: <History /> },
    { label: 'Contract Summary', path: '/contract-summary', icon: <Summarize /> },
    ...(isAdmin ? [{ label: 'Admin', path: '/admin', icon: <AdminPanelSettings /> }] : []),
  ]

  const handleLogout = () => {
    setUserMenuAnchor(null)
    logout()
    navigate('/login')
  }

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const handleNavClick = (path: string) => {
    navigate(path)
    setMobileOpen(false)
  }

  const drawer = (
    <Box sx={{ width: 280, bgcolor: '#FFFFFF', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2.5, borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'opacity 0.15s ease',
            '&:hover': {
              opacity: 0.7,
            },
          }}
          onClick={() => {
            navigate('/')
            handleDrawerToggle()
          }}
        >
          <Typography variant="h6" component="div" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '1rem' }}>
            CCG-3 Program
          </Typography>
        </Box>
        <IconButton
          onClick={handleDrawerToggle}
          sx={{
            color: '#64748B',
            '&:hover': { backgroundColor: 'rgba(71, 85, 105, 0.08)' }
          }}
        >
          <Close fontSize="small" />
        </IconButton>
      </Box>
      <List sx={{ p: 1.5 }}>
        {navItems.map((item) => (
          <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => handleNavClick(item.path)}
              selected={location.pathname === item.path}
              sx={{
                minHeight: 44,
                borderRadius: 2,
                px: 1.5,
                transition: 'all 0.15s ease',
                '&.Mui-selected': {
                  backgroundColor: 'rgba(71, 85, 105, 0.1)',
                  color: '#475569',
                  '& .MuiListItemIcon-root': {
                    color: '#475569',
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(71, 85, 105, 0.15)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(71, 85, 105, 0.08)',
                },
              }}
            >
              <ListItemIcon sx={{ color: '#64748B', minWidth: 36 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontSize: '0.875rem',
                  fontWeight: location.pathname === item.path ? 600 : 500,
                  color: location.pathname === item.path ? '#475569' : '#1E293B'
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      {/* User info in mobile drawer */}
      {user && (
        <Box sx={{ mt: 'auto', p: 2, borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <Box sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: isAdmin ? '#EDE9FE' : '#E0F2FE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: isAdmin ? '#7C3AED' : '#0284C7' }}>
                {user.initials}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', color: '#1E293B' }}>{user.full_name}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#64748B' }}>{user.email}</Typography>
            </Box>
          </Box>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<Logout />}
            onClick={() => {
              handleDrawerToggle()
              handleLogout()
            }}
            sx={{
              color: '#DC2626',
              borderColor: '#FCA5A5',
              '&:hover': {
                bgcolor: '#FEE2E2',
                borderColor: '#DC2626',
              },
            }}
          >
            Sign Out
          </Button>
        </Box>
      )}
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#F1F5F9' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
        }}
      >
        <Toolbar
          sx={{
            py: 0.75,
            justifyContent: 'center',
            position: 'relative',
            width: '100%',
            minHeight: '56px !important',
            px: { xs: 2, sm: 3 },
          }}
        >
          {isMobile ? (
            <>
              <IconButton
                onClick={handleDrawerToggle}
                sx={{
                  position: 'absolute',
                  left: 8,
                  color: '#475569',
                  '&:hover': { backgroundColor: 'rgba(71, 85, 105, 0.08)' }
                }}
              >
                <Menu />
              </IconButton>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                  '&:hover': {
                    opacity: 0.7,
                  },
                }}
                onClick={() => navigate('/')}
              >
                <Typography
                  variant="h6"
                  component="div"
                  sx={{
                    fontWeight: 600,
                    fontSize: '1rem',
                    color: '#1E293B',
                  }}
                >
                  CCG-3 Program
                </Typography>
              </Box>
            </>
          ) : (
            <>
              <Box
                sx={{
                  position: 'absolute',
                  left: 24,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                  '&:hover': {
                    opacity: 0.7,
                  },
                }}
                onClick={() => navigate('/')}
              >
                <Typography
                  variant="h6"
                  component="div"
                  sx={{
                    fontWeight: 600,
                    fontSize: '1rem',
                    color: '#1E293B',
                  }}
                >
                  CCG-3 Program
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {navItems.map((item) => (
                  <Button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    startIcon={item.icon}
                    size="small"
                    sx={{
                      minHeight: 36,
                      px: 1.5,
                      borderRadius: 2,
                      fontSize: '0.8125rem',
                      color: '#475569',
                      backgroundColor: location.pathname === item.path ? 'rgba(71, 85, 105, 0.1)' : 'transparent',
                      fontWeight: location.pathname === item.path ? 600 : 500,
                      '&:hover': {
                        backgroundColor: location.pathname === item.path ? 'rgba(71, 85, 105, 0.15)' : 'rgba(71, 85, 105, 0.08)',
                      },
                      transition: 'all 0.15s ease',
                      '& .MuiButton-startIcon': {
                        marginRight: 0.75,
                        '& svg': { fontSize: '1.1rem' }
                      },
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </Box>
              {/* User Menu */}
              {user && (
                <Box sx={{ position: 'absolute', right: 24 }}>
                  <Button
                    onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                    endIcon={<KeyboardArrowDown />}
                    sx={{
                      textTransform: 'none',
                      color: '#475569',
                      borderRadius: 2,
                      px: 1.5,
                      '&:hover': { bgcolor: 'rgba(71, 85, 105, 0.08)' },
                    }}
                  >
                    <Box sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      bgcolor: isAdmin ? '#EDE9FE' : '#E0F2FE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mr: 1,
                    }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: isAdmin ? '#7C3AED' : '#0284C7' }}>
                        {user.initials}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 500, fontSize: '0.875rem' }}>
                      {user.full_name}
                    </Typography>
                  </Button>
                </Box>
              )}
            </>
          )}
        </Toolbar>
      </AppBar>
      {/* User Menu Dropdown */}
      <MuiMenu
        anchorEl={userMenuAnchor}
        open={Boolean(userMenuAnchor)}
        onClose={() => setUserMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 200,
            borderRadius: 2,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            bgcolor: '#FFFFFF',
            border: '1px solid rgba(148, 163, 184, 0.12)',
          }
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography sx={{ fontWeight: 600, color: '#1E293B' }}>{user?.full_name}</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#64748B' }}>{user?.email}</Typography>
          <Chip
            label={isAdmin ? 'Admin' : 'User'}
            size="small"
            sx={{
              mt: 1,
              bgcolor: isAdmin ? '#EDE9FE' : '#E0F2FE',
              color: isAdmin ? '#7C3AED' : '#0284C7',
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
          />
        </Box>
        <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.12)' }} />
        <MenuItem onClick={handleLogout} sx={{ color: '#DC2626', py: 1.5 }}>
          <Logout sx={{ mr: 1.5, fontSize: 18 }} />
          Sign Out
        </MenuItem>
      </MuiMenu>
      <Box component="nav">
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: 280,
              boxShadow: '0px 25px 50px -12px rgba(15, 23, 42, 0.25)',
              border: 'none',
              bgcolor: '#FFFFFF',
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Container
        maxWidth={false}
        disableGutters
        sx={{
          mt: { xs: 2, sm: 3, md: 4 },
          mb: { xs: 3, sm: 4, md: 5 },
          flex: 1,
          width: '100%',
          px: { xs: 2, sm: 3, md: 4, lg: 5 },
        }}
      >
        {children}
      </Container>
    </Box>
  )
}
