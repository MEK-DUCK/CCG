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
import { Storage, People, Description, Menu, Close, CalendarMonth, History, Dashboard } from '@mui/icons-material'

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
  ]

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const handleNavClick = (path: string) => {
    navigate(path)
    setMobileOpen(false)
  }

  const drawer = (
    <Box sx={{ width: 280, bgcolor: '#FFFFFF' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 3, borderBottom: '1px solid rgba(0, 0, 0, 0.05)' }}>
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center',
            cursor: 'pointer',
            '&:hover': {
              opacity: 0.8,
            },
          }}
          onClick={() => {
            navigate('/')
            handleDrawerToggle()
          }}
        >
          <Storage sx={{ mr: 1.5, fontSize: 24, color: '#007AFF' }} />
          <Typography variant="h6" component="div" sx={{ fontWeight: 600, color: '#000000' }}>
            CCG-3 Program
          </Typography>
        </Box>
        <IconButton onClick={handleDrawerToggle} sx={{ color: '#000000' }}>
          <Close />
        </IconButton>
      </Box>
      <List sx={{ p: 1 }}>
        {navItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              onClick={() => handleNavClick(item.path)}
              selected={location.pathname === item.path}
              sx={{
                minHeight: 48,
                borderRadius: 2,
                mx: 1,
                mb: 0.5,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(0, 122, 255, 0.1)',
                  color: '#007AFF',
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: 'rgba(0, 122, 255, 0.15)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.05)',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#F2F2F7' }}>
      <AppBar 
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
        }}
      >
        <Toolbar sx={{ py: 1, justifyContent: 'center', position: 'relative', maxWidth: '1400px', mx: 'auto', width: '100%', px: { xs: 2, sm: 3 } }}>
          {isMobile ? (
            <>
              <IconButton
                onClick={handleDrawerToggle}
                sx={{ 
                  position: 'absolute',
                  left: 8,
                  color: '#000000',
                }}
              >
                <Menu />
              </IconButton>
              <Box 
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  cursor: 'pointer',
                  '&:hover': {
                    opacity: 0.8,
                  },
                }}
                onClick={() => navigate('/')}
              >
                <Storage sx={{ mr: 1.5, fontSize: 24, color: '#007AFF' }} />
                <Typography 
                  variant="h6" 
                  component="div" 
                  sx={{ 
                    fontWeight: 600,
                    fontSize: '1.125rem',
                    color: '#000000',
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
                  '&:hover': {
                    opacity: 0.8,
                  },
                }}
                onClick={() => navigate('/')}
              >
                <Storage sx={{ mr: 1.5, fontSize: 24, color: '#007AFF' }} />
                <Typography 
                  variant="h6" 
                  component="div" 
                  sx={{ 
                    fontWeight: 600,
                    fontSize: '1.125rem',
                    color: '#000000',
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
                    sx={{
                      minHeight: 44,
                      px: 2,
                      borderRadius: 10,
                      color: location.pathname === item.path ? '#007AFF' : '#000000',
                      backgroundColor: location.pathname === item.path ? 'rgba(0, 122, 255, 0.1)' : 'transparent',
                      fontWeight: location.pathname === item.path ? 600 : 500,
                      '&:hover': {
                        backgroundColor: location.pathname === item.path ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)',
                      },
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
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
              boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Container 
        maxWidth="xl" 
        sx={{ 
          mt: { xs: 3, sm: 4, md: 5 }, 
          mb: { xs: 3, sm: 4, md: 5 }, 
          flex: 1,
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        {children}
      </Container>
    </Box>
  )
}

