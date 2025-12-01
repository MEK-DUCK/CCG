import { Box, Chip } from '@mui/material'
import { Today, CalendarMonth, Warning, CheckCircle, Schedule } from '@mui/icons-material'

interface QuickFiltersProps {
  onFilterSelect: (filterType: string) => void
  currentMonth?: number
  currentYear?: number
  selectedMonth: number
  selectedYear: number
  onMonthChange: (month: number) => void
  onYearChange: (year: number) => void
}

export default function QuickFilters({ 
  onFilterSelect, 
  currentMonth, 
  currentYear,
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange,
}: QuickFiltersProps) {
  const now = new Date()
  const currentMonthValue = currentMonth || now.getMonth() + 1
  const currentYearValue = currentYear || now.getFullYear()
  const currentQuarter = Math.floor((currentMonthValue - 1) / 3) + 1
  const selectedQuarter = Math.floor((selectedMonth - 1) / 3) + 1

  const quarterOptions = [
    { label: 'Q1 (Jan-Mar)', startMonth: 1 },
    { label: 'Q2 (Apr-Jun)', startMonth: 4 },
    { label: 'Q3 (Jul-Sep)', startMonth: 7 },
    { label: 'Q4 (Oct-Dec)', startMonth: 10 },
  ]

  const handleQuickFilter = (filterType: string) => {
    if (filterType === 'this-month') {
      onMonthChange(currentMonthValue)
      onYearChange(currentYearValue)
    } else if (filterType === 'this-quarter') {
      const quarterStartMonth = Math.floor((currentMonthValue - 1) / 3) * 3 + 1
      onMonthChange(quarterStartMonth)
      onYearChange(currentYearValue)
    } else {
      onFilterSelect(filterType)
    }
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      <Chip
        icon={<Today fontSize="small" />}
        label="This Month"
        onClick={() => handleQuickFilter('this-month')}
        variant="outlined"
        sx={{ cursor: 'pointer' }}
        color={selectedMonth === currentMonthValue && selectedYear === currentYearValue ? 'primary' : 'default'}
      />
      <Chip
        icon={<CalendarMonth fontSize="small" />}
        label="This Quarter"
        onClick={() => handleQuickFilter('this-quarter')}
        variant="outlined"
        sx={{ cursor: 'pointer' }}
        color={selectedQuarter === currentQuarter && selectedYear === currentYearValue ? 'primary' : 'default'}
      />
      {quarterOptions.map((quarter, index) => (
        <Chip
          key={quarter.label}
          label={quarter.label}
          onClick={() => {
            onMonthChange(quarter.startMonth)
            onYearChange(selectedYear)
          }}
          variant="outlined"
          sx={{ cursor: 'pointer' }}
          color={selectedQuarter === index + 1 ? 'primary' : 'default'}
        />
      ))}
      <Chip
        icon={<Schedule fontSize="small" />}
        label="Pending"
        onClick={() => handleQuickFilter('pending')}
        variant="outlined"
        sx={{ cursor: 'pointer' }}
      />
      <Chip
        icon={<CheckCircle fontSize="small" />}
        label="Completed"
        onClick={() => handleQuickFilter('completed')}
        variant="outlined"
        sx={{ cursor: 'pointer' }}
      />
      <Chip
        icon={<Warning fontSize="small" />}
        label="In Road"
        onClick={() => handleQuickFilter('in-road')}
        variant="outlined"
        sx={{ cursor: 'pointer' }}
      />
    </Box>
  )
}

