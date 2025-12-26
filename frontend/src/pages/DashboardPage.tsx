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
  Grid,
  Card,
  CardContent,
  Divider,
  Tooltip,
} from '@mui/material'
import { Visibility, Search } from '@mui/icons-material'
import client, { contractAPI, customerAPI } from '../api/client'
import type { Contract, Customer } from '../types'

// Analytics types
interface AnalyticsData {
  inspector_stats: Array<{ name: string; cargo_count: number }>
  port_stats: Array<{ port: string; cargo_count: number }>
  monthly_trends: Array<{ month: number; year: number; label: string; cargo_count: number }>
  customer_stats: Array<{ customer: string; cargo_count: number }>
  status_stats: Array<{ status: string; count: number }>
  product_stats: Array<{
    product: string
    planned_quantity: number
    actual_quantity: number
    cargo_count: number
    plan_count: number
    utilization: number
  }>
  product_mix: Array<{ product: string; quantity: number; percentage: number }>
  monthly_product_trends: Array<{
    month: number
    year: number
    label: string
    products: Record<string, number>
  }>
  last_updated: string
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

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
  }, [fetchAnalytics])

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

  // Filter contracts based on search text
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

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Analytics Dashboard */}
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
        📊 Analytics Dashboard
      </Typography>
      
      {analyticsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* Inspector Usage Statistics */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#1E40AF' }}>
                  🔍 Inspector Usage
                </Typography>
                {analytics?.inspector_stats && analytics.inspector_stats.length > 0 ? (
                  <Box>
                    {analytics.inspector_stats.map((stat, idx) => {
                      const maxCount = Math.max(...analytics.inspector_stats.map(s => s.cargo_count))
                      const percentage = maxCount > 0 ? (stat.cargo_count / maxCount) * 100 : 0
                      return (
                        <Box key={idx} sx={{ mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {stat.name}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#1E40AF' }}>
                              {stat.cargo_count} cargos
                            </Typography>
                          </Box>
                          <Box sx={{ 
                            height: 8, 
                            bgcolor: '#E0E7FF', 
                            borderRadius: 1,
                            overflow: 'hidden'
                          }}>
                            <Box sx={{ 
                              height: '100%', 
                              width: `${percentage}%`,
                              bgcolor: '#3B82F6',
                              borderRadius: 1,
                              transition: 'width 0.5s ease-in-out'
                            }} />
                          </Box>
                        </Box>
                      )
                    })}
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
                      <Typography variant="body2" color="text.secondary">
                        Total inspections: {analytics.inspector_stats.reduce((sum, s) => sum + s.cargo_count, 0)}
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography color="text.secondary">No inspector data available</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Port Usage Statistics */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#047857' }}>
                  🚢 Load Port Usage
                </Typography>
                {analytics?.port_stats && analytics.port_stats.length > 0 ? (
                  <Box>
                    {analytics.port_stats.map((stat, idx) => {
                      const maxCount = Math.max(...analytics.port_stats.map(s => s.cargo_count))
                      const percentage = maxCount > 0 ? (stat.cargo_count / maxCount) * 100 : 0
                      return (
                        <Box key={idx} sx={{ mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {stat.port}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#047857' }}>
                              {stat.cargo_count} cargos
                            </Typography>
                          </Box>
                          <Box sx={{ 
                            height: 8, 
                            bgcolor: '#D1FAE5', 
                            borderRadius: 1,
                            overflow: 'hidden'
                          }}>
                            <Box sx={{ 
                              height: '100%', 
                              width: `${percentage}%`,
                              bgcolor: '#10B981',
                              borderRadius: 1,
                              transition: 'width 0.5s ease-in-out'
                            }} />
                          </Box>
                        </Box>
                      )
                    })}
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
                      <Typography variant="body2" color="text.secondary">
                        Total port calls: {analytics.port_stats.reduce((sum, s) => sum + s.cargo_count, 0)}
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography color="text.secondary">No port data available</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Customer Distribution */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#7C3AED' }}>
                  👥 Cargos by Customer
                </Typography>
                {analytics?.customer_stats && analytics.customer_stats.length > 0 ? (
                  <Box>
                    {analytics.customer_stats.map((stat, idx) => {
                      const maxCount = Math.max(...analytics.customer_stats.map(s => s.cargo_count))
                      const percentage = maxCount > 0 ? (stat.cargo_count / maxCount) * 100 : 0
                      return (
                        <Box key={idx} sx={{ mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {stat.customer}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#7C3AED' }}>
                              {stat.cargo_count} cargos
                            </Typography>
                          </Box>
                          <Box sx={{ 
                            height: 8, 
                            bgcolor: '#EDE9FE', 
                            borderRadius: 1,
                            overflow: 'hidden'
                          }}>
                            <Box sx={{ 
                              height: '100%', 
                              width: `${percentage}%`,
                              bgcolor: '#8B5CF6',
                              borderRadius: 1,
                              transition: 'width 0.5s ease-in-out'
                            }} />
                          </Box>
                        </Box>
                      )
                    })}
                  </Box>
                ) : (
                  <Typography color="text.secondary">No customer data available</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Cargo Status Distribution */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#DC2626' }}>
                  📦 Cargo Status Distribution
                </Typography>
                {analytics?.status_stats && analytics.status_stats.length > 0 ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {analytics.status_stats.map((stat, idx) => {
                      const statusColors: Record<string, { bg: string; text: string; border: string }> = {
                        'PENDING': { bg: '#FEF3C7', text: '#B45309', border: '#F59E0B' },
                        'SCHEDULED': { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' },
                        'LOADING': { bg: '#FEE2E2', text: '#B91C1C', border: '#EF4444' },
                        'COMPLETED': { bg: '#D1FAE5', text: '#047857', border: '#10B981' },
                        'CANCELLED': { bg: '#F1F5F9', text: '#475569', border: '#94A3B8' },
                      }
                      const colors = statusColors[stat.status] || { bg: '#F1F5F9', text: '#475569', border: '#94A3B8' }
                      return (
                        <Card 
                          key={idx} 
                          sx={{ 
                            minWidth: 100, 
                            bgcolor: colors.bg, 
                            border: `2px solid ${colors.border}`,
                            flex: '1 1 auto'
                          }}
                        >
                          <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="h5" sx={{ fontWeight: 700, color: colors.text }}>
                              {stat.count}
                            </Typography>
                            <Typography variant="caption" sx={{ color: colors.text, fontWeight: 500 }}>
                              {stat.status}
                            </Typography>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </Box>
                ) : (
                  <Typography color="text.secondary">No status data available</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Product Volume Analytics Section Header */}
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ fontWeight: 600, mt: 2, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              🛢️ Product Volume Analytics
            </Typography>
          </Grid>

          {/* Product Volumes - Planned vs Actual */}
          <Grid item xs={12} md={8}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#B45309' }}>
                  📊 Planned vs Actual Quantities (KT)
                </Typography>
                {analytics?.product_stats && analytics.product_stats.length > 0 ? (
                  <Box>
                    {analytics.product_stats.map((stat, idx) => {
                      const maxQty = Math.max(...analytics.product_stats.map(s => Math.max(s.planned_quantity, s.actual_quantity)))
                      const plannedPercent = maxQty > 0 ? (stat.planned_quantity / maxQty) * 100 : 0
                      const actualPercent = maxQty > 0 ? (stat.actual_quantity / maxQty) * 100 : 0
                      return (
                        <Box key={idx} sx={{ mb: 3 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {stat.product}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                              <Typography variant="body2" sx={{ color: '#6B7280' }}>
                                Planned: <strong>{stat.planned_quantity.toLocaleString()} KT</strong>
                              </Typography>
                              <Typography variant="body2" sx={{ color: '#059669' }}>
                                Actual: <strong>{stat.actual_quantity.toLocaleString()} KT</strong>
                              </Typography>
                              <Chip 
                                label={`${stat.utilization}%`}
                                size="small"
                                sx={{ 
                                  bgcolor: stat.utilization >= 90 ? '#D1FAE5' : stat.utilization >= 50 ? '#FEF3C7' : '#FEE2E2',
                                  color: stat.utilization >= 90 ? '#047857' : stat.utilization >= 50 ? '#B45309' : '#B91C1C',
                                  fontWeight: 600,
                                  fontSize: '0.7rem'
                                }}
                              />
                            </Box>
                          </Box>
                          {/* Stacked bar showing planned (gray) and actual (green) */}
                          <Box sx={{ position: 'relative', height: 12, bgcolor: '#F3F4F6', borderRadius: 1, overflow: 'hidden' }}>
                            {/* Planned bar (background) */}
                            <Box sx={{ 
                              position: 'absolute',
                              height: '100%', 
                              width: `${plannedPercent}%`,
                              bgcolor: '#D1D5DB',
                              borderRadius: 1,
                            }} />
                            {/* Actual bar (foreground) */}
                            <Box sx={{ 
                              position: 'absolute',
                              height: '100%', 
                              width: `${actualPercent}%`,
                              bgcolor: '#10B981',
                              borderRadius: 1,
                              transition: 'width 0.5s ease-in-out'
                            }} />
                          </Box>
                        </Box>
                      )
                    })}
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #E5E7EB', display: 'flex', gap: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, bgcolor: '#D1D5DB', borderRadius: 0.5 }} />
                        <Typography variant="caption" color="text.secondary">Planned</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, bgcolor: '#10B981', borderRadius: 0.5 }} />
                        <Typography variant="caption" color="text.secondary">Actual Lifted</Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                        Total Planned: {analytics.product_stats.reduce((sum, s) => sum + s.planned_quantity, 0).toLocaleString()} KT | 
                        Total Lifted: {analytics.product_stats.reduce((sum, s) => sum + s.actual_quantity, 0).toLocaleString()} KT
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography color="text.secondary">No product data available</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Product Mix Pie Chart */}
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#7C3AED' }}>
                  🥧 Product Mix
                </Typography>
                {analytics?.product_mix && analytics.product_mix.length > 0 ? (
                  <Box>
                    {/* Simple visual representation */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {analytics.product_mix.map((item, idx) => {
                        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
                        const color = colors[idx % colors.length]
                        return (
                          <Box key={idx}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box sx={{ width: 12, height: 12, bgcolor: color, borderRadius: '50%' }} />
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {item.product}
                                </Typography>
                              </Box>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {item.percentage}%
                              </Typography>
                            </Box>
                            <Box sx={{ 
                              height: 8, 
                              bgcolor: '#F3F4F6', 
                              borderRadius: 1,
                              overflow: 'hidden'
                            }}>
                              <Box sx={{ 
                                height: '100%', 
                                width: `${item.percentage}%`,
                                bgcolor: color,
                                borderRadius: 1,
                                transition: 'width 0.5s ease-in-out'
                              }} />
                            </Box>
                          </Box>
                        )
                      })}
                    </Box>
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
                      <Typography variant="body2" color="text.secondary">
                        Total Volume: {analytics.product_mix.reduce((sum, p) => sum + p.quantity, 0).toLocaleString()} KT
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography color="text.secondary">No product mix data available</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Monthly Product Trends */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#0369A1' }}>
                  📈 Product Trends (Last 6 Months)
                </Typography>
                {analytics?.monthly_product_trends && analytics.monthly_product_trends.length > 0 ? (
                  <Box>
                    {/* Get all product names */}
                    {(() => {
                      const allProducts = new Set<string>()
                      analytics.monthly_product_trends.forEach(m => {
                        Object.keys(m.products).forEach(p => allProducts.add(p))
                      })
                      const products = Array.from(allProducts)
                      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
                      
                      return (
                        <>
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'flex-end', 
                            gap: 2, 
                            height: 200,
                            pt: 2
                          }}>
                            {analytics.monthly_product_trends.map((trend, idx) => {
                              const totalForMonth = Object.values(trend.products).reduce((a, b) => a + b, 0)
                              const maxTotal = Math.max(...analytics.monthly_product_trends.map(t => 
                                Object.values(t.products).reduce((a, b) => a + b, 0)
                              ), 1)
                              
                              return (
                                <Tooltip 
                                  key={idx} 
                                  title={
                                    <Box>
                                      <Typography variant="caption" sx={{ fontWeight: 600 }}>{trend.label}</Typography>
                                      {products.map((product, pIdx) => (
                                        <Typography key={pIdx} variant="caption" display="block">
                                          {product}: {(trend.products[product] || 0).toLocaleString()} KT
                                        </Typography>
                                      ))}
                                    </Box>
                                  } 
                                  arrow
                                >
                                  <Box sx={{ 
                                    flex: 1, 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    alignItems: 'center',
                                    height: '100%',
                                    justifyContent: 'flex-end'
                                  }}>
                                    {/* Stacked bar */}
                                    <Box sx={{ 
                                      width: '100%', 
                                      display: 'flex',
                                      flexDirection: 'column-reverse',
                                      height: `${Math.max((totalForMonth / maxTotal) * 100, 5)}%`,
                                      minHeight: 4,
                                      borderRadius: '4px 4px 0 0',
                                      overflow: 'hidden'
                                    }}>
                                      {products.map((product, pIdx) => {
                                        const qty = trend.products[product] || 0
                                        const heightPercent = totalForMonth > 0 ? (qty / totalForMonth) * 100 : 0
                                        return (
                                          <Box 
                                            key={pIdx}
                                            sx={{ 
                                              width: '100%', 
                                              height: `${heightPercent}%`,
                                              bgcolor: colors[pIdx % colors.length],
                                              transition: 'height 0.5s ease-in-out'
                                            }} 
                                          />
                                        )
                                      })}
                                    </Box>
                                    <Typography 
                                      variant="caption" 
                                      sx={{ 
                                        mt: 1, 
                                        fontSize: '0.65rem',
                                        color: 'text.secondary',
                                      }}
                                    >
                                      {trend.label.split(' ')[0]}
                                    </Typography>
                                  </Box>
                                </Tooltip>
                              )
                            })}
                          </Box>
                          {/* Legend */}
                          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #E5E7EB', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            {products.map((product, pIdx) => (
                              <Box key={pIdx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Box sx={{ width: 10, height: 10, bgcolor: colors[pIdx % colors.length], borderRadius: 0.5 }} />
                                <Typography variant="caption" color="text.secondary">{product}</Typography>
                              </Box>
                            ))}
                          </Box>
                        </>
                      )
                    })()}
                  </Box>
                ) : (
                  <Typography color="text.secondary">No monthly product trends available</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Monthly Cargo Trends */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#0891B2' }}>
                  📈 Monthly Cargo Trends (Last 12 Months)
                </Typography>
                {analytics?.monthly_trends && analytics.monthly_trends.length > 0 ? (
                  <Box>
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'flex-end', 
                      gap: 1, 
                      height: 180,
                      pt: 2
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
                              justifyContent: 'flex-end'
                            }}>
                              <Typography variant="caption" sx={{ mb: 0.5, fontWeight: 600, color: '#0891B2', fontSize: '0.7rem' }}>
                                {trend.cargo_count > 0 ? trend.cargo_count : ''}
                              </Typography>
                              <Box sx={{ 
                                width: '100%', 
                                height: `${Math.max(heightPercent, 5)}%`,
                                bgcolor: '#06B6D4',
                                borderRadius: '4px 4px 0 0',
                                minHeight: 4,
                                transition: 'height 0.5s ease-in-out',
                                '&:hover': {
                                  bgcolor: '#0891B2'
                                }
                              }} />
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  mt: 1, 
                                  fontSize: '0.6rem',
                                  color: 'text.secondary',
                                  writingMode: 'vertical-rl',
                                  textOrientation: 'mixed',
                                  transform: 'rotate(180deg)',
                                  height: 45
                                }}
                              >
                                {trend.label}
                              </Typography>
                            </Box>
                          </Tooltip>
                        )
                      })}
                    </Box>
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Total cargos (12 months): {analytics.monthly_trends.reduce((sum, t) => sum + t.cargo_count, 0)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Last updated: {analytics.last_updated ? new Date(analytics.last_updated).toLocaleString() : '-'}
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography color="text.secondary">No trend data available</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Divider sx={{ my: 4 }} />

      {/* Contract Dashboards Section */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          📋 Contract Dashboards
        </Typography>
        <TextField
          placeholder="Search contracts..."
          variant="outlined"
          size="small"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 300 }}
        />
      </Box>

      {contracts.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No contracts found. Create a contract to view its dashboard.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Contract Number</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Products</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Period</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredContracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {searchText.trim() ? 'No contracts match your search.' : 'No contracts found.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredContracts.map((contract) => (
                <TableRow key={contract.id} hover>
                  <TableCell>{contract.contract_number}</TableCell>
                  <TableCell>{getCustomerName(contract.customer_id)}</TableCell>
                  <TableCell>
                    <Chip
                      label={contract.contract_type}
                      color={contract.contract_type === 'FOB' ? 'primary' : 'secondary'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {contract.products && contract.products.length > 0
                      ? contract.products.map((p: any) => p.name || 'Unknown').join(', ')
                      : 'No products'}
                  </TableCell>
                  <TableCell>
                    {new Date(contract.start_period).toLocaleDateString()} - {new Date(contract.end_period).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Visibility />}
                      onClick={() => navigate(`/contracts/${contract.id}/dashboard`)}
                    >
                      View Dashboard
                    </Button>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

