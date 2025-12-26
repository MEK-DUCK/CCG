import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  TextField,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Divider,
  Tooltip,
} from '@mui/material'
import { FileDownload, PictureAsPdf } from '@mui/icons-material'
import client, { contractAPI, customerAPI, quarterlyPlanAPI } from '../api/client'
import type { Contract, Customer, QuarterlyPlan } from '../types'

// Analytics types
interface AnalyticsData {
  inspector_stats: Array<{ name: string; cargo_count: number }>
  port_stats: Array<{ port: string; cargo_count: number }>
  monthly_trends: Array<{ month: number; year: number; label: string; cargo_count: number }>
  customer_stats: Array<{ customer: string; cargo_count: number }>
  status_stats: Array<{ status: string; count: number }>
  last_updated: string
}

const formatDateRange = (start?: string, end?: string) => {
  if (!start || !end) return '-'
  return `${start} → ${end}`
}

const formatDateOnly = (value?: string) => {
  if (!value) return '-'
  // backend returns ISO date strings like "2025-12-01"
  return value
}

type ChipColor = 'warning' | 'info' | 'error' | 'default' | 'primary' | 'secondary' | 'success'
type ChipVariant = 'filled' | 'outlined'

// FOB = light blue (primary), CIF = light orange (secondary)
const getContractTypeChipProps = (contractType: Contract['contract_type']): { color: ChipColor; variant: ChipVariant } => {
  return {
    color: contractType === 'FOB' ? 'primary' : 'secondary',
    variant: 'filled',
  }
}

// T/T = light green (success), LC = light purple (warning)
const getPaymentMethodChipProps = (paymentMethod?: Contract['payment_method']): { color: ChipColor; variant: ChipVariant } => {
  if (paymentMethod === 'T/T') {
    return { color: 'success', variant: 'filled' }
  }
  if (paymentMethod === 'LC') {
    return { color: 'warning', variant: 'filled' }
  }
  return { color: 'default', variant: 'outlined' }
}

export default function ContractSummaryPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [quarterlyPlans, setQuarterlyPlans] = useState<QuarterlyPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [savingById, setSavingById] = useState<Record<number, boolean>>({})
  const [savedById, setSavedById] = useState<Record<number, boolean>>({})
  const [saveErrorById, setSaveErrorById] = useState<Record<number, string>>({})
  const [remarksDraftById, setRemarksDraftById] = useState<Record<number, string>>({})
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear())
  const [remarksEnabled, setRemarksEnabled] = useState(true)
  const autosaveTimersRef = useRef<Record<number, any>>({})
  const lastSavedRemarksRef = useRef<Record<number, string>>({})
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
    const load = async () => {
      setLoading(true)
      try {
        const [contractsRes, customersRes, quarterlyRes] = await Promise.all([
          contractAPI.getAll(),
          customerAPI.getAll(),
          quarterlyPlanAPI.getAll(),
        ])
        setContracts(Array.isArray(contractsRes.data) ? contractsRes.data : [])
        setCustomers(Array.isArray(customersRes.data) ? customersRes.data : [])
        setQuarterlyPlans(Array.isArray(quarterlyRes.data) ? quarterlyRes.data : [])
        const loadedContracts = Array.isArray(contractsRes.data) ? (contractsRes.data as Contract[]) : []
        setContracts(loadedContracts)
        setRemarksDraftById(
          loadedContracts.reduce((acc, c) => {
            acc[c.id] = c.remarks || ''
            return acc
          }, {} as Record<number, string>)
        )
        lastSavedRemarksRef.current = loadedContracts.reduce((acc, c) => {
          acc[c.id] = c.remarks || ''
          return acc
        }, {} as Record<number, string>)
      } finally {
        setLoading(false)
      }
    }
    load()
    fetchAnalytics()
  }, [fetchAnalytics])

  // Cleanup autosave timers
  useEffect(() => {
    return () => {
      for (const key of Object.keys(autosaveTimersRef.current)) {
        const id = Number(key)
        const t = autosaveTimersRef.current[id]
        if (t) clearTimeout(t)
      }
      autosaveTimersRef.current = {}
    }
  }, [])

  const customerNameById = useMemo(() => {
    return customers.reduce((acc, c) => {
      acc[c.id] = c.name
      return acc
    }, {} as Record<number, string>)
  }, [customers])

  // Group quarterly plans by contract_id and contract_year
  const quarterTotalsByContractIdAndYear = useMemo(() => {
    const acc: Record<number, Record<number, { q1: number; q2: number; q3: number; q4: number }>> = {}
    for (const p of quarterlyPlans) {
      if (!acc[p.contract_id]) acc[p.contract_id] = {}
      const year = p.contract_year || 1
      if (!acc[p.contract_id][year]) acc[p.contract_id][year] = { q1: 0, q2: 0, q3: 0, q4: 0 }
      acc[p.contract_id][year].q1 += Number(p.q1_quantity) || 0
      acc[p.contract_id][year].q2 += Number(p.q2_quantity) || 0
      acc[p.contract_id][year].q3 += Number(p.q3_quantity) || 0
      acc[p.contract_id][year].q4 += Number(p.q4_quantity) || 0
    }
    return acc
  }, [quarterlyPlans])

  // Helper to get sorted years for a contract
  const getContractYears = (contractId: number): number[] => {
    const yearData = quarterTotalsByContractIdAndYear[contractId]
    if (!yearData) return [1]
    return Object.keys(yearData).map(Number).sort((a, b) => a - b)
  }

  const availableYears = useMemo(() => {
    const years = new Set<number>()
    for (const c of contracts) {
      const sy = Number(String(c.start_period).slice(0, 4))
      const ey = Number(String(c.end_period).slice(0, 4))
      if (!Number.isNaN(sy)) years.add(sy)
      if (!Number.isNaN(ey)) years.add(ey)
    }
    const arr = Array.from(years).sort((a, b) => b - a)
    return arr.length ? arr : [new Date().getFullYear()]
  }, [contracts])

  const filteredContracts = useMemo(() => {
    const yearStart = `${selectedYear}-01-01`
    const yearEnd = `${selectedYear}-12-31`
    // Show contracts that overlap the selected year.
    return contracts.filter((c) => {
      return c.start_period <= yearEnd && c.end_period >= yearStart
    })
  }, [contracts, selectedYear])

  const firmTotalFor = (c: Contract) => c.products.reduce((acc, p) => acc + (Number(p.total_quantity) || 0), 0)
  const optionalTotalFor = (c: Contract) => c.products.reduce((acc, p) => acc + (Number(p.optional_quantity) || 0), 0)

  const saveRemarks = async (contractId: number) => {
    if (!remarksEnabled) return
    const value = (remarksDraftById[contractId] ?? '').trimEnd()
    const lastSaved = lastSavedRemarksRef.current[contractId] ?? ''
    if (value === lastSaved) {
      setSavedById((prev) => ({ ...prev, [contractId]: true }))
      return
    }
    setSavingById((prev) => ({ ...prev, [contractId]: true }))
    setSavedById((prev) => ({ ...prev, [contractId]: false }))
    setSaveErrorById((prev) => ({ ...prev, [contractId]: '' }))
    try {
      const res = await contractAPI.update(contractId, { remarks: value || null })
      const updated = res.data as Contract
      setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setRemarksDraftById((prev) => ({ ...prev, [updated.id]: updated.remarks || '' }))
      lastSavedRemarksRef.current[updated.id] = updated.remarks || ''
      setSavedById((prev) => ({ ...prev, [updated.id]: true }))
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        'Failed to save remarks'
      setSaveErrorById((prev) => ({ ...prev, [contractId]: String(msg) }))
      if (String(msg).includes('Contract remarks field is not available in the database yet')) {
        setRemarksEnabled(false)
      }
    } finally {
      setSavingById((prev) => ({ ...prev, [contractId]: false }))
    }
  }

  const scheduleAutosave = (contractId: number) => {
    const existing = autosaveTimersRef.current[contractId]
    if (existing) clearTimeout(existing)
    autosaveTimersRef.current[contractId] = setTimeout(() => {
      saveRemarks(contractId)
    }, 900)
  }

  const handleExportToExcel = () => {
    import('xlsx').then((XLSX) => {
      const exportData = filteredContracts.flatMap((c) => {
        const customerName = customerNameById[c.customer_id] || '-'
        const years = getContractYears(c.id)
        const productsLabel = c.products.length === 0 ? '-' : c.products.map((p) => p.name).filter(Boolean).join(', ')
        const jetA1Selected = c.products.some((p) => p.name === 'JET A-1')

        // For multi-year contracts, create a row per year
        return years.map((year, idx) => {
          const qt = quarterTotalsByContractIdAndYear[c.id]?.[year] || { q1: 0, q2: 0, q3: 0, q4: 0 }
          const yearLabel = years.length > 1 ? ` (Year ${year})` : ''
          
          return {
            'Customer': idx === 0 ? customerName : '',
            'Contract #': idx === 0 ? c.contract_number : '',
            'Contract Period': idx === 0 ? formatDateRange(c.start_period, c.end_period) : '',
            'Product(s)': idx === 0 ? productsLabel : '',
            'Firm Total': idx === 0 ? firmTotalFor(c) : '',
            'Type': idx === 0 ? c.contract_type : '',
            'Payment': idx === 0 ? (c.payment_method || '-') : '',
            'Year': years.length > 1 ? `Year ${year}` : '',
            'Q1': qt.q1,
            'Q2': qt.q2,
            'Q3': qt.q3,
            'Q4': qt.q4,
            'Optional Qty': idx === 0 ? optionalTotalFor(c) : '',
            'Discharge Ranges': idx === 0 ? (c.discharge_ranges || '-') : '',
            'Fax Received': idx === 0 ? formatDateOnly(c.fax_received_date) : '',
            'Concluded Memo': idx === 0 ? formatDateOnly(c.concluded_memo_received_date) : '',
            'Additives Required': idx === 0 ? (!jetA1Selected ? '-' : c.additives_required === true ? 'Yes' : c.additives_required === false ? 'No' : '-') : '',
            'Remarks': idx === 0 ? (c.remarks || '') : '',
          }
        })
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      ws['!cols'] = [
        { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 12 },
        { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 },
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Contract Summary')

      const dateStr = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `Contract_Summary_${selectedYear}_${dateStr}.xlsx`)
    }).catch((error) => {
      console.error('Error exporting to Excel:', error)
      alert('Error exporting to Excel.')
    })
  }

  const handleExportToPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      
      doc.setFontSize(16)
      doc.text(`Contract Summary - ${selectedYear}`, 14, 15)

      const tableData = filteredContracts.flatMap((c) => {
        const customerName = customerNameById[c.customer_id] || '-'
        const years = getContractYears(c.id)
        const productsLabel = c.products.length === 0 ? '-' : c.products.map((p) => p.name).filter(Boolean).join(', ')
        const jetA1Selected = c.products.some((p) => p.name === 'JET A-1')

        return years.map((year, idx) => {
          const qt = quarterTotalsByContractIdAndYear[c.id]?.[year] || { q1: 0, q2: 0, q3: 0, q4: 0 }
          const yearPrefix = years.length > 1 ? `Y${year}: ` : ''
          
          return [
            idx === 0 ? customerName : '',
            idx === 0 ? c.contract_number : '',
            idx === 0 ? formatDateRange(c.start_period, c.end_period) : '',
            idx === 0 ? productsLabel : '',
            idx === 0 ? firmTotalFor(c).toString() : '',
            idx === 0 ? c.contract_type : '',
            idx === 0 ? (c.payment_method || '-') : '',
            `${yearPrefix}Q1:${qt.q1} Q2:${qt.q2} Q3:${qt.q3} Q4:${qt.q4}`,
            idx === 0 ? optionalTotalFor(c).toString() : '',
            idx === 0 ? (c.discharge_ranges || '-') : '',
            idx === 0 ? `Fax: ${formatDateOnly(c.fax_received_date)}\nMemo: ${formatDateOnly(c.concluded_memo_received_date)}` : '',
            idx === 0 ? (!jetA1Selected ? '-' : c.additives_required === true ? 'Yes' : c.additives_required === false ? 'No' : '-') : '',
            idx === 0 ? (c.remarks || '') : '',
          ]
        })
      })

      autoTable(doc, {
        head: [['Customer', 'Contract #', 'Period', 'Products', 'Firm', 'Type', 'Payment', 'Qty Distribution', 'Optional', 'Discharge Ranges', 'Fax/Memo', 'Additives', 'Remarks']],
        body: tableData,
        startY: 25,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 18 },
          2: { cellWidth: 25 },
          3: { cellWidth: 20 },
          4: { cellWidth: 12 },
          5: { cellWidth: 12 },
          6: { cellWidth: 12 },
          7: { cellWidth: 28 },
          8: { cellWidth: 14 },
          9: { cellWidth: 25 },
          10: { cellWidth: 25 },
          11: { cellWidth: 14 },
          12: { cellWidth: 30 },
        },
      })

      const dateStr = new Date().toISOString().split('T')[0]
      doc.save(`Contract_Summary_${selectedYear}_${dateStr}.pdf`)
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      alert(`Error exporting to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Analytics overview and contract summary. Only "Remarks" can be edited in the contract table.
          </Typography>
          {!remarksEnabled && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              Remarks are disabled because the database is missing the <b>contracts.remarks</b> column. Apply the remarks migration, then refresh.
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<FileDownload />}
            onClick={handleExportToExcel}
            disabled={loading || filteredContracts.length === 0}
            sx={{
              borderColor: '#2563EB',
              color: '#2563EB',
              '&:hover': {
                borderColor: '#1D4ED8',
                bgcolor: 'rgba(37, 99, 235, 0.04)',
              },
            }}
          >
            Export Excel
          </Button>
          <Button
            variant="outlined"
            startIcon={<PictureAsPdf />}
            onClick={handleExportToPDF}
            disabled={loading || filteredContracts.length === 0}
            sx={{
              borderColor: '#DC2626',
              color: '#DC2626',
              '&:hover': {
                borderColor: '#B91C1C',
                bgcolor: 'rgba(220, 38, 38, 0.04)',
              },
            }}
          >
            Save PDF
          </Button>
        </Box>
      </Box>

      {/* Analytics Dashboard */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
          📊 Analytics Dashboard
        </Typography>
        
        {analyticsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Grid container spacing={3}>
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
      </Box>

      <Divider sx={{ my: 4 }} />

      {/* Contract Summary Section */}
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        📋 Contract Summary
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Year</InputLabel>
                <Select
                  value={availableYears.includes(selectedYear) ? selectedYear : availableYears[0]}
                  label="Year"
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {availableYears.map((y) => (
                    <MenuItem key={y} value={y}>
                      {y}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={8}>
              <Typography variant="body2" color="text.secondary">
                {filteredContracts.length} contract{filteredContracts.length !== 1 ? 's' : ''} shown
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : filteredContracts.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary">
              No contracts found for {selectedYear}.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1400 }}>
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell>Contract #</TableCell>
                <TableCell>Contract Period</TableCell>
                <TableCell>Product(s)</TableCell>
                <TableCell>Firm Total</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Qty Distribution</TableCell>
                <TableCell>Optional Qty</TableCell>
                <TableCell>Discharge Ranges</TableCell>
                <TableCell>Fax / Concluded Memo</TableCell>
                <TableCell>Additives Required</TableCell>
                <TableCell>Remarks</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredContracts.map((c) => {
                const customerName = customerNameById[c.customer_id] || '-'
                const productsLabel =
                  c.products.length === 0 ? '-' : c.products.map((p) => p.name).filter(Boolean).join(', ')
                const jetA1Selected = c.products.some((p) => p.name === 'JET A-1')
                const saving = Boolean(savingById[c.id])
                const saved = Boolean(savedById[c.id])
                const err = saveErrorById[c.id] || ''
                return (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {customerName}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {c.contract_number}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2">{formatDateRange(c.start_period, c.end_period)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{productsLabel}</Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Chip label={`${firmTotalFor(c)}`} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Chip label={c.contract_type} size="small" {...getContractTypeChipProps(c.contract_type)} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Chip label={c.payment_method || '-'} size="small" {...getPaymentMethodChipProps(c.payment_method)} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {getContractYears(c.id).map((year) => {
                          const yearData = quarterTotalsByContractIdAndYear[c.id]?.[year] || { q1: 0, q2: 0, q3: 0, q4: 0 }
                          const years = getContractYears(c.id)
                          const showYearLabel = years.length > 1
                          return (
                            <Box key={year} sx={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: 0.25,
                              ...(showYearLabel && { 
                                borderLeft: '2px solid', 
                                borderColor: 'primary.main',
                                pl: 1,
                                mb: 0.5
                              })
                            }}>
                              {showYearLabel && (
                                <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                                  Year {year}
                                </Typography>
                              )}
                              <Typography variant="body2">Q1: {yearData.q1}</Typography>
                              <Typography variant="body2">Q2: {yearData.q2}</Typography>
                              <Typography variant="body2">Q3: {yearData.q3}</Typography>
                              <Typography variant="body2">Q4: {yearData.q4}</Typography>
                            </Box>
                          )
                        })}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Chip label={`${optionalTotalFor(c)}`} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {c.discharge_ranges || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                        <Typography variant="body2">Fax: {formatDateOnly(c.fax_received_date)}</Typography>
                        <Typography variant="body2">Memo: {formatDateOnly(c.concluded_memo_received_date)}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2">
                        {!jetA1Selected ? '-' : c.additives_required === true ? 'Yes' : c.additives_required === false ? 'No' : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 260 }}>
                      <Box>
                        <TextField
                          value={remarksDraftById[c.id] ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            setRemarksDraftById((prev) => ({
                              ...prev,
                              [c.id]: v,
                            }))
                            setSavedById((prev) => ({ ...prev, [c.id]: false }))
                            setSaveErrorById((prev) => ({ ...prev, [c.id]: '' }))
                            scheduleAutosave(c.id)
                          }}
                          onBlur={() => saveRemarks(c.id)}
                          fullWidth
                          size="small"
                          multiline
                          minRows={2}
                          placeholder="Add remarks if needed"
                          disabled={!remarksEnabled}
                        />
                        <Typography
                          variant="caption"
                          color={err ? 'error' : 'text.secondary'}
                          sx={{ display: 'block', mt: 0.5 }}
                        >
                          {!remarksEnabled
                            ? 'Remarks disabled until DB migration is applied'
                            : err
                              ? err
                              : saving
                                ? 'Saving…'
                                : saved
                                  ? 'Saved'
                                  : ' '}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}


