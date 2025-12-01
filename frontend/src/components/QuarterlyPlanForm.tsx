import { useState, useEffect } from 'react'
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
} from '@mui/material'
import { Add } from '@mui/icons-material'
import { quarterlyPlanAPI, contractAPI } from '../api/client'

interface QuarterlyPlanFormProps {
  contractId: number
  contract?: any  // Contract object with products
  editingPlan?: any  // Quarterly plan being edited
  onPlanCreated: () => void
  onCancel?: () => void
}

// Determine quarter order based on contract start month
const getQuarterOrder = (startMonth: number): ('Q1' | 'Q2' | 'Q3' | 'Q4')[] => {
  if (startMonth >= 1 && startMonth <= 3) {
    // Jan-Mar: Q1, Q2, Q3, Q4
    return ['Q1', 'Q2', 'Q3', 'Q4']
  } else if (startMonth >= 4 && startMonth <= 6) {
    // Apr-Jun: Q2, Q3, Q4, Q1
    return ['Q2', 'Q3', 'Q4', 'Q1']
  } else if (startMonth >= 7 && startMonth <= 9) {
    // Jul-Sep: Q3, Q4, Q1, Q2
    return ['Q3', 'Q4', 'Q1', 'Q2']
  } else {
    // Oct-Dec: Q4, Q1, Q2, Q3
    return ['Q4', 'Q1', 'Q2', 'Q3']
  }
}

// Get quarter label with months
const getQuarterLabel = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): string => {
  const labels: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', string> = {
    Q1: 'Jan-Mar',
    Q2: 'Apr-Jun',
    Q3: 'Jul-Sep',
    Q4: 'Oct-Dec',
  }
  return labels[quarter]
}

export default function QuarterlyPlanForm({ contractId, contract, editingPlan, onPlanCreated, onCancel }: QuarterlyPlanFormProps) {
  const [formData, setFormData] = useState({
    q1_quantity: editingPlan ? editingPlan.q1_quantity.toString() : '',
    q2_quantity: editingPlan ? editingPlan.q2_quantity.toString() : '',
    q3_quantity: editingPlan ? editingPlan.q3_quantity.toString() : '',
    q4_quantity: editingPlan ? editingPlan.q4_quantity.toString() : '',
  })
  const [quarterOrder, setQuarterOrder] = useState<('Q1' | 'Q2' | 'Q3' | 'Q4')[]>(['Q1', 'Q2', 'Q3', 'Q4'])
  const [contractData, setContractData] = useState<any>(contract)

  // Load contract and determine quarter order
  useEffect(() => {
    const loadContract = async () => {
      let contractToUse = contract
      if (!contractToUse && contractId) {
        try {
          const contractRes = await contractAPI.getById(contractId)
          contractToUse = contractRes.data
          setContractData(contractToUse)
        } catch (error) {
          console.error('Error loading contract:', error)
        }
      } else {
        setContractData(contractToUse)
      }

      if (contractToUse && contractToUse.start_period) {
        // Parse start period to get start month
        const startDate = new Date(contractToUse.start_period)
        const startMonth = startDate.getMonth() + 1
        
        // Determine quarter order
        const order = getQuarterOrder(startMonth)
        setQuarterOrder(order)
      }
    }
    loadContract()
  }, [contract, contractId])

  // Update form when editingPlan changes
  // Need to remap database values to form fields based on contract quarter order
  useEffect(() => {
    if (editingPlan && contractData && contractData.start_period) {
      // Get contract start month to determine quarter order
      const startDate = new Date(contractData.start_period)
      const startMonth = startDate.getMonth() + 1
      const order = getQuarterOrder(startMonth)
      
      // Map database fields (q1_quantity, q2_quantity, q3_quantity, q4_quantity) 
      // to contract quarters (position 0, 1, 2, 3)
      // Then map contract quarters to calendar quarters (Q1, Q2, Q3, Q4)
      const dbQuantities = [
        editingPlan.q1_quantity || 0,  // Contract quarter 1
        editingPlan.q2_quantity || 0,  // Contract quarter 2
        editingPlan.q3_quantity || 0,  // Contract quarter 3
        editingPlan.q4_quantity || 0,  // Contract quarter 4
      ]
      
      // Map contract quarters to calendar quarters
      const formDataMap: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number> = {
        Q1: 0,
        Q2: 0,
        Q3: 0,
        Q4: 0,
      }
      
      order.forEach((calendarQuarter, contractQuarterIndex) => {
        formDataMap[calendarQuarter] = dbQuantities[contractQuarterIndex]
      })
      
      setFormData({
        q1_quantity: formDataMap.Q1.toString(),
        q2_quantity: formDataMap.Q2.toString(),
        q3_quantity: formDataMap.Q3.toString(),
        q4_quantity: formDataMap.Q4.toString(),
      })
    } else if (editingPlan) {
      // Wait for contract data to load - don't use fallback as it will be incorrect
      // The contract data should be loaded by the useEffect above
    } else {
      setFormData({
        q1_quantity: '',
        q2_quantity: '',
        q3_quantity: '',
        q4_quantity: '',
      })
    }
  }, [editingPlan, contractData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!contractId) {
      alert('Contract ID is missing. Please select a contract first.')
      return
    }

    // Load contract if not provided
    let contractData = contract
    if (!contractData) {
      try {
        const contractRes = await contractAPI.getById(contractId)
        contractData = contractRes.data
      } catch (error) {
        alert('Error loading contract details. Please try again.')
        return
      }
    }

    // Calculate total quarterly quantity
    const q1 = parseFloat(formData.q1_quantity) || 0
    const q2 = parseFloat(formData.q2_quantity) || 0
    const q3 = parseFloat(formData.q3_quantity) || 0
    const q4 = parseFloat(formData.q4_quantity) || 0
    const totalQuarterlyQuantity = q1 + q2 + q3 + q4

    // Calculate contract total and optional quantities
    const contractProducts = Array.isArray(contractData.products) ? contractData.products : []
    if (contractProducts.length === 0) {
      alert('Contract has no products. Please add products to the contract first.')
      return
    }
    const totalContractQuantity = contractProducts.reduce((sum: number, p: any) => sum + (p.total_quantity || 0), 0)
    const totalOptionalQuantity = contractProducts.reduce((sum: number, p: any) => sum + (p.optional_quantity || 0), 0)
    const maxAllowedQuantity = totalContractQuantity + totalOptionalQuantity

    // Check if total doesn't equal contract total (must be exactly equal)
    if (totalQuarterlyQuantity !== totalContractQuantity) {
      if (totalQuarterlyQuantity < totalContractQuantity) {
        alert(`Error: Total quarterly quantity (${totalQuarterlyQuantity.toLocaleString()} KT) is less than the contract total quantity (${totalContractQuantity.toLocaleString()} KT). The quarterly plan total must equal the contract total.`)
        return
      } else if (totalQuarterlyQuantity > maxAllowedQuantity) {
        alert(`Error: Total quarterly quantity (${totalQuarterlyQuantity.toLocaleString()} KT) exceeds the maximum allowed quantity (${maxAllowedQuantity.toLocaleString()} KT = ${totalContractQuantity.toLocaleString()} KT total + ${totalOptionalQuantity.toLocaleString()} KT optional).`)
        return
      } else {
        // Using optional quantities - must equal total + optional
        if (totalQuarterlyQuantity !== maxAllowedQuantity) {
          alert(`Error: Total quarterly quantity (${totalQuarterlyQuantity.toLocaleString()} KT) must equal either the contract total (${totalContractQuantity.toLocaleString()} KT) or the maximum allowed (${maxAllowedQuantity.toLocaleString()} KT = total + optional).`)
          return
        }
        // Using optional quantities - show warning
        const optionalUsed = totalQuarterlyQuantity - totalContractQuantity
        const confirmMessage = `Warning: You are using ${optionalUsed.toLocaleString()} KT of optional quantity (Total: ${totalContractQuantity.toLocaleString()} KT, Optional: ${totalOptionalQuantity.toLocaleString()} KT).\n\nThe quarterly plan total equals the contract total + optional.\n\nDo you want to continue?`
        if (!window.confirm(confirmMessage)) {
          return
        }
      }
    }
    
    const usingOptionalQuantity = totalQuarterlyQuantity > totalContractQuantity

    try {
      // Remap form data (calendar quarters Q1-Q4) to database fields (contract quarters 1-4)
      // Get contract start month to determine quarter order
      if (!contractData || !contractData.start_period) {
        alert('Error: Contract data not loaded. Please try again.')
        return
      }
      
      const startDate = new Date(contractData.start_period)
      const startMonth = startDate.getMonth() + 1
      const order = getQuarterOrder(startMonth)
      
      
      // Map calendar quarters (Q1-Q4) from form to contract quarters (1-4) for database
      const formQuantities: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number> = {
        Q1: q1,
        Q2: q2,
        Q3: q3,
        Q4: q4,
      }
      
      // Map to database fields: q1_quantity = contract quarter 1, q2_quantity = contract quarter 2, etc.
      const dbQuantities = [
        formQuantities[order[0]],  // Contract quarter 1 -> q1_quantity
        formQuantities[order[1]],   // Contract quarter 2 -> q2_quantity
        formQuantities[order[2]],   // Contract quarter 3 -> q3_quantity
        formQuantities[order[3]],   // Contract quarter 4 -> q4_quantity
      ]
      
      
      if (editingPlan) {
        // Update existing plan
        await quarterlyPlanAPI.update(editingPlan.id, {
          q1_quantity: dbQuantities[0],
          q2_quantity: dbQuantities[1],
          q3_quantity: dbQuantities[2],
          q4_quantity: dbQuantities[3],
        })
        onPlanCreated()
        const successMsg = usingOptionalQuantity 
          ? `Quarterly plan updated successfully! Total equals contract total + optional (${totalQuarterlyQuantity.toLocaleString()} KT = ${totalContractQuantity.toLocaleString()} KT + ${(totalQuarterlyQuantity - totalContractQuantity).toLocaleString()} KT optional).`
          : `Quarterly plan updated successfully! Total equals contract total (${totalQuarterlyQuantity.toLocaleString()} KT).`
        alert(successMsg)
        if (onCancel) onCancel()
      } else {
        // Create new plan
        const response = await quarterlyPlanAPI.create({
          contract_id: contractId,
          q1_quantity: dbQuantities[0],
          q2_quantity: dbQuantities[1],
          q3_quantity: dbQuantities[2],
          q4_quantity: dbQuantities[3],
        })
        
        if (response.data) {
          setFormData({
            q1_quantity: '',
            q2_quantity: '',
            q3_quantity: '',
            q4_quantity: '',
          })
          onPlanCreated()
          const successMsg = usingOptionalQuantity 
            ? `Quarterly plan created successfully! Total equals contract total + optional (${totalQuarterlyQuantity.toLocaleString()} KT = ${totalContractQuantity.toLocaleString()} KT + ${(totalQuarterlyQuantity - totalContractQuantity).toLocaleString()} KT optional).`
            : `Quarterly plan created successfully! Total equals contract total (${totalQuarterlyQuantity.toLocaleString()} KT).`
          alert(successMsg)
        }
      }
    } catch (error: any) {
      console.error('Error saving quarterly plan:', error)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error occurred'
      alert(`Error saving quarterly plan: ${errorMessage}`)
    }
  }

  // Safety check for contract products
  const contractProducts = contract && contract.products 
    ? (Array.isArray(contract.products) ? contract.products : [])
    : []

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {editingPlan ? 'Edit Quarterly Plan' : 'Create Quarterly Plan'}
      </Typography>
      {contract && contractProducts.length > 0 && (
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'info.light', borderRadius: 1 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom sx={{ color: '#000000' }}>Contract Quantities:</Typography>
          {contractProducts.map((p: any, idx: number) => (
            <Typography key={idx} variant="body2" sx={{ color: '#000000' }}>
              {p?.name || 'Unknown'}: {(p?.total_quantity || 0).toLocaleString()} KT total
            </Typography>
          ))}
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 'bold', color: '#000000' }}>
            Total: {contractProducts.reduce((sum: number, p: any) => sum + (p?.total_quantity || 0), 0).toLocaleString()} KT
          </Typography>
        </Box>
      )}
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {quarterOrder.map((quarter, index) => {
          // Map contract quarter position to database field
          // For July-June: Q3 (position 0) -> q1_quantity, Q4 (position 1) -> q2_quantity, etc.
          // The database fields (q1_quantity, q2_quantity, q3_quantity, q4_quantity) represent contract quarters 1-4
          // NOT calendar quarters Q1-Q4
          const fieldMap: ('q1_quantity' | 'q2_quantity' | 'q3_quantity' | 'q4_quantity')[] = [
            'q1_quantity',  // Contract quarter 1
            'q2_quantity',  // Contract quarter 2
            'q3_quantity',  // Contract quarter 3
            'q4_quantity',  // Contract quarter 4
          ]
          const fieldName = fieldMap[index]
          
          return (
            <TextField
              key={quarter}
              label={`${quarter} Quantity (${getQuarterLabel(quarter)}) - Contract Quarter ${index + 1}`}
              type="number"
              value={formData[fieldName]}
              onChange={(e) => setFormData({ ...formData, [fieldName]: e.target.value })}
              fullWidth
            />
          )
        })}
        
        {/* Display quarterly plan total and validation */}
        {contract && contractProducts.length > 0 && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
            {(() => {
              const q1 = parseFloat(formData.q1_quantity) || 0
              const q2 = parseFloat(formData.q2_quantity) || 0
              const q3 = parseFloat(formData.q3_quantity) || 0
              const q4 = parseFloat(formData.q4_quantity) || 0
              const quarterlyTotal = q1 + q2 + q3 + q4
              const contractTotal = contractProducts.reduce((sum: number, p: any) => sum + (p?.total_quantity || 0), 0)
              const isValid = quarterlyTotal === contractTotal
              
              return (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#000000' }}>
                    Total: {quarterlyTotal.toLocaleString()} KT
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic', color: '#000000' }}>
                    Note: Quarterly plan total (Q1+Q2+Q3+Q4) must equal the contract total ({contractTotal.toLocaleString()} KT)
                  </Typography>
                </>
              )
            })()}
          </Box>
        )}
        
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          {onCancel && (
            <Button onClick={onCancel} variant="outlined">
              Cancel
            </Button>
          )}
          <Button type="submit" variant="contained" startIcon={editingPlan ? undefined : <Add />}>
            {editingPlan ? 'Update Quarterly Plan' : 'Create Quarterly Plan'}
          </Button>
        </Box>
      </Box>
    </Paper>
  )
}

