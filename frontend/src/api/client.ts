import axios from 'axios'

// Determine API base URL dynamically
// If VITE_API_URL is set, use it
// Otherwise, use relative URLs (which go through Vite proxy)
// This works for both localhost and network IP access
const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
  maxRedirects: 5,
})

// Add request interceptor for debugging
client.interceptors.request.use(
  (config) => {
    console.log('🚀 Axios Request:', config.method?.toUpperCase(), config.url, config.data)
    return config
  },
  (error) => {
    console.error('❌ Request Error:', error)
    return Promise.reject(error)
  }
)

// Add response interceptor for debugging
client.interceptors.response.use(
  (response) => {
    console.log('✅ Axios Response:', response.status, response.config.url, 'Data length:', response.data?.length || 'N/A')
    return response
  },
  (error) => {
    console.error('❌ Axios Error Response:', error.response?.status, error.config?.url)
    console.error('❌ Error message:', error.message)
    console.error('❌ Error code:', error.code)
    if (error.code === 'ERR_NETWORK') {
      console.error('❌ Network Error - Request could not be made. Check:')
      console.error('   1. Is the backend running on port 8000?')
      console.error('   2. Is the Vite proxy configured correctly?')
      console.error('   3. Try restarting the frontend dev server')
    }
    if (error.response) {
      console.error('❌ Error response data:', error.response.data)
    }
    if (error.request) {
      console.error('❌ Request was made but no response received:', error.request)
    }
    return Promise.reject(error)
  }
)

export default client

// Customer API
export const customerAPI = {
  getAll: () => client.get('/api/customers/'),
  getById: (id: number) => client.get(`/api/customers/${id}`),
  create: (data: any) => client.post('/api/customers/', data),
  update: (id: number, data: any) => client.put(`/api/customers/${id}`, data),
  delete: (id: number) => client.delete(`/api/customers/${id}`),
}

// Authority Top-Up type
export interface AuthorityTopUp {
  product_name: string
  quantity: number
  authority_reference: string
  reason?: string
  date?: string
}

// Contract API
export const contractAPI = {
  getAll: (customerId?: number) => {
    const params = customerId ? { customer_id: customerId } : {}
    return client.get('/api/contracts/', { params })
  },
  getById: (id: number) => client.get(`/api/contracts/${id}`),
  create: (data: any) => client.post('/api/contracts/', data),
  update: (id: number, data: any) => client.put(`/api/contracts/${id}`, data),
  delete: (id: number) => client.delete(`/api/contracts/${id}`),
  // Add authority top-up to a contract
  addAuthorityTopup: (contractId: number, topup: AuthorityTopUp) => 
    client.post(`/api/contracts/${contractId}/authority-topup`, topup),
}

// Quarterly Plan API
export const quarterlyPlanAPI = {
  getAll: (contractId?: number) => {
    const params = contractId ? { contract_id: contractId } : {}
    return client.get('/api/quarterly-plans/', { params })
  },
  getById: (id: number) => client.get(`/api/quarterly-plans/${id}`),
  create: (data: any) => client.post('/api/quarterly-plans/', data),
  update: (id: number, data: any) => client.put(`/api/quarterly-plans/${id}`, data),
  delete: (id: number) => client.delete(`/api/quarterly-plans/${id}`),
}

// Monthly Plan Authority Top-Up Request
export interface MonthlyPlanTopUpRequest {
  quantity: number
  authority_reference: string
  reason?: string
  authorization_date?: string
}

// Monthly Plan API
export const monthlyPlanAPI = {
  getAll: (quarterlyPlanId?: number) => {
    const params = quarterlyPlanId ? { quarterly_plan_id: quarterlyPlanId } : {}
    return client.get('/api/monthly-plans/', { params })
  },
  // Bulk endpoint - gets all monthly plans for given months/year with embedded contract/customer data
  // Replaces ~100+ API calls with a single call
  getBulk: (months: number[], year: number, includeZeroQuantity: boolean = false) => {
    return client.get('/api/monthly-plans/bulk', {
      params: {
        months: months.join(','),
        year,
        include_zero_quantity: includeZeroQuantity
      }
    })
  },
  getById: (id: number) => client.get(`/api/monthly-plans/${id}`),
  getStatus: (id: number) => client.get(`/api/monthly-plans/${id}/status`),
  create: (data: any) => client.post('/api/monthly-plans/', data),
  update: (id: number, data: any) => client.put(`/api/monthly-plans/${id}`, data),
  delete: (id: number) => client.delete(`/api/monthly-plans/${id}`),
  move: (id: number, data: { action: 'DEFER' | 'ADVANCE'; target_month: number; target_year: number; reason?: string }) =>
    client.put(`/api/monthly-plans/${id}/move`, data),
  // Add authority top-up to a specific monthly plan cargo
  addAuthorityTopup: (id: number, topup: MonthlyPlanTopUpRequest) =>
    client.post(`/api/monthly-plans/${id}/authority-topup`, topup),
}

// Cargo API
export const cargoAPI = {
  getAll: (params?: any) => client.get('/api/cargos/', { params }),
  getPortMovement: (month?: number, year?: number) => {
    const params: any = {}
    if (month) params.month = month
    if (year) params.year = year
    return client.get('/api/cargos/port-movement', { params })
  },
  getActiveLoadings: () => client.get('/api/cargos/active-loadings'),
  getPortOperations: (cargoId: number) => client.get(`/api/cargos/${cargoId}/port-operations`),
  upsertPortOperation: (cargoId: number, portCode: string, data: any) =>
    client.put(`/api/cargos/${cargoId}/port-operations/${portCode}`, data),
  getCompletedCargos: (month?: number, year?: number) => {
    const params: any = {}
    if (month) params.month = month
    if (year) params.year = year
    return client.get('/api/cargos/completed-cargos', { params })
  },
  getInRoadCIF: () => client.get('/api/cargos/in-road-cif'),
  getCompletedInRoadCIF: () => client.get('/api/cargos/completed-in-road-cif'),
  getById: (id: number) => client.get(`/api/cargos/${id}`),
  create: (data: any) => client.post('/api/cargos/', data),
  update: (id: number, data: any) => client.put(`/api/cargos/${id}`, data),
  delete: (id: number) => client.delete(`/api/cargos/${id}`),
  // Sync all cargos in a combi group with shared fields (status, vessel, load ports, etc.)
  syncCombiGroup: (combiGroupId: string, data: any) =>
    client.put(`/api/cargos/combi-group/${combiGroupId}/sync`, data),
}

// Audit Log API
export const auditLogAPI = {
  getCargoLogs: (params?: any) => client.get('/api/audit-logs/cargo', { params }),
  getMonthlyPlanLogs: (params?: any) => client.get('/api/audit-logs/monthly-plan', { params }),
  getQuarterlyPlanLogs: (params?: any) => client.get('/api/audit-logs/quarterly-plan', { params }),
  getReconciliationLogs: (params?: any) => client.get('/api/audit-logs/reconciliation', { params }),
  getWeeklyQuantityComparison: (params?: any) => client.get('/api/audit-logs/weekly-quantity-comparison', { params }),
}

// Documents API
export const documentsAPI = {
  generateNomination: (cargoId: number) => 
    client.get(`/api/documents/cargos/${cargoId}/nomination`, { 
      responseType: 'arraybuffer', // Use arraybuffer for better Safari compatibility
      headers: {
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    }),
}

