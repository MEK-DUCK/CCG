import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
} from '@mui/material'
import { monthlyPlanAPI } from '../api/client'
import type { MonthlyPlan } from '../types'

interface MonthlyPlanEditDialogProps {
  open: boolean
  plan: MonthlyPlan | null
  onClose: () => void
  onUpdated: () => void
}

export default function MonthlyPlanEditDialog({
  open,
  plan,
  onClose,
  onUpdated,
}: MonthlyPlanEditDialogProps) {
  const [formData, setFormData] = useState({
    month_quantity: '',
    laycan_5_days: '',
    laycan_2_days: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (plan) {
      setFormData({
        month_quantity: plan.month_quantity?.toString() || '',
        laycan_5_days: plan.laycan_5_days || '',
        laycan_2_days: plan.laycan_2_days || '',
      })
    } else {
      setFormData({
        month_quantity: '',
        laycan_5_days: '',
        laycan_2_days: '',
      })
    }
  }, [plan, open])

  const handleSave = async () => {
    if (!plan) return
    const quantity = parseFloat(formData.month_quantity)
    if (Number.isNaN(quantity) || quantity < 0) {
      alert('Please enter a valid positive quantity')
      return
    }

    setSaving(true)
    try {
      await monthlyPlanAPI.update(plan.id, {
        month_quantity: quantity,
        laycan_5_days: formData.laycan_5_days || null,
        laycan_2_days: formData.laycan_2_days || null,
      })
      onUpdated()
      onClose()
    } catch (error: any) {
      console.error('Error updating monthly plan:', error)
      alert(`Error updating monthly plan: ${error?.response?.data?.detail || error.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (!saving) {
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Monthly Plan</DialogTitle>
      <DialogContent dividers>
        {plan ? (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Quantity (KT)"
              type="number"
              value={formData.month_quantity}
              onChange={(e) => setFormData((prev) => ({ ...prev, month_quantity: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              label="Laycan 5 Days"
              value={formData.laycan_5_days}
              onChange={(e) => setFormData((prev) => ({ ...prev, laycan_5_days: e.target.value }))}
              placeholder="User entry"
              fullWidth
            />
            <TextField
              label="Laycan 2 Days"
              value={formData.laycan_2_days}
              onChange={(e) => setFormData((prev) => ({ ...prev, laycan_2_days: e.target.value }))}
              placeholder="User entry"
              fullWidth
            />
          </Stack>
        ) : (
          'No monthly plan selected'
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving || !plan}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

