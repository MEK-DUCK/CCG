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
// Note: User initials for audit logging are extracted from JWT token on the backend,
// NOT from a client header. This prevents spoofing.
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

// Track if we're currently refreshing the token to prevent multiple refresh attempts
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

// Add response interceptor for debugging and auth error handling
client.interceptors.response.use(
  (response) => {
    console.log('✅ Axios Response:', response.status, response.config.url, 'Data length:', response.data?.length || 'N/A')
    return response
  },
  async (error) => {
    const originalRequest = error.config
    
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
      
      // Handle 401 Unauthorized - try to refresh token first
      if (error.response.status === 401 && !originalRequest._retry) {
        const refreshToken = localStorage.getItem('oil_lifting_refresh_token')
        
        // If we have a refresh token and this isn't the refresh endpoint itself
        if (refreshToken && !originalRequest.url?.includes('/auth/refresh')) {
          if (isRefreshing) {
            // If already refreshing, queue this request
            return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject })
            }).then(token => {
              originalRequest.headers['Authorization'] = `Bearer ${token}`
              return client(originalRequest)
            }).catch(err => {
              return Promise.reject(err)
            })
          }
          
          originalRequest._retry = true
          isRefreshing = true
          
          try {
            console.log('🔄 Attempting token refresh...')
            const response = await client.post('/api/auth/refresh', {
              refresh_token: refreshToken
            })
            
            const { access_token, expires_in } = response.data
            
            // Update stored tokens
            localStorage.setItem('oil_lifting_token', access_token)
            const expiryTime = Date.now() + (expires_in || 900) * 1000
            localStorage.setItem('oil_lifting_token_expiry', expiryTime.toString())
            
            // Update auth header
            client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
            originalRequest.headers['Authorization'] = `Bearer ${access_token}`
            
            console.log('✅ Token refreshed successfully')
            processQueue(null, access_token)
            
            // Retry the original request
            return client(originalRequest)
          } catch (refreshError) {
            console.error('❌ Token refresh failed:', refreshError)
            processQueue(refreshError, null)
            
            // Refresh failed, clear auth and redirect to login
            localStorage.removeItem('oil_lifting_token')
            localStorage.removeItem('oil_lifting_refresh_token')
            localStorage.removeItem('oil_lifting_user')
            localStorage.removeItem('oil_lifting_token_expiry')
            delete client.defaults.headers.common['Authorization']
            
            if (!window.location.pathname.includes('/login')) {
              window.location.href = '/login?expired=true'
            }
            return Promise.reject(refreshError)
          } finally {
            isRefreshing = false
          }
        } else {
          // No refresh token or refresh endpoint failed
          console.warn('🔒 Authentication expired - clearing session')
          localStorage.removeItem('oil_lifting_token')
          localStorage.removeItem('oil_lifting_refresh_token')
          localStorage.removeItem('oil_lifting_user')
          localStorage.removeItem('oil_lifting_token_expiry')
          delete client.defaults.headers.common['Authorization']
          
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login?expired=true'
          }
        }
      }
      
      // Handle 429 Too Many Requests (rate limiting)
      if (error.response.status === 429) {
        const retryAfter = error.response.data?.retry_after || 60
        console.warn(`⏳ Rate limited. Retry after ${retryAfter} seconds.`)
        // Could show a toast notification here
      }
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
  getByContractId: (contractId: number) => {
    return client.get('/api/monthly-plans/', { params: { contract_id: contractId } })
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
  // Bulk status endpoint - gets status for multiple plans in one request (optimization)
  getStatusBulk: (planIds: number[]) => client.post('/api/monthly-plans/status/bulk', planIds),
  // Get CIF monthly plans for Tonnage Memo tracking
  getCifForTng: (months?: number[], year?: number) => {
    const params: any = {}
    if (months && months.length > 0) params.months = months.join(',')
    if (year) params.year = year
    return client.get('/api/monthly-plans/cif-tng', { params })
  },
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

// Version History API
export const versionHistoryAPI = {
  // Get version history for an entity
  getVersions: (entityType: string, entityId: number, limit?: number) =>
    client.get(`/api/versions/${entityType}/${entityId}`, { params: { limit } }),
  
  // Get specific version details
  getVersionDetail: (entityType: string, entityId: number, versionNumber: number) =>
    client.get(`/api/versions/${entityType}/${entityId}/${versionNumber}`),
  
  // Restore to a specific version
  restoreVersion: (entityType: string, entityId: number, versionNumber: number) =>
    client.post(`/api/versions/${entityType}/${entityId}/restore`, { version_number: versionNumber }),
}

// Recycle Bin API
export const recycleBinAPI = {
  // Get list of deleted entities
  getDeleted: (entityType?: string, includeRestored?: boolean, limit?: number) =>
    client.get('/api/recycle-bin', { 
      params: { 
        entity_type: entityType, 
        include_restored: includeRestored,
        limit 
      } 
    }),
  
  // Get details of a specific deleted entity
  getDeletedDetail: (deletedId: number) =>
    client.get(`/api/recycle-bin/${deletedId}`),
  
  // Restore a deleted entity
  restore: (deletedId: number) =>
    client.post(`/api/recycle-bin/${deletedId}/restore`),
  
  // Permanently delete (admin only)
  permanentDelete: (deletedId: number) =>
    client.delete(`/api/recycle-bin/${deletedId}`),
  
  // Cleanup expired entities (admin only)
  cleanup: () =>
    client.post('/api/recycle-bin/cleanup'),
}

