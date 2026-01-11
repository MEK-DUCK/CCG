import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  TextField,
  InputAdornment,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Collapse,
  LinearProgress,
  Badge,
} from '@mui/material'
import {
  Visibility,
  Search,
  TrendingUp,
  LocalShipping,
  Person,
  Anchor,
  Description,
  ExpandMore,
  ExpandLess,
  Refresh,
  ArrowForward,
  Assignment,
  Speed,
  Inventory,
} from '@mui/icons-material'
import client, { contractAPI, customerAPI } from '../api/client'
import type { Contract, Customer } from '../types'
import { getContractTypeColor, getProductColor } from '../utils/chipColors'

// Analytics types
interface AnalyticsData {
  inspector_stats: Array<{ name: string; cargo_count: number }>
  port_stats: Array<{ port: string; cargo_count: number }>
  monthly_trends: Array<{ month: number; year: number; label: string; cargo_count: number }>
  customer_stats: Array<{ customer: string; cargo_count: number }>
  status_stats: Array<{ status: string; count: number }>
  product_stats: Array<{
    product: string
    completed_quantity: number
    cargo_count: number
  }>
  last_updated: string
}

// Modern stat card component
interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  gradient: string
  trend?: { value: number; label: string }
}

function StatCard({ title, value, subtitle, icon, gradient, trend }: StatCardProps) {
  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 3,
        background: gradient,
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 140,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 12px 20px rgba(0,0,0,0.15)',
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: -20,
          right: -20,
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 500, mb: 0.5 }}>
            {title}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {value}
          </Typography>
        </Box>
        <Box sx={{
          p: 1,
          borderRadius: 2,
          bgcolor: 'rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {icon}
        </Box>
      </Box>
      {(subtitle || trend) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
          {subtitle && (
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              {subtitle}
            </Typography>
          )}
          {trend && (
            <Chip
              icon={<TrendingUp sx={{ fontSize: 14, color: '#fff !important' }} />}
              label={`${trend.value > 0 ? '+' : ''}${trend.value}% ${trend.label}`}
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.25)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.7rem',
              }}
            />
          )}
        </Box>
      )}
    </Paper>
  )
}

// Progress bar component
interface ProgressItemProps {
  label: string
  value: number
  maxValue: number
  color: string
  suffix?: string
}

function ProgressItem({ label, value, maxValue, color, suffix = '' }: ProgressItemProps) {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151' }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, color }}>
          {value.toLocaleString()}{suffix}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: '#F1F5F9',
          '& .MuiLinearProgress-bar': {
            borderRadius: 4,
            bgcolor: color,
          },
        }}
      />
    </Box>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [authorities, setAuthorities] = useState<any[]>([])
  const [authoritiesLoading, setAuthoritiesLoading] = useState(true)
  const [authorityFilter, setAuthorityFilter] = useState({
    search: '',
    type: 'all',
    product: ''
  })
  const [expandedSections, setExpandedSections] = useState({
    analytics: true,
    authorities: true,
    contracts: true,
  })

  const fetchAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true)
      const response = await client.get('/api/admin/analytics')
      setAnalytics(response.data)
    } catch (err: any) {
      console.error('Error fetching analytics:', err)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    fetchAnalytics()
    loadAuthorities()
  }, [fetchAnalytics])

  const loadAuthorities = async () => {
    try {
      setAuthoritiesLoading(true)
      const response = await contractAPI.getAllAuthorities()
      setAuthorities(response.data.authorities || [])
    } catch (error) {
      console.error('Error loading authorities:', error)
    } finally {
      setAuthoritiesLoading(false)
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const [contractsRes, customersRes] = await Promise.all([
        contractAPI.getAll(),
        customerAPI.getAll(),
      ])
      setContracts(contractsRes.data || [])
      setCustomers(customersRes.data || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getCustomerName = (customerId: number) => {
    const customer = customers.find(c => c.id === customerId)
    return customer?.name || 'Unknown'
  }

  const filteredContracts = contracts.filter((contract) => {
    if (!searchText.trim()) return true
    const searchLower = searchText.toLowerCase().trim()
    const customerName = getCustomerName(contract.customer_id).toLowerCase()
    const contractNumber = contract.contract_number.toLowerCase()
    const products = contract.products && Array.isArray(contract.products)
      ? contract.products.map((p: any) => p.name || '').join(' ').toLowerCase()
      : ''
    const contractType = contract.contract_type.toLowerCase()
    return (
      customerName.includes(searchLower) ||
      contractNumber.includes(searchLower) ||
      products.includes(searchLower) ||
      contractType.includes(searchLower)
    )
  })

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Calculate summary stats
  const totalCargos = analytics?.status_stats?.reduce((sum, s) => sum + s.count, 0) || 0
  const completedCargos = analytics?.status_stats?.find(s => s.status === 'COMPLETED')?.count || 0
  const totalVolume = analytics?.product_stats?.reduce((sum, s) => sum + s.completed_quantity, 0) || 0

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        flexDirection: 'column',
        gap: 2,
      }}>
        <CircularProgress size={48} thickness={4} />
        <Typography color="text.secondary">Loading dashboard...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#1E293B', mb: 0.5 }}>
          Dashboard
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748B' }}>
          Overview of your oil lifting operations
        </Typography>
      </Box>

      {/* Summary Stats */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
        gap: 2.5,
        mb: 4,
      }}>
        <StatCard
          title="Total Cargos"
          value={totalCargos}
          subtitle={`${completedCargos} completed`}
          icon={<LocalShipping />}
          gradient="linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)"
        />
        <StatCard
          title="Total Volume"
          value={`${totalVolume.toLocaleString()} KT`}
          subtitle="Completed shipments"
          icon={<Inventory />}
          gradient="linear-gradient(135deg, #10B981 0%, #047857 100%)"
        />
        <StatCard
          title="Active Contracts"
          value={contracts.length}
          subtitle={`${customers.length} customers`}
          icon={<Description />}
          gradient="linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)"
        />
        <StatCard
          title="Authorities"
          value={authorities.length}
          subtitle="Amendments & top-ups"
          icon={<Assignment />}
          gradient="linear-gradient(135deg, #F59E0B 0%, #D97706 100%)"
        />
      </Box>

      {/* Analytics Section */}
      <Paper sx={{ mb: 3, borderRadius: 2, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            bgcolor: '#F8FAFC',
            borderBottom: expandedSections.analytics ? '1px solid #E2E8F0' : 'none',
            cursor: 'pointer',
          }}
          onClick={() => toggleSection('analytics')}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              p: 1,
              borderRadius: 1.5,
              bgcolor: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <TrendingUp sx={{ color: '#3B82F6' }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
                Analytics
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748B' }}>
                Performance metrics and trends
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); fetchAnalytics(); }}>
              <Refresh sx={{ fontSize: 20, color: '#64748B' }} />
            </IconButton>
            <IconButton size="small">
              {expandedSections.analytics ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          </Box>
        </Box>

        <Collapse in={expandedSections.analytics}>
          {analyticsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : (
            <Box sx={{ p: 3 }}>
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' },
                gap: 3,
              }}>
                {/* Inspector Usage */}
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Person sx={{ color: '#3B82F6' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                      Inspector Usage
                    </Typography>
                  </Box>
                  {analytics?.inspector_stats && analytics.inspector_stats.length > 0 ? (
                    <>
                      {analytics.inspector_stats.map((stat, idx) => (
                        <ProgressItem
                          key={idx}
                          label={stat.name}
                          value={stat.cargo_count}
                          maxValue={Math.max(...analytics.inspector_stats.map(s => s.cargo_count))}
                          color="#3B82F6"
                          suffix=" cargos"
                        />
                      ))}
                    </>
                  ) : (
                    <Typography color="text.secondary" variant="body2">No data available</Typography>
                  )}
                </Paper>

                {/* Port Usage */}
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Anchor sx={{ color: '#10B981' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                      Load Port Usage
                    </Typography>
                  </Box>
                  {analytics?.port_stats && analytics.port_stats.length > 0 ? (
                    <>
                      {analytics.port_stats.map((stat, idx) => (
                        <ProgressItem
                          key={idx}
                          label={stat.port}
                          value={stat.cargo_count}
                          maxValue={Math.max(...analytics.port_stats.map(s => s.cargo_count))}
                          color="#10B981"
                          suffix=" cargos"
                        />
                      ))}
                    </>
                  ) : (
                    <Typography color="text.secondary" variant="body2">No data available</Typography>
                  )}
                </Paper>

                {/* Customer Distribution */}
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Person sx={{ color: '#8B5CF6' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                      Cargos by Customer
                    </Typography>
                  </Box>
                  {analytics?.customer_stats && analytics.customer_stats.length > 0 ? (
                    <>
                      {analytics.customer_stats.map((stat, idx) => (
                        <ProgressItem
                          key={idx}
                          label={stat.customer}
                          value={stat.cargo_count}
                          maxValue={Math.max(...analytics.customer_stats.map(s => s.cargo_count))}
                          color="#8B5CF6"
                          suffix=" cargos"
                        />
                      ))}
                    </>
                  ) : (
                    <Typography color="text.secondary" variant="body2">No data available</Typography>
                  )}
                </Paper>

                {/* Status Distribution */}
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Speed sx={{ color: '#F59E0B' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                      Cargo Status
                    </Typography>
                  </Box>
                  {analytics?.status_stats && analytics.status_stats.length > 0 ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {analytics.status_stats.map((stat, idx) => {
                        const statusColors: Record<string, { bg: string; text: string }> = {
                          'PENDING': { bg: '#FEF3C7', text: '#B45309' },
                          'SCHEDULED': { bg: '#DBEAFE', text: '#1E40AF' },
                          'LOADING': { bg: '#FEE2E2', text: '#B91C1C' },
                          'COMPLETED': { bg: '#D1FAE5', text: '#047857' },
                          'CANCELLED': { bg: '#F1F5F9', text: '#475569' },
                        }
                        const colors = statusColors[stat.status] || { bg: '#F1F5F9', text: '#475569' }
                        return (
                          <Chip
                            key={idx}
                            label={`${stat.status}: ${stat.count}`}
                            sx={{
                              bgcolor: colors.bg,
                              color: colors.text,
                              fontWeight: 600,
                              fontSize: '0.8rem',
                            }}
                          />
                        )
                      })}
                    </Box>
                  ) : (
                    <Typography color="text.secondary" variant="body2">No data available</Typography>
                  )}
                </Paper>

                {/* Product Volumes */}
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, gridColumn: { lg: 'span 2' } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Inventory sx={{ color: '#EC4899' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                      Completed Volumes by Product
                    </Typography>
                  </Box>
                  {analytics?.product_stats && analytics.product_stats.length > 0 ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                      {analytics.product_stats.map((stat, idx) => {
                        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
                        const color = colors[idx % colors.length]
                        return (
                          <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{
                              width: 48,
                              height: 48,
                              borderRadius: 2,
                              bgcolor: `${color}15`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              <Typography sx={{ fontWeight: 700, color, fontSize: '0.9rem' }}>
                                {stat.cargo_count}
                              </Typography>
                            </Box>
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B' }}>
                                {stat.product}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#64748B' }}>
                                {stat.completed_quantity.toLocaleString()} KT
                              </Typography>
                            </Box>
                          </Box>
                        )
                      })}
                    </Box>
                  ) : (
                    <Typography color="text.secondary" variant="body2">No data available</Typography>
                  )}
                </Paper>
              </Box>

              {/* Monthly Trends */}
              {analytics?.monthly_trends && analytics.monthly_trends.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mt: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <TrendingUp sx={{ color: '#06B6D4' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                      Monthly Cargo Trends
                    </Typography>
                  </Box>
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 0.5,
                    height: 160,
                    pt: 2,
                  }}>
                    {analytics.monthly_trends.map((trend, idx) => {
                      const maxCount = Math.max(...analytics.monthly_trends.map(t => t.cargo_count), 1)
                      const heightPercent = (trend.cargo_count / maxCount) * 100
                      return (
                        <Tooltip key={idx} title={`${trend.label}: ${trend.cargo_count} cargos`} arrow>
                          <Box sx={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            height: '100%',
                            justifyContent: 'flex-end',
                          }}>
                            {trend.cargo_count > 0 && (
                              <Typography variant="caption" sx={{ mb: 0.5, fontWeight: 600, color: '#06B6D4', fontSize: '0.65rem' }}>
                                {trend.cargo_count}
                              </Typography>
                            )}
                            <Box sx={{
                              width: '100%',
                              height: `${Math.max(heightPercent, 5)}%`,
                              background: 'linear-gradient(180deg, #06B6D4 0%, #0891B2 100%)',
                              borderRadius: '4px 4px 0 0',
                              minHeight: 4,
                              transition: 'height 0.5s ease-in-out',
                              '&:hover': {
                                background: 'linear-gradient(180deg, #22D3EE 0%, #06B6D4 100%)',
                              }
                            }} />
                            <Typography
                              variant="caption"
                              sx={{
                                mt: 1,
                                fontSize: '0.55rem',
                                color: '#64748B',
                                writingMode: 'vertical-rl',
                                textOrientation: 'mixed',
                                transform: 'rotate(180deg)',
                                height: 40,
                                fontWeight: 500,
                              }}
                            >
                              {trend.label}
                            </Typography>
                          </Box>
                        </Tooltip>
                      )
                    })}
                  </Box>
                </Paper>
              )}
            </Box>
          )}
        </Collapse>
      </Paper>

      {/* Authority Management Section */}
      <Paper sx={{ mb: 3, borderRadius: 2, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            bgcolor: '#F8FAFC',
            borderBottom: expandedSections.authorities ? '1px solid #E2E8F0' : 'none',
            cursor: 'pointer',
          }}
          onClick={() => toggleSection('authorities')}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              p: 1,
              borderRadius: 1.5,
              bgcolor: '#FEF3C7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Assignment sx={{ color: '#F59E0B' }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
                Authority Management
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748B' }}>
                Amendments, top-ups, and deferrals
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Badge badgeContent={authorities.length} color="warning" max={99}>
              <Box />
            </Badge>
            <IconButton size="small">
              {expandedSections.authorities ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          </Box>
        </Box>

        <Collapse in={expandedSections.authorities}>
          <Box sx={{ p: 2, bgcolor: '#fff', borderBottom: '1px solid #E2E8F0' }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={authorityFilter.type}
                  onChange={(e) => setAuthorityFilter({ ...authorityFilter, type: e.target.value })}
                  label="Type"
                >
                  <MenuItem value="all">All Types</MenuItem>
                  <MenuItem value="amendment">Amendments</MenuItem>
                  <MenuItem value="topup">Top-Ups</MenuItem>
                  <MenuItem value="defer">Defer/Advance</MenuItem>
                </Select>
              </FormControl>
              <TextField
                placeholder="Filter by product..."
                variant="outlined"
                size="small"
                value={authorityFilter.product}
                onChange={(e) => setAuthorityFilter({ ...authorityFilter, product: e.target.value })}
                sx={{ minWidth: 150 }}
              />
              <TextField
                placeholder="Search authorities..."
                variant="outlined"
                size="small"
                value={authorityFilter.search}
                onChange={(e) => setAuthorityFilter({ ...authorityFilter, search: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search sx={{ color: '#9CA3AF' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 220, flexGrow: 1 }}
              />
            </Box>
          </Box>

          {authoritiesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : (
            (() => {
              let filtered = authorities.filter((auth) => {
                if (authorityFilter.type === 'amendment' && auth.type !== 'Amendment') return false
                if (authorityFilter.type === 'topup' && !auth.type.includes('Top-Up')) return false
                if (authorityFilter.type === 'defer' && auth.type !== 'Defer/Advance') return false
                if (authorityFilter.product && !auth.product_name?.toLowerCase().includes(authorityFilter.product.toLowerCase())) return false
                if (authorityFilter.search) {
                  const searchLower = authorityFilter.search.toLowerCase()
                  return (
                    auth.contract_number?.toLowerCase().includes(searchLower) ||
                    auth.customer_name?.toLowerCase().includes(searchLower) ||
                    auth.product_name?.toLowerCase().includes(searchLower) ||
                    auth.authority_reference?.toLowerCase().includes(searchLower) ||
                    auth.reason?.toLowerCase().includes(searchLower) ||
                    auth.description?.toLowerCase().includes(searchLower)
                  )
                }
                return true
              })

              return filtered.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="body1" color="text.secondary">
                    No authorities found.
                  </Typography>
                </Box>
              ) : (
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Contract</TableCell>
                        <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Customer</TableCell>
                        <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Product</TableCell>
                        <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Reference</TableCell>
                        <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }} align="right">Quantity</TableCell>
                        <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Date</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filtered.slice(0, 20).map((auth, idx) => (
                        <TableRow key={idx} hover sx={{ '&:hover': { bgcolor: '#F8FAFC' } }}>
                          <TableCell>
                            <Chip
                              label={auth.type}
                              size="small"
                              sx={{
                                fontWeight: 600,
                                bgcolor: auth.type === 'Amendment' ? '#DBEAFE' : auth.type === 'Defer/Advance' ? '#FEF3C7' : '#D1FAE5',
                                color: auth.type === 'Amendment' ? '#1E40AF' : auth.type === 'Defer/Advance' ? '#B45309' : '#047857',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              onClick={() => navigate(`/contracts/${auth.contract_id}/dashboard`)}
                              sx={{ textTransform: 'none', fontWeight: 600, color: '#3B82F6' }}
                              endIcon={<ArrowForward sx={{ fontSize: 14 }} />}
                            >
                              {auth.contract_number}
                            </Button>
                          </TableCell>
                          <TableCell sx={{ color: '#374151' }}>{auth.customer_name}</TableCell>
                          <TableCell>
                            <Chip
                              label={auth.product_name}
                              size="small"
                              sx={{ fontWeight: 500, ...getProductColor(auth.product_name) }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6B7280' }}>
                            {auth.authority_reference || '-'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, color: '#1E293B' }}>
                            {auth.type === 'Amendment'
                              ? `${auth.quantity_change > 0 ? '+' : ''}${auth.quantity_change?.toLocaleString() || 0} KT`
                              : auth.type === 'Defer/Advance'
                                ? `${auth.quantity_display || auth.quantity?.toLocaleString() || 0} KT`
                                : `${auth.quantity?.toLocaleString() || 0} KT`
                            }
                          </TableCell>
                          <TableCell sx={{ color: '#6B7280', fontSize: '0.85rem' }}>
                            {auth.authorization_date
                              ? new Date(auth.authorization_date).toLocaleDateString()
                              : auth.effective_date
                                ? new Date(auth.effective_date).toLocaleDateString()
                                : auth.created_at
                                  ? new Date(auth.created_at).toLocaleDateString()
                                  : '-'
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )
            })()
          )}
        </Collapse>
      </Paper>

      {/* Contracts Section */}
      <Paper sx={{ borderRadius: 2, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            bgcolor: '#F8FAFC',
            borderBottom: expandedSections.contracts ? '1px solid #E2E8F0' : 'none',
            cursor: 'pointer',
          }}
          onClick={() => toggleSection('contracts')}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              p: 1,
              borderRadius: 1.5,
              bgcolor: '#EDE9FE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Description sx={{ color: '#8B5CF6' }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
                Contract Dashboards
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748B' }}>
                Quick access to contract details
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Badge badgeContent={contracts.length} color="primary" max={99}>
              <Box />
            </Badge>
            <IconButton size="small">
              {expandedSections.contracts ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          </Box>
        </Box>

        <Collapse in={expandedSections.contracts}>
          <Box sx={{ p: 2, bgcolor: '#fff', borderBottom: '1px solid #E2E8F0' }}>
            <TextField
              placeholder="Search contracts..."
              variant="outlined"
              size="small"
              fullWidth
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: '#9CA3AF' }} />
                  </InputAdornment>
                ),
              }}
              sx={{ maxWidth: 400 }}
            />
          </Box>

          {contracts.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No contracts found.
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Contract</TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Customer</TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Products</TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }}>Period</TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: '#F8FAFC' }} align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredContracts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                          No contracts match your search.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredContracts.map((contract) => (
                      <TableRow key={contract.id} hover sx={{ '&:hover': { bgcolor: '#F8FAFC' } }}>
                        <TableCell sx={{ fontWeight: 600, color: '#1E293B' }}>
                          {contract.contract_number}
                        </TableCell>
                        <TableCell sx={{ color: '#374151' }}>
                          {getCustomerName(contract.customer_id)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={contract.contract_type}
                            size="small"
                            sx={{ fontWeight: 600, ...getContractTypeColor(contract.contract_type) }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {contract.products && contract.products.length > 0
                              ? contract.products.slice(0, 2).map((p: any, idx: number) => (
                                <Chip
                                  key={idx}
                                  label={p.name || 'Unknown'}
                                  size="small"
                                  sx={{ fontSize: '0.7rem', ...getProductColor(p.name) }}
                                />
                              ))
                              : <Typography variant="body2" color="text.secondary">-</Typography>
                            }
                            {contract.products && contract.products.length > 2 && (
                              <Chip
                                label={`+${contract.products.length - 2}`}
                                size="small"
                                sx={{ fontSize: '0.7rem', bgcolor: '#F1F5F9', color: '#64748B' }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ color: '#6B7280', fontSize: '0.85rem' }}>
                          {new Date(contract.start_period).toLocaleDateString()} - {new Date(contract.end_period).toLocaleDateString()}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => navigate(`/contracts/${contract.id}/dashboard`)}
                            sx={{
                              borderRadius: 1.5,
                              textTransform: 'none',
                              fontWeight: 600,
                              borderColor: '#E2E8F0',
                              color: '#3B82F6',
                              '&:hover': {
                                borderColor: '#3B82F6',
                                bgcolor: '#EFF6FF',
                              },
                            }}
                            endIcon={<Visibility sx={{ fontSize: 16 }} />}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Collapse>
      </Paper>
    </Box>
  )
}
