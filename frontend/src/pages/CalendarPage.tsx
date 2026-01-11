import { useState, useEffect, useMemo, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { EventClickArg, EventContentArg } from '@fullcalendar/core'
import {
  Box,
  Paper,
  Typography,
  Dialog,
  DialogContent,
  Button,
  Chip,
  CircularProgress,
  useMediaQuery,
  useTheme,
  IconButton,
  Tooltip,
  Fade,
  ToggleButtonGroup,
  ToggleButton,
  Popover,
  Stack,
  Switch,
  FormControlLabel,
  Badge,
} from '@mui/material'
import {
  Close,
  Edit,
  Visibility,
  Warning,
  FilterList,
  CalendarMonth,
  ViewWeek,
  LocalShipping,
  Anchor,
  Schedule,
  Description,
  Person,
  Inventory,
  Place,
  NavigateBefore,
  NavigateNext,
  Today,
  WarningAmber,
  CheckCircle,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { contractAPI, customerAPI, monthlyPlanAPI, cargoAPI } from '../api/client'
import type { Contract, Customer, MonthlyPlan, Cargo } from '../types'
import { parseLaycanDate } from '../utils/laycanParser'
import { format } from 'date-fns'

// Event types for the calendar
type EventType = 'fob_laycan' | 'cif_loading' | 'tng_due' | 'nd_due'

interface CalendarEvent {
  id: string
  title: string
  start: Date
  allDay: boolean
  extendedProps: {
    type: EventType
    customerName: string
    contractNumber: string
    contractId: number
    productName: string
    vesselName: string | null
    quantity: number
    status: string
    cargoId: number | null
    monthlyPlanId: number
    loadPort: string | null
    isOverdue: boolean
    isTBA: boolean
    contractType: 'FOB' | 'CIF'
    rawLaycan: string
  }
  backgroundColor: string
  borderColor: string
  textColor: string
  classNames: string[]
}

// Modern color palette
const MODERN_COLORS = {
  fob: {
    primary: '#3B82F6',
    bg: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
    light: '#EFF6FF',
    text: '#FFFFFF',
  },
  cif: {
    primary: '#F59E0B',
    bg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    light: '#FEF3C7',
    text: '#FFFFFF',
  },
  tng: {
    primary: '#8B5CF6',
    bg: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
    light: '#EDE9FE',
    text: '#FFFFFF',
  },
  nd: {
    primary: '#EC4899',
    bg: 'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)',
    light: '#FCE7F3',
    text: '#FFFFFF',
  },
  overdue: {
    primary: '#EF4444',
    bg: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
    light: '#FEE2E2',
    text: '#FFFFFF',
  },
  tba: {
    fob: { bg: '#DBEAFE', border: '#3B82F6', text: '#1E40AF' },
    cif: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  },
}

export default function CalendarPage() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()

  // Data state
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([])
  const [cargos, setCargos] = useState<Cargo[]>([])
  const [loading, setLoading] = useState(true)

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week'>(isMobile ? 'week' : 'month')
  const [calendarApi, setCalendarApi] = useState<any>(null)

  // Filter state
  const [selectedCustomers] = useState<number[]>([])
  const [filterFOB, setFilterFOB] = useState(true)
  const [filterCIF, setFilterCIF] = useState(true)
  const [filterTNG, setFilterTNG] = useState(true)
  const [filterND, setFilterND] = useState(true)
  const [showTBA, setShowTBA] = useState(true)
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)

  // Filter popover
  const [filterAnchor, setFilterAnchor] = useState<HTMLButtonElement | null>(null)

  // Popup state
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [popupOpen, setPopupOpen] = useState(false)

  // Load data
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [contractsRes, customersRes, cargosRes, monthlyPlansRes] = await Promise.all([
        contractAPI.getAll(),
        customerAPI.getAll(),
        cargoAPI.getAll(),
        monthlyPlanAPI.getAll(),
      ])

      setContracts(contractsRes.data || [])
      setCustomers(customersRes.data || [])
      setCargos(cargosRes.data || [])
      setMonthlyPlans(monthlyPlansRes.data || [])
    } catch (error) {
      console.error('Error loading calendar data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get customer name by ID
  const getCustomerName = useCallback((customerId: number) => {
    const customer = customers.find(c => c.id === customerId)
    return customer?.name || 'Unknown'
  }, [customers])

  // Get contract by ID
  const getContract = useCallback((contractId: number) => {
    return contracts.find(c => c.id === contractId)
  }, [contracts])

  // Get product name for a monthly plan
  const getProductNameForMonthlyPlan = useCallback((monthlyPlan: MonthlyPlan): string => {
    return monthlyPlan.product_name || 'Unknown Product'
  }, [])

  // Selected event types based on filters
  const selectedEventTypes = useMemo(() => {
    const types: EventType[] = []
    if (filterFOB) types.push('fob_laycan')
    if (filterCIF) types.push('cif_loading')
    if (filterTNG) types.push('tng_due')
    if (filterND) types.push('nd_due')
    return types
  }, [filterFOB, filterCIF, filterTNG, filterND])

  const selectedContractTypes = useMemo(() => {
    const types: string[] = []
    if (filterFOB) types.push('FOB')
    if (filterCIF) types.push('CIF')
    return types
  }, [filterFOB, filterCIF])

  // Transform data into calendar events
  const calendarEvents = useMemo((): CalendarEvent[] => {
    const events: CalendarEvent[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Process cargos (have vessel assigned)
    cargos.forEach(cargo => {
      const contract = getContract(cargo.contract_id)
      if (!contract) return

      // Filter by contract type
      if (!selectedContractTypes.includes(contract.contract_type)) return

      // Filter by customer
      if (selectedCustomers.length > 0 && !selectedCustomers.includes(contract.customer_id)) return

      const customerName = getCustomerName(contract.customer_id)
      const laycanStr = cargo.laycan_window

      if (!laycanStr) return

      // Find the monthly plan for this cargo
      const monthlyPlan = monthlyPlans.find(mp => mp.id === cargo.monthly_plan_id)
      const month = monthlyPlan?.month || new Date().getMonth() + 1
      const year = monthlyPlan?.year || new Date().getFullYear()

      // Parse laycan date
      const parsed = parseLaycanDate(laycanStr, month, year)
      if (!parsed.isValid || !parsed.startDate || !parsed.endDate) return

      const isOverdue = parsed.endDate < today && cargo.status !== 'Completed Loading' && cargo.status !== 'Discharge Complete'

      // Filter by overdue
      if (showOverdueOnly && !isOverdue) return

      const eventType: EventType = contract.contract_type === 'FOB' ? 'fob_laycan' : 'cif_loading'

      // Filter by event type
      if (!selectedEventTypes.includes(eventType)) return

      const colors = isOverdue
        ? MODERN_COLORS.overdue
        : (contract.contract_type === 'FOB' ? MODERN_COLORS.fob : MODERN_COLORS.cif)

      // Use only the first day of the laycan/loading window
      const eventStart = parsed.startDate

      events.push({
        id: `cargo-${cargo.id}`,
        title: `${cargo.vessel_name || 'TBA'} - ${cargo.product_name}`,
        start: eventStart,
        allDay: true,
        extendedProps: {
          type: eventType,
          customerName,
          contractNumber: contract.contract_number,
          contractId: contract.id,
          productName: cargo.product_name,
          vesselName: cargo.vessel_name,
          quantity: cargo.cargo_quantity,
          status: cargo.status,
          cargoId: cargo.id,
          monthlyPlanId: cargo.monthly_plan_id,
          loadPort: cargo.load_ports,
          isOverdue,
          isTBA: false,
          contractType: contract.contract_type as 'FOB' | 'CIF',
          rawLaycan: laycanStr,
        },
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        textColor: colors.text,
        classNames: isOverdue ? ['modern-event', 'overdue-event'] : ['modern-event', `event-${eventType}`],
      })

      // Add TNG Due date for CIF contracts
      if (contract.contract_type === 'CIF' && contract.tng_lead_days && monthlyPlan) {
        const tngDueDate = new Date(parsed.startDate)
        tngDueDate.setDate(tngDueDate.getDate() - contract.tng_lead_days)

        const tngOverdue = tngDueDate < today && !monthlyPlan.tng_issued

        if (selectedEventTypes.includes('tng_due') && (!showOverdueOnly || tngOverdue)) {
          const tngColors = tngOverdue ? MODERN_COLORS.overdue : MODERN_COLORS.tng
          events.push({
            id: `tng-${cargo.id}`,
            title: `TNG: ${contract.contract_number}`,
            start: tngDueDate,
            allDay: true,
            extendedProps: {
              type: 'tng_due',
              customerName,
              contractNumber: contract.contract_number,
              contractId: contract.id,
              productName: cargo.product_name,
              vesselName: cargo.vessel_name,
              quantity: cargo.cargo_quantity,
              status: monthlyPlan.tng_issued ? 'Issued' : 'Pending',
              cargoId: cargo.id,
              monthlyPlanId: cargo.monthly_plan_id,
              loadPort: cargo.load_ports,
              isOverdue: tngOverdue,
              isTBA: false,
              contractType: 'CIF',
              rawLaycan: laycanStr,
            },
            backgroundColor: tngColors.primary,
            borderColor: tngColors.primary,
            textColor: tngColors.text,
            classNames: tngOverdue ? ['modern-event', 'overdue-event'] : ['modern-event', 'event-tng_due'],
          })
        }
      }

      // Add ND Due date for CIF in-road cargos
      if (contract.contract_type === 'CIF' && cargo.five_nd_date && !cargo.nd_completed) {
        const ndDueDate = new Date(cargo.five_nd_date)
        const ndOverdue = ndDueDate < today

        if (selectedEventTypes.includes('nd_due') && (!showOverdueOnly || ndOverdue)) {
          const ndColors = ndOverdue ? MODERN_COLORS.overdue : MODERN_COLORS.nd
          events.push({
            id: `nd-${cargo.id}`,
            title: `ND: ${contract.contract_number}`,
            start: ndDueDate,
            allDay: true,
            extendedProps: {
              type: 'nd_due',
              customerName,
              contractNumber: contract.contract_number,
              contractId: contract.id,
              productName: cargo.product_name,
              vesselName: cargo.vessel_name,
              quantity: cargo.cargo_quantity,
              status: 'Pending',
              cargoId: cargo.id,
              monthlyPlanId: cargo.monthly_plan_id,
              loadPort: cargo.load_ports,
              isOverdue: ndOverdue,
              isTBA: false,
              contractType: 'CIF',
              rawLaycan: laycanStr,
            },
            backgroundColor: ndColors.primary,
            borderColor: ndColors.primary,
            textColor: ndColors.text,
            classNames: ndOverdue ? ['modern-event', 'overdue-event'] : ['modern-event', 'event-nd_due'],
          })
        }
      }
    })

    // Process monthly plans without cargos (TBA) - only if they have dates set
    if (showTBA) {
      monthlyPlans.forEach(plan => {
        // Skip if this plan already has a cargo
        const hasCargo = cargos.some(c => c.monthly_plan_id === plan.id)
        if (hasCargo) return

        // All monthly plans should have contract_id set
        if (!plan.contract_id) return

        const contract = getContract(plan.contract_id)
        if (!contract) return

        // Filter by contract type
        if (!selectedContractTypes.includes(contract.contract_type)) return

        // Filter by customer
        if (selectedCustomers.length > 0 && !selectedCustomers.includes(contract.customer_id)) return

        const customerName = getCustomerName(contract.customer_id)

        // Get laycan from plan
        const laycanStr = contract.contract_type === 'CIF'
          ? plan.loading_window
          : plan.laycan_2_days

        // Only show TBA if they have actual dates set
        if (!laycanStr) return

        // Parse laycan date
        const parsed = parseLaycanDate(laycanStr, plan.month, plan.year)
        if (!parsed.isValid || !parsed.startDate || !parsed.endDate) return

        const isOverdue = parsed.endDate < today

        // Filter by overdue
        if (showOverdueOnly && !isOverdue) return

        const eventType: EventType = contract.contract_type === 'FOB' ? 'fob_laycan' : 'cif_loading'

        // Filter by event type
        if (!selectedEventTypes.includes(eventType)) return

        const tbaColors = contract.contract_type === 'FOB' ? MODERN_COLORS.tba.fob : MODERN_COLORS.tba.cif
        const productName = getProductNameForMonthlyPlan(plan)

        // Use only the first day of the laycan/loading window
        const eventStart = parsed.startDate

        events.push({
          id: `plan-${plan.id}`,
          title: `TBA - ${productName}`,
          start: eventStart,
          allDay: true,
          extendedProps: {
            type: eventType,
            customerName,
            contractNumber: contract.contract_number,
            contractId: contract.id,
            productName,
            vesselName: null,
            quantity: plan.month_quantity || 0,
            status: 'TBA',
            cargoId: null,
            monthlyPlanId: plan.id,
            loadPort: null,
            isOverdue,
            isTBA: true,
            contractType: contract.contract_type as 'FOB' | 'CIF',
            rawLaycan: laycanStr,
          },
          backgroundColor: tbaColors.bg,
          borderColor: tbaColors.border,
          textColor: tbaColors.text,
          classNames: ['modern-event', 'tba-event', `event-${eventType}`],
        })
      })
    }

    return events
  }, [cargos, monthlyPlans, contracts, customers, selectedCustomers, selectedContractTypes, selectedEventTypes, showTBA, showOverdueOnly, getCustomerName, getContract, getProductNameForMonthlyPlan])

  // Handle event click
  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = clickInfo.event
    const props = event.extendedProps as CalendarEvent['extendedProps']

    setSelectedEvent({
      id: event.id,
      title: event.title,
      start: event.start!,
      allDay: event.allDay,
      extendedProps: props,
      backgroundColor: event.backgroundColor,
      borderColor: event.borderColor,
      textColor: event.textColor,
      classNames: [],
    })
    setPopupOpen(true)
  }

  // Custom event content
  const renderEventContent = (eventContent: EventContentArg) => {
    const props = eventContent.event.extendedProps as CalendarEvent['extendedProps']

    return (
      <Box sx={{
        px: 1,
        py: 0.5,
        overflow: 'hidden',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        borderRadius: '6px',
      }}>
        {props.isOverdue && (
          <WarningAmber sx={{ fontSize: 14, flexShrink: 0 }} />
        )}
        {props.type === 'tng_due' && <Description sx={{ fontSize: 14, flexShrink: 0 }} />}
        {props.type === 'nd_due' && <Schedule sx={{ fontSize: 14, flexShrink: 0 }} />}
        {!props.isOverdue && props.type === 'fob_laycan' && <Anchor sx={{ fontSize: 14, flexShrink: 0 }} />}
        {!props.isOverdue && props.type === 'cif_loading' && <LocalShipping sx={{ fontSize: 14, flexShrink: 0 }} />}
        <Typography
          sx={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: '0.7rem',
            lineHeight: 1.4,
          }}
        >
          {eventContent.event.title}
        </Typography>
      </Box>
    )
  }

  // Handle edit cargo
  const handleEditCargo = () => {
    if (selectedEvent?.extendedProps.cargoId) {
      setPopupOpen(false)
      navigate('/')
    }
  }

  // Handle view contract
  const handleViewContract = () => {
    if (selectedEvent?.extendedProps.contractId) {
      navigate(`/contracts/${selectedEvent.extendedProps.contractId}/dashboard`)
      setPopupOpen(false)
    }
  }

  // Navigation handlers
  const handlePrev = () => {
    if (calendarApi) {
      calendarApi.prev()
      setCurrentDate(calendarApi.getDate())
    }
  }

  const handleNext = () => {
    if (calendarApi) {
      calendarApi.next()
      setCurrentDate(calendarApi.getDate())
    }
  }

  const handleToday = () => {
    if (calendarApi) {
      calendarApi.today()
      setCurrentDate(calendarApi.getDate())
    }
  }

  const handleViewChange = (_: React.MouseEvent<HTMLElement>, newView: 'month' | 'week' | null) => {
    if (newView && calendarApi) {
      setView(newView)
      calendarApi.changeView(newView === 'month' ? 'dayGridMonth' : 'dayGridWeek')
    }
  }

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (!filterFOB) count++
    if (!filterCIF) count++
    if (!filterTNG) count++
    if (!filterND) count++
    if (!showTBA) count++
    if (showOverdueOnly) count++
    if (selectedCustomers.length > 0) count++
    return count
  }, [filterFOB, filterCIF, filterTNG, filterND, showTBA, showOverdueOnly, selectedCustomers])

  // Count overdue events
  const overdueCount = useMemo(() => {
    return calendarEvents.filter(e => e.extendedProps.isOverdue).length
  }, [calendarEvents])

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        flexDirection: 'column',
        gap: 2,
      }}>
        <CircularProgress size={48} thickness={4} />
        <Typography color="text.secondary">Loading calendar...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Modern Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', md: 'center' },
        mb: 3,
        gap: 2,
      }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1E293B' }}>
            Calendar
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
            Track laycans, loading windows, and due dates
          </Typography>
        </Box>

        {/* Quick Stats */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Paper sx={{
            px: 2,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderRadius: 2,
            border: '1px solid',
            borderColor: '#E2E8F0',
          }}>
            <CalendarMonth sx={{ color: '#3B82F6' }} />
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B' }}>Events</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
                {calendarEvents.length}
              </Typography>
            </Box>
          </Paper>
          {overdueCount > 0 && (
            <Paper sx={{
              px: 2,
              py: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              borderRadius: 2,
              bgcolor: '#FEF2F2',
              border: '1px solid #FECACA',
            }}>
              <Warning sx={{ color: '#EF4444' }} />
              <Box>
                <Typography variant="caption" sx={{ color: '#DC2626' }}>Overdue</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1, color: '#DC2626' }}>
                  {overdueCount}
                </Typography>
              </Box>
            </Paper>
          )}
        </Box>
      </Box>

      {/* Control Bar */}
      <Paper sx={{
        mb: 2,
        p: 1.5,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: '#E2E8F0',
      }}>
        {/* Navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={handlePrev} size="small" sx={{ bgcolor: '#F1F5F9', '&:hover': { bgcolor: '#E2E8F0' } }}>
            <NavigateBefore />
          </IconButton>
          <Button
            onClick={handleToday}
            size="small"
            variant="outlined"
            startIcon={<Today />}
            sx={{ borderColor: '#E2E8F0', color: '#475569', '&:hover': { borderColor: '#CBD5E1', bgcolor: '#F8FAFC' } }}
          >
            Today
          </Button>
          <IconButton onClick={handleNext} size="small" sx={{ bgcolor: '#F1F5F9', '&:hover': { bgcolor: '#E2E8F0' } }}>
            <NavigateNext />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 600, ml: 1, color: '#1E293B', minWidth: 180 }}>
            {format(currentDate, 'MMMM yyyy')}
          </Typography>
        </Box>

        {/* View Toggle + Filters */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={handleViewChange}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                border: '1px solid #E2E8F0',
                '&.Mui-selected': {
                  bgcolor: '#3B82F6',
                  color: '#fff',
                  '&:hover': { bgcolor: '#2563EB' },
                },
              },
            }}
          >
            <ToggleButton value="month">
              <Tooltip title="Month View">
                <CalendarMonth fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="week">
              <Tooltip title="Week View">
                <ViewWeek fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>

          <Badge badgeContent={activeFilterCount} color="primary" invisible={activeFilterCount === 0}>
            <Button
              variant="outlined"
              startIcon={<FilterList />}
              onClick={(e) => setFilterAnchor(e.currentTarget)}
              sx={{
                borderColor: '#E2E8F0',
                color: '#475569',
                '&:hover': { borderColor: '#CBD5E1', bgcolor: '#F8FAFC' },
              }}
            >
              Filters
            </Button>
          </Badge>
        </Box>
      </Paper>

      {/* Legend */}
      <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {filterFOB && (
          <Chip
            icon={<Anchor sx={{ fontSize: 16 }} />}
            label="FOB Laycan"
            size="small"
            sx={{ bgcolor: MODERN_COLORS.fob.light, color: MODERN_COLORS.fob.primary, fontWeight: 500 }}
          />
        )}
        {filterCIF && (
          <Chip
            icon={<LocalShipping sx={{ fontSize: 16 }} />}
            label="CIF Loading"
            size="small"
            sx={{ bgcolor: MODERN_COLORS.cif.light, color: MODERN_COLORS.cif.primary, fontWeight: 500 }}
          />
        )}
        {filterTNG && (
          <Chip
            icon={<Description sx={{ fontSize: 16 }} />}
            label="TNG Due"
            size="small"
            sx={{ bgcolor: MODERN_COLORS.tng.light, color: MODERN_COLORS.tng.primary, fontWeight: 500 }}
          />
        )}
        {filterND && (
          <Chip
            icon={<Schedule sx={{ fontSize: 16 }} />}
            label="ND Due"
            size="small"
            sx={{ bgcolor: MODERN_COLORS.nd.light, color: MODERN_COLORS.nd.primary, fontWeight: 500 }}
          />
        )}
        {showTBA && (
          <Chip
            label="TBA"
            size="small"
            variant="outlined"
            sx={{ borderStyle: 'dashed', fontWeight: 500 }}
          />
        )}
      </Box>

      {/* Filter Popover */}
      <Popover
        open={Boolean(filterAnchor)}
        anchorEl={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: { p: 2, borderRadius: 2, minWidth: 280 }
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: '#1E293B' }}>
          Filter Events
        </Typography>

        <Stack spacing={1.5}>
          <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
            Event Types
          </Typography>

          <FormControlLabel
            control={<Switch checked={filterFOB} onChange={(e) => setFilterFOB(e.target.checked)} size="small" />}
            label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Anchor fontSize="small" sx={{ color: MODERN_COLORS.fob.primary }} /> FOB Laycans</Box>}
          />
          <FormControlLabel
            control={<Switch checked={filterCIF} onChange={(e) => setFilterCIF(e.target.checked)} size="small" />}
            label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><LocalShipping fontSize="small" sx={{ color: MODERN_COLORS.cif.primary }} /> CIF Loading</Box>}
          />
          <FormControlLabel
            control={<Switch checked={filterTNG} onChange={(e) => setFilterTNG(e.target.checked)} size="small" />}
            label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Description fontSize="small" sx={{ color: MODERN_COLORS.tng.primary }} /> TNG Due</Box>}
          />
          <FormControlLabel
            control={<Switch checked={filterND} onChange={(e) => setFilterND(e.target.checked)} size="small" />}
            label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Schedule fontSize="small" sx={{ color: MODERN_COLORS.nd.primary }} /> ND Due</Box>}
          />

          <Box sx={{ borderTop: '1px solid #E2E8F0', pt: 1.5, mt: 1 }}>
            <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
              Other Filters
            </Typography>
          </Box>

          <FormControlLabel
            control={<Switch checked={showTBA} onChange={(e) => setShowTBA(e.target.checked)} size="small" />}
            label="Show TBA (No Vessel)"
          />
          <FormControlLabel
            control={<Switch checked={showOverdueOnly} onChange={(e) => setShowOverdueOnly(e.target.checked)} size="small" color="error" />}
            label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning fontSize="small" sx={{ color: '#EF4444' }} /> Overdue Only</Box>}
          />
        </Stack>
      </Popover>

      {/* Calendar */}
      <Paper sx={{
        p: { xs: 1, sm: 2 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: '#E2E8F0',
        overflow: 'hidden',
      }}>
        <style>
          {`
            .fc {
              font-family: inherit;
            }
            .fc-theme-standard .fc-scrollgrid {
              border: none;
            }
            .fc-theme-standard td, .fc-theme-standard th {
              border-color: #E2E8F0;
            }
            .fc .fc-col-header-cell-cushion {
              padding: 12px 8px;
              font-weight: 600;
              color: #475569;
              text-transform: uppercase;
              font-size: 0.75rem;
              letter-spacing: 0.5px;
            }
            .fc .fc-daygrid-day-number {
              padding: 8px;
              font-weight: 500;
              color: #64748B;
            }
            .fc .fc-daygrid-day.fc-day-today {
              background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
            }
            .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
              color: #2563EB;
              font-weight: 700;
            }
            .fc-event.modern-event {
              border: none;
              border-radius: 6px;
              font-size: 0.75rem;
              padding: 2px 0;
              margin: 1px 2px;
              cursor: pointer;
              transition: all 0.2s ease;
              box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }
            .fc-event.modern-event:hover {
              transform: translateY(-1px);
              box-shadow: 0 4px 6px rgba(0,0,0,0.15);
            }
            .fc-event.tba-event {
              background: repeating-linear-gradient(
                45deg,
                transparent,
                transparent 5px,
                rgba(0,0,0,0.03) 5px,
                rgba(0,0,0,0.03) 10px
              );
              border: 2px dashed;
            }
            .fc-event.overdue-event {
              animation: pulse-glow 2s infinite;
            }
            @keyframes pulse-glow {
              0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
              50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
            }
            .fc-toolbar {
              display: none !important;
            }
            .fc-more-link {
              color: #3B82F6;
              font-weight: 600;
              font-size: 0.75rem;
            }
            .fc-daygrid-more-link {
              background: #EFF6FF;
              border-radius: 4px;
              padding: 2px 6px;
            }
            .fc-popover {
              border-radius: 8px;
              box-shadow: 0 10px 25px rgba(0,0,0,0.15);
              border: 1px solid #E2E8F0;
            }
            .fc-popover-header {
              background: #F8FAFC;
              padding: 8px 12px;
              font-weight: 600;
            }
            /* Mobile styles */
            @media (max-width: 600px) {
              .fc .fc-col-header-cell-cushion {
                padding: 6px 2px;
                font-size: 0.65rem;
              }
              .fc .fc-daygrid-day-number {
                padding: 4px;
                font-size: 0.75rem;
              }
              .fc-event.modern-event {
                font-size: 0.65rem;
                padding: 1px 0;
              }
            }
          `}
        </style>
        <FullCalendar
          ref={(el) => {
            if (el) setCalendarApi(el.getApi())
          }}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView={isMobile ? 'dayGridWeek' : 'dayGridMonth'}
          headerToolbar={false}
          events={calendarEvents}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          height="auto"
          dayMaxEvents={isMobile ? 3 : 4}
          moreLinkText={(num) => `+${num}`}
          weekends={true}
          fixedWeekCount={false}
          datesSet={(info) => setCurrentDate(info.view.currentStart)}
        />
      </Paper>

      {/* Modern Event Detail Modal */}
      <Dialog
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
          }
        }}
      >
        {selectedEvent && (
          <>
            {/* Header with gradient */}
            <Box sx={{
              background: selectedEvent.extendedProps.isOverdue
                ? MODERN_COLORS.overdue.bg
                : selectedEvent.extendedProps.type === 'fob_laycan'
                  ? MODERN_COLORS.fob.bg
                  : selectedEvent.extendedProps.type === 'cif_loading'
                    ? MODERN_COLORS.cif.bg
                    : selectedEvent.extendedProps.type === 'tng_due'
                      ? MODERN_COLORS.tng.bg
                      : MODERN_COLORS.nd.bg,
              color: '#fff',
              p: 3,
              position: 'relative',
            }}>
              <IconButton
                onClick={() => setPopupOpen(false)}
                size="small"
                sx={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  color: '#fff',
                  bgcolor: 'rgba(255,255,255,0.2)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                }}
              >
                <Close fontSize="small" />
              </IconButton>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                {selectedEvent.extendedProps.type === 'fob_laycan' && <Anchor sx={{ fontSize: 28 }} />}
                {selectedEvent.extendedProps.type === 'cif_loading' && <LocalShipping sx={{ fontSize: 28 }} />}
                {selectedEvent.extendedProps.type === 'tng_due' && <Description sx={{ fontSize: 28 }} />}
                {selectedEvent.extendedProps.type === 'nd_due' && <Schedule sx={{ fontSize: 28 }} />}
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {selectedEvent.extendedProps.vesselName || 'TBA'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {selectedEvent.extendedProps.isOverdue && (
                  <Chip
                    icon={<Warning sx={{ color: '#fff !important' }} />}
                    label="OVERDUE"
                    size="small"
                    sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 600 }}
                  />
                )}
                {selectedEvent.extendedProps.isTBA && (
                  <Chip
                    label="TBA"
                    size="small"
                    sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 600 }}
                  />
                )}
                <Chip
                  label={selectedEvent.extendedProps.contractType}
                  size="small"
                  sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 600 }}
                />
              </Box>
            </Box>

            <DialogContent sx={{ p: 0 }}>
              <Box sx={{ p: 3 }}>
                {/* Info Grid */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Person sx={{ color: '#64748B', mt: 0.5 }} />
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>Customer</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                        {selectedEvent.extendedProps.customerName}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Description sx={{ color: '#64748B', mt: 0.5 }} />
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>Contract</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                        {selectedEvent.extendedProps.contractNumber}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Inventory sx={{ color: '#64748B', mt: 0.5 }} />
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>Product</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                        {selectedEvent.extendedProps.productName}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <LocalShipping sx={{ color: '#64748B', mt: 0.5 }} />
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>Quantity</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                        {selectedEvent.extendedProps.quantity.toLocaleString()} KT
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <CalendarMonth sx={{ color: '#64748B', mt: 0.5 }} />
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>
                        {selectedEvent.extendedProps.contractType === 'CIF' ? 'Loading Window' : 'Laycan'}
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                        {selectedEvent.extendedProps.rawLaycan}
                      </Typography>
                    </Box>
                  </Box>

                  {selectedEvent.extendedProps.loadPort && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                      <Place sx={{ color: '#64748B', mt: 0.5 }} />
                      <Box>
                        <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>Load Port</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: '#1E293B' }}>
                          {selectedEvent.extendedProps.loadPort}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Box>

                {/* Status */}
                <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px solid #E2E8F0' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {selectedEvent.extendedProps.status === 'Completed Loading' || selectedEvent.extendedProps.status === 'Issued' ? (
                      <CheckCircle sx={{ color: '#10B981' }} />
                    ) : (
                      <Schedule sx={{ color: '#64748B' }} />
                    )}
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 500 }}>Status</Typography>
                      <Chip
                        label={selectedEvent.extendedProps.status}
                        size="small"
                        sx={{
                          ml: 1,
                          fontWeight: 600,
                          bgcolor:
                            selectedEvent.extendedProps.status === 'Completed Loading' || selectedEvent.extendedProps.status === 'Issued' ? '#D1FAE5' :
                            selectedEvent.extendedProps.status === 'Loading' ? '#DBEAFE' :
                            selectedEvent.extendedProps.status === 'TBA' ? '#F1F5F9' :
                            '#FEF3C7',
                          color:
                            selectedEvent.extendedProps.status === 'Completed Loading' || selectedEvent.extendedProps.status === 'Issued' ? '#065F46' :
                            selectedEvent.extendedProps.status === 'Loading' ? '#1E40AF' :
                            selectedEvent.extendedProps.status === 'TBA' ? '#475569' :
                            '#92400E',
                        }}
                      />
                    </Box>
                  </Box>
                </Box>

                {/* Actions */}
                <Box sx={{ display: 'flex', gap: 1.5, mt: 3 }}>
                  {selectedEvent.extendedProps.cargoId && (
                    <Button
                      variant="contained"
                      startIcon={<Edit />}
                      onClick={handleEditCargo}
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 600,
                        px: 2.5,
                      }}
                    >
                      Edit Cargo
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    startIcon={<Visibility />}
                    onClick={handleViewContract}
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 2.5,
                    }}
                  >
                    View Contract
                  </Button>
                </Box>
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  )
}
