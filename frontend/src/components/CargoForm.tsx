import { useState } from 'react'
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material'
import { Add } from '@mui/icons-material'
import { cargoAPI } from '../api/client'
import type { Contract } from '../types'

interface CargoFormProps {
  contract: Contract
  monthlyPlanId?: number
  onCargoCreated: () => void
}

export default function CargoForm({ contract, monthlyPlanId, onCargoCreated }: CargoFormProps) {
  const [formData, setFormData] = useState({
    product_name: contract.products?.[0]?.name || '',
    vessel_name: '',
    load_ports: '',
    inspector_name: '',
    cargo_quantity: '',
    laycan_window: '',
    eta_load_port: '',
    loading_start_time: '',
    loading_completion_time: '',
    etd_load_port: '',
    eta_discharge_port: '',
    discharge_port_location: '',
    discharge_completion_time: '',
    notes: '',
  })

  const toISOString = (dateTimeLocal: string) => {
    if (!dateTimeLocal) return undefined
    const d = new Date(dateTimeLocal)
    if (Number.isNaN(d.getTime())) return undefined
    return d.toISOString()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!monthlyPlanId) {
      alert('Please create a monthly plan first')
      return
    }
    if (!formData.product_name) {
      alert('Please select a product first')
      return
    }
    try {
      await cargoAPI.create({
        customer_id: contract.customer_id,
        product_name: formData.product_name,
        contract_id: contract.id,
        monthly_plan_id: monthlyPlanId,
        vessel_name: formData.vessel_name,
        load_ports: formData.load_ports,
        inspector_name: formData.inspector_name || undefined,
        cargo_quantity: parseFloat(formData.cargo_quantity),
        laycan_window: formData.laycan_window || undefined,
        eta_load_port: toISOString(formData.eta_load_port),
        loading_start_time: toISOString(formData.loading_start_time),
        loading_completion_time: toISOString(formData.loading_completion_time),
        etd_load_port: toISOString(formData.etd_load_port),
        eta_discharge_port: contract.contract_type === 'CIF' ? toISOString(formData.eta_discharge_port) : undefined,
        discharge_port_location: contract.contract_type === 'CIF' ? (formData.discharge_port_location || undefined) : undefined,
        discharge_completion_time: contract.contract_type === 'CIF' ? toISOString(formData.discharge_completion_time) : undefined,
        notes: formData.notes || undefined,
      })
      setFormData({
        product_name: contract.products?.[0]?.name || '',
        vessel_name: '',
        load_ports: '',
        inspector_name: '',
        cargo_quantity: '',
        laycan_window: '',
        eta_load_port: '',
        loading_start_time: '',
        loading_completion_time: '',
        etd_load_port: '',
        eta_discharge_port: '',
        discharge_port_location: '',
        discharge_completion_time: '',
        notes: '',
      })
      onCargoCreated()
      alert('Cargo created successfully!')
    } catch (error: any) {
      console.error('Error creating cargo:', error)
      const errorMessage = error.response?.data?.detail || error.message || 'Error creating cargo. Please try again.'
      alert(errorMessage)
    }
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Create Cargo (Vessel) Details
      </Typography>
      {!monthlyPlanId && (
        <Typography color="error" sx={{ mb: 2 }}>
          Please create a monthly plan first
        </Typography>
      )}
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControl fullWidth size="small">
          <InputLabel>Product</InputLabel>
          <Select
            label="Product"
            value={formData.product_name}
            onChange={(e) => setFormData({ ...formData, product_name: String(e.target.value) })}
            required
          >
            {(contract.products || []).map((p, idx) => (
              <MenuItem key={`${p.name}-${idx}`} value={p.name}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Vessel Name"
          value={formData.vessel_name}
          onChange={(e) => setFormData({ ...formData, vessel_name: e.target.value })}
          required
          fullWidth
        />
        <TextField
          label="Load Port(s)"
          value={formData.load_ports}
          onChange={(e) => setFormData({ ...formData, load_ports: e.target.value })}
          required
          fullWidth
        />
        <TextField
          label="Inspector Name"
          value={formData.inspector_name}
          onChange={(e) => setFormData({ ...formData, inspector_name: e.target.value })}
          fullWidth
        />
        <TextField
          label="Cargo Quantity"
          type="number"
          value={formData.cargo_quantity}
          onChange={(e) => setFormData({ ...formData, cargo_quantity: e.target.value })}
          required
          fullWidth
        />
        <TextField
          label="Laycan Window"
          value={formData.laycan_window}
          onChange={(e) => setFormData({ ...formData, laycan_window: e.target.value })}
          placeholder="e.g., 15-20 Jan 2024"
          fullWidth
        />
        <TextField
          label="ETA Load Port"
          type="datetime-local"
          value={formData.eta_load_port}
          onChange={(e) => setFormData({ ...formData, eta_load_port: e.target.value })}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="Loading Start Time"
          type="datetime-local"
          value={formData.loading_start_time}
          onChange={(e) => setFormData({ ...formData, loading_start_time: e.target.value })}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="Loading Completion Time"
          type="datetime-local"
          value={formData.loading_completion_time}
          onChange={(e) => setFormData({ ...formData, loading_completion_time: e.target.value })}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="ETD Load Port"
          type="datetime-local"
          value={formData.etd_load_port}
          onChange={(e) => setFormData({ ...formData, etd_load_port: e.target.value })}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
        {contract.contract_type === 'CIF' && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              CIF Specific Fields:
            </Typography>
            <TextField
              label="ETA Discharge Port"
              type="datetime-local"
              value={formData.eta_discharge_port}
              onChange={(e) => setFormData({ ...formData, eta_discharge_port: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Discharge Port Location"
              value={formData.discharge_port_location}
              onChange={(e) => setFormData({ ...formData, discharge_port_location: e.target.value })}
              fullWidth
            />
            <TextField
              label="Discharge Completion Time"
              type="datetime-local"
              value={formData.discharge_completion_time}
              onChange={(e) => setFormData({ ...formData, discharge_completion_time: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </>
        )}
        <TextField
          label="Remark"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          multiline
          rows={3}
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          startIcon={<Add />}
          disabled={!monthlyPlanId}
        >
          Create Cargo
        </Button>
      </Box>
    </Paper>
  )
}

