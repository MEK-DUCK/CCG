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
} from '@mui/material'
import { Storage, People, Description, Menu, Close, CalendarMonth, History, Dashboard, Summarize, AdminPanelSettings } from '@mui/icons-material'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = [
    { label: 'Home', path: '/', icon: <Storage /> },
    { label: 'Customers', path: '/customers', icon: <People /> },
    { label: 'Contracts', path: '/contracts', icon: <Description /> },
    { label: 'Lifting Plan', path: '/lifting-plan', icon: <CalendarMonth /> },
    { label: 'Dashboard', path: '/dashboard', icon: <Dashboard /> },
    { label: 'Reconciliation', path: '/reconciliation', icon: <History /> },
    { label: 'Contract Summary', path: '/contract-summary', icon: <Summarize /> },
    { label: 'Admin', path: '/admin', icon: <AdminPanelSettings /> },
  ]

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
          <Box sx={{ 
            mr: 1.5, 
            width: 32, 
            height: 32, 
            borderRadius: 2, 
            bgcolor: 'rgba(71, 85, 105, 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}>
            <Storage sx={{ fontSize: 20, color: '#475569' }} />
          </Box>
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
                  backgroundColor: '#F1F5F9',
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
                  color: location.pathname === item.path ? '#475569' : '#334155'
                }} 
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#F8FAFC' }}>
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
                <Box sx={{ 
                  mr: 1.5, 
                  width: 28, 
                  height: 28, 
                  borderRadius: 1.5, 
                  bgcolor: 'rgba(71, 85, 105, 0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <Storage sx={{ fontSize: 18, color: '#475569' }} />
                </Box>
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
                <Box sx={{ 
                  mr: 1.5, 
                  width: 32, 
                  height: 32, 
                  borderRadius: 2, 
                  bgcolor: 'rgba(71, 85, 105, 0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <Storage sx={{ fontSize: 20, color: '#475569' }} />
                </Box>
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
                      color: location.pathname === item.path ? '#475569' : '#475569',
                      backgroundColor: location.pathname === item.path ? 'rgba(71, 85, 105, 0.1)' : 'transparent',
                      fontWeight: location.pathname === item.path ? 600 : 500,
                      '&:hover': {
                        backgroundColor: location.pathname === item.path ? 'rgba(71, 85, 105, 0.15)' : '#F1F5F9',
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
            </>
          )}
        </Toolbar>
      </AppBar>
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

