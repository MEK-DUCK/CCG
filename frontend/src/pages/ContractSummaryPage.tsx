import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  TextField,
  Button,
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
} from '@mui/material'
import { Save } from '@mui/icons-material'
import { contractAPI, customerAPI, quarterlyPlanAPI } from '../api/client'
import type { Contract, Customer, QuarterlyPlan } from '../types'

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
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [quarterlyPlans, setQuarterlyPlans] = useState<QuarterlyPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [savingById, setSavingById] = useState<Record<number, boolean>>({})
  const [remarksDraftById, setRemarksDraftById] = useState<Record<number, string>>({})
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear())

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
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const customerNameById = useMemo(() => {
    return customers.reduce((acc, c) => {
      acc[c.id] = c.name
      return acc
    }, {} as Record<number, string>)
  }, [customers])

  const quarterTotalsByContractId = useMemo(() => {
    const acc: Record<number, { q1: number; q2: number; q3: number; q4: number }> = {}
    for (const p of quarterlyPlans) {
      if (!acc[p.contract_id]) acc[p.contract_id] = { q1: 0, q2: 0, q3: 0, q4: 0 }
      acc[p.contract_id].q1 += Number(p.q1_quantity) || 0
      acc[p.contract_id].q2 += Number(p.q2_quantity) || 0
      acc[p.contract_id].q3 += Number(p.q3_quantity) || 0
      acc[p.contract_id].q4 += Number(p.q4_quantity) || 0
    }
    return acc
  }, [quarterlyPlans])

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

  const handleSaveRemarks = async (contractId: number) => {
    const value = remarksDraftById[contractId] ?? ''
    setSavingById((prev) => ({ ...prev, [contractId]: true }))
    try {
      const res = await contractAPI.update(contractId, { remarks: value || null })
      const updated = res.data as Contract
      setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setRemarksDraftById((prev) => ({ ...prev, [updated.id]: updated.remarks || '' }))
    } finally {
      setSavingById((prev) => ({ ...prev, [contractId]: false }))
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Contract Summary
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Read-only contract summary. Only “Remarks” can be edited here.
        </Typography>
      </Box>

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
        <TableContainer component={Paper}>
          <Table size="small">
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
                <TableCell>Fax Date</TableCell>
                <TableCell>Concluded Memo Date</TableCell>
                <TableCell>Remarks</TableCell>
                <TableCell align="right">Save</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredContracts.map((c) => {
                const customerName = customerNameById[c.customer_id] || '-'
                const qt = quarterTotalsByContractId[c.id] || { q1: 0, q2: 0, q3: 0, q4: 0 }
                const productsLabel =
                  c.products.length === 0 ? '-' : c.products.map((p) => p.name).filter(Boolean).join(', ')
                const saving = Boolean(savingById[c.id])
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
                      <Chip label={c.contract_type} size="small" />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Chip label={c.payment_method || '-'} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2">
                        Q1 {qt.q1} / Q2 {qt.q2} / Q3 {qt.q3} / Q4 {qt.q4}
                      </Typography>
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
                      <Typography variant="body2">{formatDateOnly(c.fax_received_date)}</Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2">{formatDateOnly(c.concluded_memo_received_date)}</Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 260 }}>
                      <TextField
                        value={remarksDraftById[c.id] ?? ''}
                        onChange={(e) =>
                          setRemarksDraftById((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        fullWidth
                        size="small"
                        multiline
                        minRows={2}
                        placeholder="Add remarks if needed"
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<Save />}
                        onClick={() => handleSaveRemarks(c.id)}
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </Button>
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


