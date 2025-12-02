import { useState } from 'react'
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
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
  const productOptions = Array.isArray(contract.products) ? contract.products : []
  const [selectedProduct, setSelectedProduct] = useState(productOptions[0]?.name || '')
  const [formData, setFormData] = useState({
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
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!monthlyPlanId) {
      alert('Please create a monthly plan first')
      return
    }
    if (!selectedProduct) {
      alert('Please select a product from the contract')
      return
    }
    try {
      const toISODate = (value: string) => (value ? new Date(value).toISOString() : undefined)

      const payload: any = {
        customer_id: contract.customer_id,
        product_name: selectedProduct,
        contract_id: contract.id,
        monthly_plan_id: monthlyPlanId,
        vessel_name: formData.vessel_name,
        load_ports: formData.load_ports,
        inspector_name: formData.inspector_name || undefined,
        cargo_quantity: parseFloat(formData.cargo_quantity),
        laycan_window: formData.laycan_window || undefined,
        eta_load_port: formData.eta_load_port || undefined,
        loading_start_time: formData.loading_start_time || undefined,
        loading_completion_time: formData.loading_completion_time || undefined,
        etd_load_port: formData.etd_load_port || undefined,
        notes: formData.notes || undefined,
      }

      if (contract.contract_type === 'CIF') {
        if (formData.eta_discharge_port) payload.eta_discharge_port = toISODate(formData.eta_discharge_port)
        if (formData.discharge_port_location) payload.discharge_port_location = formData.discharge_port_location
      }

      await cargoAPI.create(payload)
      setFormData({
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
        notes: '',
      })
      onCargoCreated()
      alert('Cargo created successfully!')
    } catch (error) {
      console.error('Error creating cargo:', error)
      alert('Error creating cargo. Please try again.')
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
        <TextField
          label="Product"
          select
          SelectProps={{ native: true }}
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
          required
          fullWidth
          helperText="Select a product defined in the contract"
        >
          {productOptions.map((product) => (
            <option key={product.name} value={product.name}>
              {product.name}
            </option>
          ))}
        </TextField>
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
              type="date"
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

