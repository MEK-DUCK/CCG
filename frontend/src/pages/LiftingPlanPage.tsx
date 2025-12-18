import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  Button,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { FileDownload, PictureAsPdf } from '@mui/icons-material'
import { customerAPI, contractAPI, quarterlyPlanAPI, monthlyPlanAPI } from '../api/client'
import type { Customer, Contract, QuarterlyPlan, MonthlyPlan } from '../types'

interface MonthlyPlanEntry {
  monthlyPlanId: number
  month: number
  quantity: number
  laycan5Days?: string
  laycan2Days?: string
  loadingWindow?: string
  deliveryWindow?: string
}

interface ContractQuarterlyData {
  customerId: number
  customerName: string
  contractId: number
  contractNumber: string
  contractType: 'FOB' | 'CIF'
  month1Entries: MonthlyPlanEntry[]  // All entries for month 1
  month2Entries: MonthlyPlanEntry[]  // All entries for month 2
  month3Entries: MonthlyPlanEntry[]  // All entries for month 3
  total: number
  notes: string
}

export default function LiftingPlanPage() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1')
  const [selectedYear, setSelectedYear] = useState(2024) // Default to 2024 to match test data
  const [customers, setCustomers] = useState<Customer[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [quarterlyPlans, setQuarterlyPlans] = useState<QuarterlyPlan[]>([])
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([])
  const [contractData, setContractData] = useState<Map<number, ContractQuarterlyData>>(new Map())
  const [notes, setNotes] = useState<Map<number, string>>(new Map()) // contractId -> notes
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (customers.length > 0 && contracts.length > 0 && quarterlyPlans.length > 0 && monthlyPlans.length > 0) {
      calculateQuarterlyData()
    }
  }, [selectedQuarter, selectedYear, customers, contracts, quarterlyPlans, monthlyPlans, notes])

  const loadData = async () => {
    try {
      setLoading(true)
      const [customersRes, contractsRes] = await Promise.all([
        customerAPI.getAll(),
        contractAPI.getAll(),
      ])
      setCustomers(customersRes.data || [])
      setContracts(contractsRes.data || [])

      // Load all quarterly plans
      const quarterlyRes = await quarterlyPlanAPI.getAll()
      setQuarterlyPlans(quarterlyRes.data || [])

      // Load all monthly plans
      const monthlyRes = await monthlyPlanAPI.getAll()
      setMonthlyPlans(monthlyRes.data || [])
    } catch (error) {
      console.error('Error loading lifting plan data:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateQuarterlyData = () => {
    const dataMap = new Map<number, ContractQuarterlyData>()
    
    // Determine months for selected quarter
    const quarterMonths: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number[]> = {
      Q1: [1, 2, 3],   // Jan, Feb, Mar
      Q2: [4, 5, 6],   // Apr, May, Jun
      Q3: [7, 8, 9],   // Jul, Aug, Sep
      Q4: [10, 11, 12], // Oct, Nov, Dec
    }
    const months = quarterMonths[selectedQuarter]

    // Initialize all contracts with empty entries
    contracts.forEach(contract => {
      const customer = customers.find(c => c.id === contract.customer_id)
      if (!customer) return

      dataMap.set(contract.id, {
        customerId: contract.customer_id,
        customerName: customer.name,
        contractId: contract.id,
        contractNumber: contract.contract_number,
        contractType: contract.contract_type,
        month1Entries: [],
        month2Entries: [],
        month3Entries: [],
        total: 0,
        notes: notes.get(contract.id) || '',
      })
    })

    // Process each contract's quarterly plans
    contracts.forEach(contract => {
      // Find quarterly plans for this contract
      const contractQuarterlyPlans = quarterlyPlans.filter(qp => qp.contract_id === contract.id)
      
      contractQuarterlyPlans.forEach(qp => {
        // Find monthly plans for this quarterly plan
        const qpMonthlyPlans = monthlyPlans.filter(mp => 
          mp.quarterly_plan_id === qp.id && 
          mp.year === selectedYear
        )

        // Process each monthly plan entry separately
        qpMonthlyPlans.forEach(mp => {
          const monthIndex = months.indexOf(mp.month)
          if (monthIndex !== -1) {
            const contractData = dataMap.get(contract.id)
            if (contractData) {
              const entry: MonthlyPlanEntry = {
                monthlyPlanId: mp.id,
                month: mp.month,
                quantity: mp.month_quantity,
                laycan5Days: contract.contract_type === 'FOB' ? (mp.laycan_5_days || undefined) : undefined,
                laycan2Days: contract.contract_type === 'FOB' ? (mp.laycan_2_days || undefined) : undefined,
                loadingWindow: contract.contract_type === 'CIF' ? (mp.loading_window || undefined) : undefined,
                deliveryWindow: contract.contract_type === 'CIF' ? (mp.delivery_window || undefined) : undefined,
              }

              if (monthIndex === 0) {
                contractData.month1Entries.push(entry)
              } else if (monthIndex === 1) {
                contractData.month2Entries.push(entry)
              } else if (monthIndex === 2) {
                contractData.month3Entries.push(entry)
              }
              
              // Calculate total
              contractData.total = 
                contractData.month1Entries.reduce((sum, e) => sum + e.quantity, 0) +
                contractData.month2Entries.reduce((sum, e) => sum + e.quantity, 0) +
                contractData.month3Entries.reduce((sum, e) => sum + e.quantity, 0)
            }
          }
        })
      })
    })

    setContractData(dataMap)
  }

  const handleNotesChange = (contractId: number, value: string) => {
    const newNotes = new Map(notes)
    newNotes.set(contractId, value)
    setNotes(newNotes)
    
    // Update contract data
    const updatedData = new Map(contractData)
    const contract = updatedData.get(contractId)
    if (contract) {
      contract.notes = value
      updatedData.set(contractId, contract)
      setContractData(updatedData)
    }
  }


  const getMonthName = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4', index: number): string => {
    const monthNames: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', string[]> = {
      Q1: ['January', 'February', 'March'],
      Q2: ['April', 'May', 'June'],
      Q3: ['July', 'August', 'September'],
      Q4: ['October', 'November', 'December'],
    }
    return monthNames[quarter][index]
  }

  const handleExportToExcel = () => {
    // Dynamic import of xlsx to avoid issues if not installed
    import('xlsx').then((XLSX) => {
      const dataArray = Array.from(contractData.values()).sort((a, b) => {
        const customerCompare = a.customerName.localeCompare(b.customerName)
        if (customerCompare !== 0) return customerCompare
        return a.contractNumber.localeCompare(b.contractNumber)
      })

      const exportData: any[] = dataArray.map((data) => {
        // Format month 1 entries
        const month1Parts = data.month1Entries.map((entry) => {
          let laycanText = ''
          if (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) {
            const parts: string[] = []
            if (entry.laycan5Days) parts.push(`5 Days: ${entry.laycan5Days}`)
            if (entry.laycan2Days) parts.push(`2 Days: ${entry.laycan2Days}`)
            laycanText = parts.length > 0 ? ` (${parts.join(', ')})` : ''
          }
          return `${entry.quantity.toLocaleString()} KT${laycanText}`
        })
        const month1Text = month1Parts.length > 0 ? month1Parts.join('\n') : '-'
        
        // Format month 2 entries
        const month2Parts = data.month2Entries.map((entry) => {
          let laycanText = ''
          if (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) {
            const parts: string[] = []
            if (entry.laycan5Days) parts.push(`5 Days: ${entry.laycan5Days}`)
            if (entry.laycan2Days) parts.push(`2 Days: ${entry.laycan2Days}`)
            laycanText = parts.length > 0 ? ` (${parts.join(', ')})` : ''
          }
          return `${entry.quantity.toLocaleString()} KT${laycanText}`
        })
        const month2Text = month2Parts.length > 0 ? month2Parts.join('\n') : '-'
        
        // Format month 3 entries
        const month3Parts = data.month3Entries.map((entry) => {
          let laycanText = ''
          if (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) {
            const parts: string[] = []
            if (entry.laycan5Days) parts.push(`5 Days: ${entry.laycan5Days}`)
            if (entry.laycan2Days) parts.push(`2 Days: ${entry.laycan2Days}`)
            laycanText = parts.length > 0 ? ` (${parts.join(', ')})` : ''
          }
          return `${entry.quantity.toLocaleString()} KT${laycanText}`
        })
        const month3Text = month3Parts.length > 0 ? month3Parts.join('\n') : '-'

        return {
          'Customer': data.customerName,
          'Contract Number': data.contractNumber,
          'Type': data.contractType,
          [getMonthName(selectedQuarter, 0)]: month1Text,
          [getMonthName(selectedQuarter, 1)]: month2Text,
          [getMonthName(selectedQuarter, 2)]: month3Text,
          [`Total (${selectedQuarter})`]: `${data.total.toLocaleString()} KT`,
          'Remark': data.notes || '',
        }
      })

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(exportData)

      // Set column widths
      const colWidths = [
        { wch: 20 }, // Customer
        { wch: 18 }, // Contract Number
        { wch: 10 }, // Type
        { wch: 18 }, // Month 1
        { wch: 18 }, // Month 2
        { wch: 18 }, // Month 3
        { wch: 15 }, // Total
        { wch: 30 }, // Remark
      ]
      ws['!cols'] = colWidths

      // Create workbook
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Lifting Plan')

      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0]
      const filename = `Lifting_Plan_${selectedQuarter}_${selectedYear}_${dateStr}.xlsx`

      // Save file
      XLSX.writeFile(wb, filename)
    }).catch((error) => {
      console.error('Error exporting to Excel:', error)
      alert('Error exporting to Excel. Please make sure the xlsx package is installed.')
    })
  }

  const handleExportToPDF = async () => {
    try {
      // Dynamic import of jsPDF and jspdf-autotable
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default
      
      const dataArray = Array.from(contractData.values()).sort((a, b) => {
        const customerCompare = a.customerName.localeCompare(b.customerName)
        if (customerCompare !== 0) return customerCompare
        return a.contractNumber.localeCompare(b.contractNumber)
      })

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      
      // Add title
      doc.setFontSize(16)
      doc.text(`Lifting Plan - ${selectedQuarter} ${selectedYear}`, 14, 15)

      // Prepare table data
      const tableData = dataArray.map((data) => {
        // Format month 1 entries
        const month1Parts = data.month1Entries.map((entry) => {
          let laycanText = ''
          if (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) {
            const parts: string[] = []
            if (entry.laycan5Days) parts.push(`5 Days: ${entry.laycan5Days}`)
            if (entry.laycan2Days) parts.push(`2 Days: ${entry.laycan2Days}`)
            laycanText = parts.length > 0 ? `\n(${parts.join('\n')})` : ''
          }
          return `${entry.quantity.toLocaleString()} KT${laycanText}`
        })
        const month1Text = month1Parts.length > 0 ? month1Parts.join('\n\n') : '-'
        
        // Format month 2 entries
        const month2Parts = data.month2Entries.map((entry) => {
          let laycanText = ''
          if (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) {
            const parts: string[] = []
            if (entry.laycan5Days) parts.push(`5 Days: ${entry.laycan5Days}`)
            if (entry.laycan2Days) parts.push(`2 Days: ${entry.laycan2Days}`)
            laycanText = parts.length > 0 ? `\n(${parts.join('\n')})` : ''
          }
          return `${entry.quantity.toLocaleString()} KT${laycanText}`
        })
        const month2Text = month2Parts.length > 0 ? month2Parts.join('\n\n') : '-'
        
        // Format month 3 entries
        const month3Parts = data.month3Entries.map((entry) => {
          let laycanText = ''
          if (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) {
            const parts: string[] = []
            if (entry.laycan5Days) parts.push(`5 Days: ${entry.laycan5Days}`)
            if (entry.laycan2Days) parts.push(`2 Days: ${entry.laycan2Days}`)
            laycanText = parts.length > 0 ? `\n(${parts.join('\n')})` : ''
          }
          return `${entry.quantity.toLocaleString()} KT${laycanText}`
        })
        const month3Text = month3Parts.length > 0 ? month3Parts.join('\n\n') : '-'

        return [
          data.customerName,
          data.contractNumber,
          data.contractType,
          month1Text,
          month2Text,
          month3Text,
          `${data.total.toLocaleString()} KT`,
          data.notes || '',
        ]
      })

      // Add table using autoTable
      autoTable(doc, {
        head: [['Customer', 'Contract Number', 'Type', getMonthName(selectedQuarter, 0), getMonthName(selectedQuarter, 1), getMonthName(selectedQuarter, 2), `Total (${selectedQuarter})`, 'Remark']],
        body: tableData,
        startY: 25,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [25, 118, 210], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 30 },
          2: { cellWidth: 20 },
          3: { cellWidth: 30 },
          4: { cellWidth: 30 },
          5: { cellWidth: 30 },
          6: { cellWidth: 25 },
          7: { cellWidth: 40 },
        },
      })

      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0]
      const filename = `Lifting_Plan_${selectedQuarter}_${selectedYear}_${dateStr}.pdf`

      // Save file
      doc.save(filename)
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      alert(`Error exporting to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const renderTable = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )
    }

    const dataArray = Array.from(contractData.values()).sort((a, b) => {
      // Sort by customer name first, then by contract number
      const customerCompare = a.customerName.localeCompare(b.customerName)
      if (customerCompare !== 0) return customerCompare
      return a.contractNumber.localeCompare(b.contractNumber)
    })

    if (dataArray.length === 0) {
      return (
        <Typography variant="body1" color="text.secondary" sx={{ p: 2 }}>
          No contracts found
        </Typography>
      )
    }

    return (
      <TableContainer 
        component={Paper}
        sx={{
          maxWidth: '100%',
          overflowX: 'auto',
          '& .MuiTable-root': {
            minWidth: isMobile ? 1100 : 'auto',
          },
        }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: isMobile ? 150 : 200, fontWeight: 'bold' }}>Customer</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 150 : 200, fontWeight: 'bold' }}>Contract Number</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 100 : 120, fontWeight: 'bold' }}>Type</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 150, fontWeight: 'bold' }}>{getMonthName(selectedQuarter, 0)}</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 150, fontWeight: 'bold' }}>{getMonthName(selectedQuarter, 1)}</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 150, fontWeight: 'bold' }}>{getMonthName(selectedQuarter, 2)}</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 120 : 150, fontWeight: 'bold' }}>Total ({selectedQuarter})</TableCell>
              <TableCell sx={{ minWidth: isMobile ? 200 : 250, fontWeight: 'bold' }}>Remark</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dataArray.map((data) => (
              <TableRow 
                key={data.contractId}
                sx={{ 
                  '& td': { 
                    minHeight: isMobile ? 56 : 48,
                    py: isMobile ? 1.5 : 1,
                  }
                }}
              >
                <TableCell sx={{ fontWeight: 'medium' }}>{data.customerName}</TableCell>
                <TableCell>{data.contractNumber}</TableCell>
                <TableCell>
                  <Chip 
                    label={data.contractType} 
                    color={data.contractType === 'FOB' ? 'primary' : 'secondary'} 
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Box>
                    {data.month1Entries.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    ) : (
                      data.month1Entries.map((entry, idx) => (
                        <Box key={entry.monthlyPlanId} sx={{ mb: idx < data.month1Entries.length - 1 ? 1.5 : 0 }}>
                          <Typography variant="body2" sx={{ mb: (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) ? 0.5 : 0 }}>
                            {entry.quantity.toLocaleString()} KT
                          </Typography>
                          {data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days) && (
                            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                              {entry.laycan5Days && (
                                <Typography variant="caption" color="text.secondary">
                                  5 Days: {entry.laycan5Days}
                                </Typography>
                              )}
                              {entry.laycan2Days && (
                                <Typography variant="caption" color="text.secondary">
                                  2 Days: {entry.laycan2Days}
                                </Typography>
                              )}
                            </Box>
                          )}
                          {data.contractType === 'CIF' && (entry.loadingWindow || entry.deliveryWindow) && (
                            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                              {entry.loadingWindow && (
                                <Typography variant="caption" color="text.secondary">
                                  Loading: {entry.loadingWindow}
                                </Typography>
                              )}
                              {entry.deliveryWindow && (
                                <Typography variant="caption" color="text.secondary">
                                  Delivery: {entry.deliveryWindow}
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Box>
                      ))
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box>
                    {data.month2Entries.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    ) : (
                      data.month2Entries.map((entry, idx) => (
                        <Box key={entry.monthlyPlanId} sx={{ mb: idx < data.month2Entries.length - 1 ? 1.5 : 0 }}>
                          <Typography variant="body2" sx={{ mb: (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) ? 0.5 : 0 }}>
                            {entry.quantity.toLocaleString()} KT
                          </Typography>
                          {data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days) && (
                            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                              {entry.laycan5Days && (
                                <Typography variant="caption" color="text.secondary">
                                  5 Days: {entry.laycan5Days}
                                </Typography>
                              )}
                              {entry.laycan2Days && (
                                <Typography variant="caption" color="text.secondary">
                                  2 Days: {entry.laycan2Days}
                                </Typography>
                              )}
                            </Box>
                          )}
                          {data.contractType === 'CIF' && (entry.loadingWindow || entry.deliveryWindow) && (
                            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                              {entry.loadingWindow && (
                                <Typography variant="caption" color="text.secondary">
                                  Loading: {entry.loadingWindow}
                                </Typography>
                              )}
                              {entry.deliveryWindow && (
                                <Typography variant="caption" color="text.secondary">
                                  Delivery: {entry.deliveryWindow}
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Box>
                      ))
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box>
                    {data.month3Entries.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    ) : (
                      data.month3Entries.map((entry, idx) => (
                        <Box key={entry.monthlyPlanId} sx={{ mb: idx < data.month3Entries.length - 1 ? 1.5 : 0 }}>
                          <Typography variant="body2" sx={{ mb: (data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days)) ? 0.5 : 0 }}>
                            {entry.quantity.toLocaleString()} KT
                          </Typography>
                          {data.contractType === 'FOB' && (entry.laycan5Days || entry.laycan2Days) && (
                            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                              {entry.laycan5Days && (
                                <Typography variant="caption" color="text.secondary">
                                  5 Days: {entry.laycan5Days}
                                </Typography>
                              )}
                              {entry.laycan2Days && (
                                <Typography variant="caption" color="text.secondary">
                                  2 Days: {entry.laycan2Days}
                                </Typography>
                              )}
                            </Box>
                          )}
                          {data.contractType === 'CIF' && (entry.loadingWindow || entry.deliveryWindow) && (
                            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                              {entry.loadingWindow && (
                                <Typography variant="caption" color="text.secondary">
                                  Loading: {entry.loadingWindow}
                                </Typography>
                              )}
                              {entry.deliveryWindow && (
                                <Typography variant="caption" color="text.secondary">
                                  Delivery: {entry.deliveryWindow}
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Box>
                      ))
                    )}
                  </Box>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{data.total.toLocaleString()} KT</TableCell>
                <TableCell>
                  <TextField
                    value={data.notes}
                    onChange={(e) => handleNotesChange(data.contractId, e.target.value)}
                    placeholder="Add remark..."
                    size="small"
                    fullWidth
                    multiline
                    maxRows={2}
                    sx={{
                      '& .MuiInputBase-root': {
                        fontSize: isMobile ? '0.875rem' : '0.9375rem',
                      },
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  return (
    <Box>
      <Typography 
        variant="h4" 
        gutterBottom
        sx={{
          fontWeight: 700,
          color: '#000000',
          mb: 4,
          fontSize: { xs: '1.75rem', md: '2rem' },
          letterSpacing: '-0.02em',
        }}
      >
        Lifting Plan - Quarterly Summary
      </Typography>
      
      <Box 
        sx={{ 
          mb: 4, 
          p: 3,
          bgcolor: '#FFFFFF',
          borderRadius: 3,
          boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
          display: 'flex', 
          gap: 2, 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          justifyContent: 'space-between' 
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Quarter</InputLabel>
            <Select
              value={selectedQuarter}
              label="Quarter"
              onChange={(e) => setSelectedQuarter(e.target.value as 'Q1' | 'Q2' | 'Q3' | 'Q4')}
            >
              <MenuItem value="Q1">Q1 (Jan - Mar)</MenuItem>
              <MenuItem value="Q2">Q2 (Apr - Jun)</MenuItem>
              <MenuItem value="Q3">Q3 (Jul - Sep)</MenuItem>
              <MenuItem value="Q4">Q4 (Oct - Dec)</MenuItem>
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Year</InputLabel>
            <Select
              value={selectedYear}
              label="Year"
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = 2024 + i  // Start from 2024 to match test data (2024-2028)
                return (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                )
              })}
            </Select>
          </FormControl>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<FileDownload />}
            onClick={handleExportToExcel}
            sx={{ 
              fontSize: isMobile ? '0.75rem' : '0.875rem',
              minHeight: isMobile ? 40 : 36,
              px: isMobile ? 1.5 : 2,
            }}
          >
            Export to Excel
          </Button>
          <Button
            variant="contained"
            color="secondary"
            size="small"
            startIcon={<PictureAsPdf />}
            onClick={handleExportToPDF}
            sx={{ 
              fontSize: isMobile ? '0.75rem' : '0.875rem',
              minHeight: isMobile ? 40 : 36,
              px: isMobile ? 1.5 : 2,
            }}
          >
            Save as PDF
          </Button>
        </Box>
      </Box>

      <Box 
        sx={{ 
          mt: 4,
          bgcolor: '#FFFFFF',
          borderRadius: 3,
          boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
        }}
      >
        {renderTable()}
      </Box>
    </Box>
  )
}
