import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Typography,
  Chip,
  TextField,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Tooltip,
  IconButton,
} from '@mui/material'
import { FileDownload, PictureAsPdf, Summarize, ChevronLeft, ChevronRight } from '@mui/icons-material'
import { contractAPI, customerAPI, quarterlyPlanAPI } from '../api/client'
import type { Contract, Customer, QuarterlyPlan } from '../types'
import { BADGE_COLORS, getContractTypeColor, getPaymentColor } from '../utils/chipColors'
import { useToast } from '../contexts/ToastContext'
import { applyAmendmentsToProduct } from '../utils/monthlyPlanUtils'

const formatDateRange = (start?: string, end?: string) => {
  if (!start || !end) return '-'
  return `${start} → ${end}`
}

const formatDateOnly = (value?: string) => {
  if (!value) return '-'
  // backend returns ISO date strings like "2025-12-01"
  return value
}

export default function ContractSummaryPage() {
  const { showError } = useToast()
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
  }, [])

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
      // Add all years in the contract range, not just start and end
      if (!Number.isNaN(sy) && !Number.isNaN(ey)) {
        for (let year = sy; year <= ey; year++) {
          years.add(year)
        }
      } else if (!Number.isNaN(sy)) {
        years.add(sy)
      } else if (!Number.isNaN(ey)) {
        years.add(ey)
      }
    }
    const arr = Array.from(years).sort((a, b) => b - a)
    return arr.length ? arr : [new Date().getFullYear()]
  }, [contracts])

  // Sync selectedYear with availableYears when the current selection is not available
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0])
    }
  }, [availableYears, selectedYear])

  const filteredContracts = useMemo(() => {
    const yearStart = `${selectedYear}-01-01`
    const yearEnd = `${selectedYear}-12-31`
    // Show contracts that overlap the selected year.
    return contracts.filter((c) => {
      return c.start_period <= yearEnd && c.end_period >= yearStart
    })
  }, [contracts, selectedYear])

  // Check if contract uses min/max mode (any product has actual min or max quantity values)
  // Use != null to check for both null and undefined, and ensure value > 0
  const isMinMaxMode = (c: Contract) => c.products.some(p =>
    (p.min_quantity != null && p.min_quantity > 0) || (p.max_quantity != null && p.max_quantity > 0)
  )

  // Get the contract year (1, 2, 3...) for a given calendar year
  const getContractYearForCalendarYear = (c: Contract, calendarYear: number): number => {
    if (!c.start_period) return 1
    const startYear = new Date(c.start_period).getFullYear()
    return Math.max(1, calendarYear - startYear + 1)
  }

  // Get quantities for a product for the selected year (calendar year -> contract year)
  const getProductYearQuantities = (c: Contract, p: any) => {
    const hasMinMax = (p.min_quantity != null && p.min_quantity > 0) || (p.max_quantity != null && p.max_quantity > 0)
    const contractYear = getContractYearForCalendarYear(c, selectedYear)
    const amendments = c.authority_amendments || []
    const numContractYears = c.start_period && c.end_period
      ? Math.max(1, Math.ceil(((new Date(c.end_period).getFullYear() - new Date(c.start_period).getFullYear()) * 12 + (new Date(c.end_period).getMonth() - new Date(c.start_period).getMonth()) + 1) / 12))
      : 1

    let originalMin = 0
    let originalMax = 0
    let optional = 0
    let missingYearData = false // Flag to indicate year-specific data is missing

    // If year_quantities exists, get the specific year's quantities
    if (p.year_quantities && Array.isArray(p.year_quantities) && p.year_quantities.length > 0) {
      const yearQty = p.year_quantities.find((yq: any) => yq.year === contractYear)
      if (yearQty) {
        originalMin = yearQty.min_quantity || 0
        originalMax = hasMinMax ? (yearQty.max_quantity || 0) : (yearQty.quantity || 0)
        optional = yearQty.optional_quantity || 0
      } else {
        // Fallback to product-level values if year not found - this is a gap!
        originalMin = p.min_quantity || 0
        originalMax = hasMinMax ? (p.max_quantity || 0) : (p.total_quantity || 0)
        optional = p.optional_quantity || 0
        // Only flag as missing if this is a multi-year contract (gaps matter)
        if (numContractYears > 1) {
          missingYearData = true
        }
      }
    } else {
      // No year_quantities - use product-level values
      originalMin = p.min_quantity || 0
      originalMax = hasMinMax ? (p.max_quantity || 0) : (p.total_quantity || 0)
      optional = p.optional_quantity || 0
    }

    // Apply amendments for this contract year
    const { effectiveMin, effectiveMax } = applyAmendmentsToProduct(
      originalMin,
      originalMax,
      amendments,
      p.name,
      contractYear
    )

    return {
      effectiveMin,
      effectiveMax,
      optional,
      originalMin,
      originalMax,
      hasMinMax,
      missingYearData,
      contractYear
    }
  }

  // For fixed mode: return total_quantity, for min/max mode: return max_quantity (effective)
  const firmTotalFor = (c: Contract) => c.products.reduce((acc, p) => {
    const { effectiveMax } = getProductYearQuantities(c, p)
    return acc + effectiveMax
  }, 0)

  // Return optional_quantity for both fixed and min/max modes
  const optionalTotalFor = (c: Contract) => c.products.reduce((acc, p) => {
    const { optional } = getProductYearQuantities(c, p)
    return acc + optional
  }, 0)

  // For min/max mode: return min_quantity (effective)
  const minTotalFor = (c: Contract) => c.products.reduce((acc, p) => {
    const { effectiveMin } = getProductYearQuantities(c, p)
    return acc + effectiveMin
  }, 0)

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
      // Get the contract's current version for optimistic locking
      const contract = contracts.find(c => c.id === contractId)
      const res = await contractAPI.update(contractId, { 
        remarks: value || null,
        version: contract?.version || 1
      })
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
          return {
            'Customer': idx === 0 ? customerName : '',
            'Contract #': idx === 0 ? c.contract_number : '',
            'Contract Period': idx === 0 ? formatDateRange(c.start_period, c.end_period) : '',
            'Product(s)': idx === 0 ? productsLabel : '',
            'Firm Total': idx === 0 ? (isMinMaxMode(c) ? `${minTotalFor(c)} - ${firmTotalFor(c)}` : firmTotalFor(c)) : '',
            'Type': idx === 0 ? c.contract_type : '',
            'Payment': idx === 0 ? (c.payment_method || '-') : '',
            'Year': years.length > 1 ? `Year ${year}` : '',
            'Q1': qt.q1,
            'Q2': qt.q2,
            'Q3': qt.q3,
            'Q4': qt.q4,
            'Optional Qty': idx === 0 ? (optionalTotalFor(c) > 0 ? `+${optionalTotalFor(c)} KT` : '-') : '',
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
      showError('Error exporting to Excel.')
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
            idx === 0 ? (isMinMaxMode(c) ? `${minTotalFor(c)} - ${firmTotalFor(c)}` : firmTotalFor(c).toString()) : '',
            idx === 0 ? c.contract_type : '',
            idx === 0 ? (c.payment_method || '-') : '',
            `${yearPrefix}Q1:${qt.q1} Q2:${qt.q2} Q3:${qt.q3} Q4:${qt.q4}`,
            idx === 0 ? (optionalTotalFor(c) > 0 ? `+${optionalTotalFor(c)} KT` : '-') : '',
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
      showError(`Error exporting to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Navigate to previous/next year
  const goToPrevYear = () => {
    const currentIndex = availableYears.indexOf(selectedYear)
    if (currentIndex < availableYears.length - 1) {
      setSelectedYear(availableYears[currentIndex + 1])
    }
  }

  const goToNextYear = () => {
    const currentIndex = availableYears.indexOf(selectedYear)
    if (currentIndex > 0) {
      setSelectedYear(availableYears[currentIndex - 1])
    }
  }

  return (
    <Box>
      {/* Modern Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 3,
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              }}
            >
              <Summarize sx={{ color: 'white', fontSize: 26 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E293B', letterSpacing: '-0.02em' }}>
                Contract Summary
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748B' }}>
                Read-only summary • Edit remarks only
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownload sx={{ fontSize: 16 }} />}
              onClick={handleExportToExcel}
              disabled={loading || filteredContracts.length === 0}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8125rem',
                px: 2,
                py: 0.75,
                borderColor: '#E2E8F0',
                color: '#475569',
                bgcolor: 'white',
                '&:hover': {
                  borderColor: '#3B82F6',
                  bgcolor: '#EFF6FF',
                  color: '#2563EB',
                },
              }}
            >
              Excel
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PictureAsPdf sx={{ fontSize: 16 }} />}
              onClick={handleExportToPDF}
              disabled={loading || filteredContracts.length === 0}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8125rem',
                px: 2,
                py: 0.75,
                borderColor: '#E2E8F0',
                color: '#475569',
                bgcolor: 'white',
                '&:hover': {
                  borderColor: '#EF4444',
                  bgcolor: '#FEF2F2',
                  color: '#DC2626',
                },
              }}
            >
              PDF
            </Button>
          </Box>
        </Box>

        {!remarksEnabled && (
          <Paper elevation={0} sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: '#FEF2F2', border: '1px solid #FECACA' }}>
            <Typography variant="body2" sx={{ color: '#DC2626' }}>
              Remarks are disabled because the database is missing the <b>contracts.remarks</b> column. Apply the remarks migration, then refresh.
            </Typography>
          </Paper>
        )}
      </Box>

      {/* Modern Filter Bar */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          p: 2,
          borderRadius: 3,
          border: '1px solid #E2E8F0',
          background: 'linear-gradient(135deg, #FAFBFC 0%, #F8FAFC 100%)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          {/* Year Navigator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              size="small"
              onClick={goToPrevYear}
              disabled={availableYears.indexOf(selectedYear) >= availableYears.length - 1}
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'white',
                border: '1px solid #E2E8F0',
                '&:hover': { bgcolor: '#F1F5F9', borderColor: '#CBD5E1' },
                '&.Mui-disabled': { bgcolor: '#F8FAFC', borderColor: '#F1F5F9' },
              }}
            >
              <ChevronLeft sx={{ fontSize: 18, color: '#64748B' }} />
            </IconButton>
            <Box
              sx={{
                px: 3,
                py: 0.75,
                borderRadius: 2,
                bgcolor: 'white',
                border: '1px solid #E2E8F0',
                minWidth: 90,
                textAlign: 'center',
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1E293B', letterSpacing: '-0.01em' }}>
                {selectedYear}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={goToNextYear}
              disabled={availableYears.indexOf(selectedYear) <= 0}
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'white',
                border: '1px solid #E2E8F0',
                '&:hover': { bgcolor: '#F1F5F9', borderColor: '#CBD5E1' },
                '&.Mui-disabled': { bgcolor: '#F8FAFC', borderColor: '#F1F5F9' },
              }}
            >
              <ChevronRight sx={{ fontSize: 18, color: '#64748B' }} />
            </IconButton>
          </Box>

          {/* Contract Count */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              px: 2,
              py: 0.75,
              bgcolor: 'white',
              border: '1px solid #E2E8F0',
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>
              {filteredContracts.length}
            </Typography>
            <Typography variant="body2" sx={{ color: '#94A3B8', ml: 0.5 }}>
              contract{filteredContracts.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {loading ? (
        <Paper elevation={0} sx={{ display: 'flex', justifyContent: 'center', p: 6, borderRadius: 3, border: '1px solid #E2E8F0' }}>
          <CircularProgress sx={{ color: '#10B981' }} />
        </Paper>
      ) : filteredContracts.length === 0 ? (
        <Paper elevation={0} sx={{ p: 6, borderRadius: 3, border: '1px solid #E2E8F0', textAlign: 'center' }}>
          <Box sx={{
            width: 64,
            height: 64,
            borderRadius: 3,
            background: 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}>
            <Summarize sx={{ fontSize: 28, color: '#94A3B8' }} />
          </Box>
          <Typography variant="body1" sx={{ fontWeight: 600, color: '#475569' }}>
            No contracts found for {selectedYear}
          </Typography>
          <Typography variant="body2" sx={{ color: '#94A3B8', mt: 0.5 }}>
            Try selecting a different year
          </Typography>
        </Paper>
      ) : (
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
          }}
        >
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1400 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Contract #</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Contract Period</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Product(s)</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Firm Total</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Payment</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Qty Distribution</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Optional Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Discharge Ranges</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Fax / Memo</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Additives</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>Remarks</TableCell>
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
                  <TableRow
                    key={c.id}
                    sx={{
                      transition: 'background-color 0.15s ease',
                      '&:hover': { bgcolor: '#F8FAFC' },
                      '& td': { borderBottom: '1px solid #F1F5F9' },
                    }}
                  >
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
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {c.products.map((p, idx) => {
                          const { effectiveMin, effectiveMax, optional, originalMin, originalMax, hasMinMax, missingYearData, contractYear } = getProductYearQuantities(c, p)
                          const isAmended = effectiveMin !== originalMin || effectiveMax !== originalMax
                          return (
                            <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 60, color: '#475569' }}>
                                {p.name}:
                              </Typography>
                              {hasMinMax ? (
                                <Chip
                                  label={`${effectiveMin.toLocaleString()} - ${effectiveMax.toLocaleString()} KT`}
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    height: 22,
                                    fontSize: '0.75rem',
                                    bgcolor: BADGE_COLORS.COMBI.bgcolor,
                                    borderColor: BADGE_COLORS.COMBI.color
                                  }}
                                />
                              ) : (
                                <Chip
                                  label={`${effectiveMax.toLocaleString()} KT`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 22, fontSize: '0.75rem' }}
                                />
                              )}
                              {optional > 0 && (
                                <Chip
                                  label={`+${optional.toLocaleString()} opt`}
                                  size="small"
                                  sx={{
                                    height: 18,
                                    fontSize: '0.65rem',
                                    bgcolor: '#F0FDF4',
                                    color: '#16A34A',
                                    '& .MuiChip-label': { px: 0.5 }
                                  }}
                                />
                              )}
                              {isAmended && (
                                <Tooltip
                                  title={`Original: ${originalMin.toLocaleString()} - ${originalMax.toLocaleString()} KT`}
                                  arrow
                                >
                                  <Chip
                                    label="Amended"
                                    size="small"
                                    sx={{
                                      height: 18,
                                      fontSize: '0.65rem',
                                      bgcolor: '#FEF3C7',
                                      color: '#D97706',
                                      fontWeight: 600,
                                      '& .MuiChip-label': { px: 0.5 }
                                    }}
                                  />
                                </Tooltip>
                              )}
                              {missingYearData && (
                                <Tooltip
                                  title={`Year ${contractYear} quantities not set - using contract totals. Edit contract to set per-year quantities.`}
                                  arrow
                                >
                                  <Chip
                                    label="Year data missing"
                                    size="small"
                                    sx={{
                                      height: 18,
                                      fontSize: '0.65rem',
                                      bgcolor: '#FEE2E2',
                                      color: '#DC2626',
                                      fontWeight: 600,
                                      '& .MuiChip-label': { px: 0.5 }
                                    }}
                                  />
                                </Tooltip>
                              )}
                            </Box>
                          )
                        })}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Chip label={c.contract_type} size="small" sx={getContractTypeColor(c.contract_type)} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Chip label={c.payment_method || '-'} size="small" sx={getPaymentColor(c.payment_method || 'T/T')} />
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
                      {optionalTotalFor(c) > 0 ? (
                        <Chip 
                          label={`+${optionalTotalFor(c).toLocaleString()} KT`} 
                          size="small" 
                          sx={{ 
                            bgcolor: BADGE_COLORS.COMPLETED.bgcolor, 
                            color: BADGE_COLORS.COMPLETED.color,
                            fontWeight: 500,
                            border: `1px solid ${BADGE_COLORS.COMPLETED.color}`
                          }} 
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
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
        </Paper>
      )}
    </Box>
  )
}


