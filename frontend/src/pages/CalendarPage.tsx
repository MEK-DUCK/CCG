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
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  OutlinedInput,
  CircularProgress,
  useMediaQuery,
  useTheme,
  Divider,
  IconButton,
} from '@mui/material'
import { Close, Edit, Visibility, Warning } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { contractAPI, customerAPI, monthlyPlanAPI, cargoAPI } from '../api/client'
import type { Contract, Customer, MonthlyPlan, Cargo } from '../types'
import { parseLaycanDate } from '../utils/laycanParser'

// Event types for the calendar
type EventType = 'fob_laycan' | 'cif_loading' | 'tng_due' | 'nd_due'

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
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

// Color scheme
const EVENT_COLORS = {
  fob_laycan: { bg: '#3B82F6', border: '#2563EB', text: '#FFFFFF' },
  cif_loading: { bg: '#8B5CF6', border: '#7C3AED', text: '#FFFFFF' },
  tng_due: { bg: '#F59E0B', border: '#D97706', text: '#FFFFFF' },
  nd_due: { bg: '#EF4444', border: '#DC2626', text: '#FFFFFF' },
}

const TBA_COLORS = {
  fob_laycan: { bg: '#93C5FD', border: '#3B82F6', text: '#1E40AF' },
  cif_loading: { bg: '#C4B5FD', border: '#8B5CF6', text: '#5B21B6' },
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

  // Filter state
  const [selectedCustomers, setSelectedCustomers] = useState<number[]>([])
  const [selectedContractTypes, setSelectedContractTypes] = useState<string[]>(['FOB', 'CIF'])
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>(['fob_laycan', 'cif_loading', 'tng_due', 'nd_due'])
  const [showTBA, setShowTBA] = useState(true)
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)

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
      const [contractsRes, customersRes, cargosRes] = await Promise.all([
        contractAPI.getAll(),
        customerAPI.getAll(),
        cargoAPI.getAll(),
      ])

      setContracts(contractsRes.data || [])
      setCustomers(customersRes.data || [])
      setCargos(cargosRes.data || [])

      // Load monthly plans for all contracts
      const allMonthlyPlans: MonthlyPlan[] = []
      for (const contract of contractsRes.data || []) {
        try {
          // Try to get monthly plans directly by contract_id (for SPOT/Range contracts)
          const directPlansRes = await monthlyPlanAPI.getByContractId(contract.id)
          if (directPlansRes.data && directPlansRes.data.length > 0) {
            allMonthlyPlans.push(...directPlansRes.data)
          }
        } catch (e) {
          // Ignore errors for contracts without direct monthly plans
        }
      }
      setMonthlyPlans(allMonthlyPlans)
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

      const colors = EVENT_COLORS[eventType]

      events.push({
        id: `cargo-${cargo.id}`,
        title: `${customerName} - ${contract.contract_number} - ${cargo.product_name}`,
        start: parsed.startDate,
        end: new Date(parsed.endDate.getTime() + 24 * 60 * 60 * 1000), // Add 1 day for inclusive end
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
        backgroundColor: isOverdue ? '#FEE2E2' : colors.bg,
        borderColor: isOverdue ? '#EF4444' : colors.border,
        textColor: isOverdue ? '#DC2626' : colors.text,
        classNames: isOverdue ? ['overdue-event'] : [],
      })

      // Add TNG Due date for CIF contracts
      if (contract.contract_type === 'CIF' && contract.tng_lead_days && monthlyPlan) {
        const tngDueDate = new Date(parsed.startDate)
        tngDueDate.setDate(tngDueDate.getDate() - contract.tng_lead_days)
        
        const tngOverdue = tngDueDate < today && !monthlyPlan.tng_issued

        if (selectedEventTypes.includes('tng_due') && (!showOverdueOnly || tngOverdue)) {
          events.push({
            id: `tng-${cargo.id}`,
            title: `TNG Due: ${contract.contract_number}`,
            start: tngDueDate,
            end: new Date(tngDueDate.getTime() + 24 * 60 * 60 * 1000),
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
            backgroundColor: tngOverdue ? '#FEE2E2' : EVENT_COLORS.tng_due.bg,
            borderColor: tngOverdue ? '#EF4444' : EVENT_COLORS.tng_due.border,
            textColor: tngOverdue ? '#DC2626' : EVENT_COLORS.tng_due.text,
            classNames: tngOverdue ? ['overdue-event'] : [],
          })
        }
      }

      // Add ND Due date for CIF in-road cargos
      if (contract.contract_type === 'CIF' && cargo.five_nd_date && !cargo.nd_completed) {
        const ndDueDate = new Date(cargo.five_nd_date)
        const ndOverdue = ndDueDate < today

        if (selectedEventTypes.includes('nd_due') && (!showOverdueOnly || ndOverdue)) {
          events.push({
            id: `nd-${cargo.id}`,
            title: `ND Due: ${contract.contract_number}`,
            start: ndDueDate,
            end: new Date(ndDueDate.getTime() + 24 * 60 * 60 * 1000),
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
            backgroundColor: ndOverdue ? '#FEE2E2' : EVENT_COLORS.nd_due.bg,
            borderColor: ndOverdue ? '#EF4444' : EVENT_COLORS.nd_due.border,
            textColor: ndOverdue ? '#DC2626' : EVENT_COLORS.nd_due.text,
            classNames: ndOverdue ? ['overdue-event'] : [],
          })
        }
      }
    })

    // Process monthly plans without cargos (TBA)
    if (showTBA) {
      monthlyPlans.forEach(plan => {
        // Skip if this plan already has a cargo
        const hasCargo = cargos.some(c => c.monthly_plan_id === plan.id)
        if (hasCargo) return

        const contract = getContract(plan.contract_id!)
        if (!contract) return

        // Filter by contract type
        if (!selectedContractTypes.includes(contract.contract_type)) return

        // Filter by customer
        if (selectedCustomers.length > 0 && !selectedCustomers.includes(contract.customer_id)) return

        const customerName = getCustomerName(contract.customer_id)
        
        // Get laycan from plan
        const laycanStr = contract.contract_type === 'CIF' 
          ? plan.loading_window 
          : (plan.laycan_5_days || plan.laycan_2_days)

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

        const colors = TBA_COLORS[eventType] || EVENT_COLORS[eventType]
        const productName = plan.product_name || 'Unknown Product'

        events.push({
          id: `plan-${plan.id}`,
          title: `${customerName} - ${contract.contract_number} - ${productName}`,
          start: parsed.startDate,
          end: new Date(parsed.endDate.getTime() + 24 * 60 * 60 * 1000),
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
          backgroundColor: isOverdue ? '#FEE2E2' : colors.bg,
          borderColor: isOverdue ? '#EF4444' : colors.border,
          textColor: isOverdue ? '#DC2626' : colors.text,
          classNames: isOverdue ? ['overdue-event', 'tba-event'] : ['tba-event'],
        })
      })
    }

    return events
  }, [cargos, monthlyPlans, contracts, customers, selectedCustomers, selectedContractTypes, selectedEventTypes, showTBA, showOverdueOnly, getCustomerName, getContract])

  // Handle event click
  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = clickInfo.event
    const props = event.extendedProps as CalendarEvent['extendedProps']
    
    setSelectedEvent({
      id: event.id,
      title: event.title,
      start: event.start!,
      end: event.end!,
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
    const isSmall = eventContent.view.type === 'dayGridMonth'

    return (
      <Box sx={{ 
        p: 0.5, 
        overflow: 'hidden',
        width: '100%',
        position: 'relative',
      }}>
        {props.isOverdue && (
          <Warning sx={{ 
            position: 'absolute', 
            top: 2, 
            right: 2, 
            fontSize: 12,
            color: '#DC2626',
          }} />
        )}
        <Typography 
          variant="caption" 
          sx={{ 
            fontWeight: 600, 
            display: 'block',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: isSmall ? '0.65rem' : '0.75rem',
          }}
        >
          {props.vesselName || 'TBA'}
        </Typography>
        {!isSmall && (
          <Typography 
            variant="caption" 
            sx={{ 
              display: 'block',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              opacity: 0.9,
              fontSize: '0.65rem',
            }}
          >
            {props.customerName} - {props.productName}
          </Typography>
        )}
      </Box>
    )
  }

  // Handle edit cargo
  const handleEditCargo = () => {
    if (selectedEvent?.extendedProps.cargoId) {
      // Navigate to home page and trigger edit
      // For now, just close popup - in future could use context/state
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        📅 Calendar
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          {/* Customer Filter */}
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Customers</InputLabel>
            <Select
              multiple
              value={selectedCustomers}
              onChange={(e) => setSelectedCustomers(e.target.value as number[])}
              input={<OutlinedInput label="Customers" />}
              renderValue={(selected) => 
                selected.length === 0 
                  ? 'All' 
                  : selected.map(id => getCustomerName(id)).join(', ')
              }
            >
              {customers.map(customer => (
                <MenuItem key={customer.id} value={customer.id}>
                  <Checkbox checked={selectedCustomers.includes(customer.id)} />
                  <ListItemText primary={customer.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Contract Type Filter */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Type</InputLabel>
            <Select
              multiple
              value={selectedContractTypes}
              onChange={(e) => setSelectedContractTypes(e.target.value as string[])}
              input={<OutlinedInput label="Type" />}
              renderValue={(selected) => selected.join(', ')}
            >
              <MenuItem value="FOB">
                <Checkbox checked={selectedContractTypes.includes('FOB')} />
                <ListItemText primary="FOB" />
              </MenuItem>
              <MenuItem value="CIF">
                <Checkbox checked={selectedContractTypes.includes('CIF')} />
                <ListItemText primary="CIF" />
              </MenuItem>
            </Select>
          </FormControl>

          {/* Event Type Filter */}
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Events</InputLabel>
            <Select
              multiple
              value={selectedEventTypes}
              onChange={(e) => setSelectedEventTypes(e.target.value as EventType[])}
              input={<OutlinedInput label="Events" />}
              renderValue={(selected) => {
                const labels: Record<EventType, string> = {
                  fob_laycan: 'Laycans',
                  cif_loading: 'Loading',
                  tng_due: 'TNG',
                  nd_due: 'ND',
                }
                return selected.map(s => labels[s]).join(', ')
              }}
            >
              <MenuItem value="fob_laycan">
                <Checkbox checked={selectedEventTypes.includes('fob_laycan')} />
                <ListItemText primary="FOB Laycans" />
              </MenuItem>
              <MenuItem value="cif_loading">
                <Checkbox checked={selectedEventTypes.includes('cif_loading')} />
                <ListItemText primary="CIF Loading Windows" />
              </MenuItem>
              <MenuItem value="tng_due">
                <Checkbox checked={selectedEventTypes.includes('tng_due')} />
                <ListItemText primary="TNG Due Dates" />
              </MenuItem>
              <MenuItem value="nd_due">
                <Checkbox checked={selectedEventTypes.includes('nd_due')} />
                <ListItemText primary="ND Due Dates" />
              </MenuItem>
            </Select>
          </FormControl>

          {/* TBA Toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox 
              checked={showTBA} 
              onChange={(e) => setShowTBA(e.target.checked)}
              size="small"
            />
            <Typography variant="body2">Show TBA</Typography>
          </Box>

          {/* Overdue Toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox 
              checked={showOverdueOnly} 
              onChange={(e) => setShowOverdueOnly(e.target.checked)}
              size="small"
            />
            <Typography variant="body2">Overdue Only</Typography>
          </Box>

          {/* Legend */}
          <Box sx={{ display: 'flex', gap: 1, ml: 'auto', flexWrap: 'wrap' }}>
            <Chip size="small" label="FOB Laycan" sx={{ bgcolor: EVENT_COLORS.fob_laycan.bg, color: 'white' }} />
            <Chip size="small" label="CIF Loading" sx={{ bgcolor: EVENT_COLORS.cif_loading.bg, color: 'white' }} />
            <Chip size="small" label="TNG Due" sx={{ bgcolor: EVENT_COLORS.tng_due.bg, color: 'white' }} />
            <Chip size="small" label="ND Due" sx={{ bgcolor: EVENT_COLORS.nd_due.bg, color: 'white' }} />
          </Box>
        </Box>
      </Paper>

      {/* Calendar */}
      <Paper sx={{ p: 2 }}>
        <style>
          {`
            .fc {
              font-family: inherit;
            }
            .fc-event {
              cursor: pointer;
              border-radius: 4px;
              font-size: 0.75rem;
            }
            .fc-event:hover {
              opacity: 0.9;
            }
            .overdue-event {
              animation: pulse 2s infinite;
            }
            .tba-event {
              border-style: dashed !important;
              opacity: 0.85;
            }
            @keyframes pulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
              50% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0); }
            }
            .fc-toolbar-title {
              font-size: 1.25rem !important;
              font-weight: 600 !important;
            }
            .fc-button {
              text-transform: capitalize !important;
            }
            .fc-day-today {
              background-color: rgba(59, 130, 246, 0.1) !important;
            }
          `}
        </style>
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView={isMobile ? 'dayGridWeek' : 'dayGridMonth'}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek',
          }}
          events={calendarEvents}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          height="auto"
          dayMaxEvents={isMobile ? 3 : 5}
          moreLinkText={(num) => `+${num} more`}
          weekends={true}
          fixedWeekCount={false}
        />
      </Paper>

      {/* Event Detail Popup */}
      <Dialog 
        open={popupOpen} 
        onClose={() => setPopupOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        {selectedEvent && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {selectedEvent.extendedProps.vesselName || 'TBA'}
                {selectedEvent.extendedProps.isOverdue && (
                  <Chip 
                    label="OVERDUE" 
                    size="small" 
                    sx={{ bgcolor: '#FEE2E2', color: '#DC2626', fontWeight: 600 }}
                  />
                )}
                {selectedEvent.extendedProps.isTBA && (
                  <Chip 
                    label="TBA" 
                    size="small" 
                    variant="outlined"
                    sx={{ borderStyle: 'dashed' }}
                  />
                )}
              </Box>
              <IconButton onClick={() => setPopupOpen(false)} size="small">
                <Close />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Customer</Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {selectedEvent.extendedProps.customerName}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">Contract</Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {selectedEvent.extendedProps.contractNumber}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 4 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Product</Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {selectedEvent.extendedProps.productName}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Quantity</Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {selectedEvent.extendedProps.quantity} KT
                    </Typography>
                  </Box>
                </Box>

                <Divider />

                <Box sx={{ display: 'flex', gap: 4 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {selectedEvent.extendedProps.contractType === 'CIF' ? 'Loading Window' : 'Laycan'}
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {selectedEvent.extendedProps.rawLaycan}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Type</Typography>
                    <Chip 
                      label={selectedEvent.extendedProps.contractType}
                      size="small"
                      color={selectedEvent.extendedProps.contractType === 'FOB' ? 'primary' : 'secondary'}
                    />
                  </Box>
                </Box>

                {selectedEvent.extendedProps.loadPort && (
                  <Box>
                    <Typography variant="body2" color="text.secondary">Load Port</Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {selectedEvent.extendedProps.loadPort}
                    </Typography>
                  </Box>
                )}

                <Box>
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <Chip 
                    label={selectedEvent.extendedProps.status}
                    size="small"
                    color={
                      selectedEvent.extendedProps.status === 'Completed Loading' ? 'success' :
                      selectedEvent.extendedProps.status === 'Loading' ? 'info' :
                      selectedEvent.extendedProps.status === 'TBA' ? 'default' :
                      'warning'
                    }
                  />
                </Box>
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              {selectedEvent.extendedProps.cargoId && (
                <Button
                  variant="contained"
                  startIcon={<Edit />}
                  onClick={handleEditCargo}
                >
                  Edit Cargo
                </Button>
              )}
              <Button
                variant="outlined"
                startIcon={<Visibility />}
                onClick={handleViewContract}
              >
                View Contract
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  )
}

