import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Grid,
  Chip,
  TextField,
  Button,
  CircularProgress,
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
  const [selectedContractId, setSelectedContractId] = useState<number | ''>('')
  const [remarks, setRemarks] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const selectedContract = useMemo(() => {
    if (!selectedContractId) return null
    return contracts.find((c) => c.id === selectedContractId) || null
  }, [contracts, selectedContractId])

  const selectedCustomerName = useMemo(() => {
    if (!selectedContract) return '-'
    return customers.find((c) => c.id === selectedContract.customer_id)?.name || '-'
  }, [customers, selectedContract])

  const quantityDistribution = useMemo(() => {
    if (!selectedContract) return null
    const plans = quarterlyPlans.filter((p) => p.contract_id === selectedContract.id)
    const sum = (key: keyof QuarterlyPlan) => plans.reduce((acc, p) => acc + (Number(p[key]) || 0), 0)
    return {
      q1: sum('q1_quantity'),
      q2: sum('q2_quantity'),
      q3: sum('q3_quantity'),
      q4: sum('q4_quantity'),
    }
  }, [quarterlyPlans, selectedContract])

  const firmTotal = useMemo(() => {
    if (!selectedContract) return 0
    return selectedContract.products.reduce((acc, p) => acc + (Number(p.total_quantity) || 0), 0)
  }, [selectedContract])

  const optionalTotal = useMemo(() => {
    if (!selectedContract) return 0
    return selectedContract.products.reduce((acc, p) => acc + (Number(p.optional_quantity) || 0), 0)
  }, [selectedContract])

  useEffect(() => {
    setRemarks(selectedContract?.remarks || '')
  }, [selectedContract?.id]) // intentionally reset when contract changes

  const handleSaveRemarks = async () => {
    if (!selectedContract) return
    setSaving(true)
    try {
      const res = await contractAPI.update(selectedContract.id, { remarks: remarks || null })
      const updated = res.data as Contract
      setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setRemarks(updated.remarks || '')
    } finally {
      setSaving(false)
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
          <FormControl fullWidth size="small">
            <InputLabel>Contract</InputLabel>
            <Select
              value={selectedContractId}
              label="Contract"
              onChange={(e) => setSelectedContractId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <MenuItem value="">Select a contract</MenuItem>
              {contracts.map((c) => {
                const name = customers.find((x) => x.id === c.customer_id)?.name || 'Unknown Customer'
                return (
                  <MenuItem key={c.id} value={c.id}>
                    {name} — {c.contract_number}
                  </MenuItem>
                )
              })}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : !selectedContract ? (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary">
              Select a contract to view its summary.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Customer Name
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {selectedCustomerName}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Contract Number
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {selectedContract.contract_number}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Contract Period
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {formatDateRange(selectedContract.start_period, selectedContract.end_period)}
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Product(s)
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                  {selectedContract.products.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      -
                    </Typography>
                  ) : (
                    selectedContract.products.map((p, idx) => (
                      <Chip
                        key={`${p.name}-${idx}`}
                        label={`${p.name} (Firm: ${Number(p.total_quantity) || 0}${p.optional_quantity ? `, Opt: ${Number(p.optional_quantity) || 0}` : ''})`}
                        size="small"
                        variant="outlined"
                      />
                    ))
                  )}
                </Box>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Product(s) Total Firm Quantity (no optional)
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {firmTotal}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Type (FOB / CIF)
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {selectedContract.contract_type}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Payment Type (LC / T/T)
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {selectedContract.payment_method || '-'}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Optional Quantity
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {optionalTotal}
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Quantity Distribution (per quarter)
                </Typography>
                {quantityDistribution ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                    <Chip label={`Q1: ${quantityDistribution.q1}`} size="small" />
                    <Chip label={`Q2: ${quantityDistribution.q2}`} size="small" />
                    <Chip label={`Q3: ${quantityDistribution.q3}`} size="small" />
                    <Chip label={`Q4: ${quantityDistribution.q4}`} size="small" />
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    -
                  </Typography>
                )}
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Discharge Ranges
                </Typography>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', fontWeight: 600 }}>
                  {selectedContract.discharge_ranges || '-'}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Fax Date
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {formatDateOnly(selectedContract.fax_received_date)}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Concluded Memo Date
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {formatDateOnly(selectedContract.concluded_memo_received_date)}
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Remarks (editable)
                </Typography>
                <TextField
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  fullWidth
                  multiline
                  minRows={4}
                  placeholder="Add remarks if needed"
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
                  <Button
                    variant="contained"
                    startIcon={<Save />}
                    onClick={handleSaveRemarks}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Remarks'}
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}


