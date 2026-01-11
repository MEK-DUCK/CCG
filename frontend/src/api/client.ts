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

// Add request interceptor for debugging and token management
// Note: User initials for audit logging are extracted from JWT token on the backend,
// NOT from a client header. This prevents spoofing.
client.interceptors.request.use(
  async (config) => {
    console.log('🚀 Axios Request:', config.method?.toUpperCase(), config.url, config.data)

    // Skip token handling for auth endpoints
    if (config.url?.includes('/auth/login') || config.url?.includes('/auth/refresh')) {
      return config
    }

    // Get a valid token (will refresh if needed)
    const token = await getValidToken()
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }

    return config
  },
  (error) => {
    console.error('❌ Request Error:', error)
    return Promise.reject(error)
  }
)

// Track if we're currently refreshing the token to prevent multiple refresh attempts
let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

// Check if token is expired or about to expire (within 30 seconds)
const isTokenExpired = (): boolean => {
  const expiryStr = localStorage.getItem('oil_lifting_token_expiry')
  if (!expiryStr) return true
  const expiry = parseInt(expiryStr, 10)
  return Date.now() > expiry - 30000 // 30 second buffer
}

// Refresh the token
const refreshToken = async (): Promise<string | null> => {
  const storedRefreshToken = localStorage.getItem('oil_lifting_refresh_token')
  if (!storedRefreshToken) return null

  try {
    console.log('🔄 Refreshing token...')
    // Use axios directly to avoid interceptors
    const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
      refresh_token: storedRefreshToken
    })

    const { access_token, expires_in } = response.data

    // Update stored tokens
    localStorage.setItem('oil_lifting_token', access_token)
    const expiryTime = Date.now() + (expires_in || 900) * 1000
    localStorage.setItem('oil_lifting_token_expiry', expiryTime.toString())

    // Update auth header on client
    client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

    console.log('✅ Token refreshed successfully')
    return access_token
  } catch (error) {
    console.error('❌ Token refresh failed:', error)
    // Clear auth on refresh failure
    localStorage.removeItem('oil_lifting_token')
    localStorage.removeItem('oil_lifting_refresh_token')
    localStorage.removeItem('oil_lifting_user')
    localStorage.removeItem('oil_lifting_token_expiry')
    delete client.defaults.headers.common['Authorization']
    return null
  }
}

// Get a valid token, refreshing if necessary
const getValidToken = async (): Promise<string | null> => {
  const token = localStorage.getItem('oil_lifting_token')

  if (!token) return null

  if (!isTokenExpired()) {
    return token
  }

  // Token is expired or expiring, need to refresh
  const refreshTokenStr = localStorage.getItem('oil_lifting_refresh_token')
  if (!refreshTokenStr) {
    // No refresh token available, use existing token and let server validate
    console.log('⚠️ No refresh token, using existing access token')
    return token
  }

  if (isRefreshing && refreshPromise) {
    // Already refreshing, wait for it
    const refreshedToken = await refreshPromise
    return refreshedToken || token // Fall back to existing token if refresh fails
  }

  isRefreshing = true
  refreshPromise = refreshToken().finally(() => {
    isRefreshing = false
    refreshPromise = null
  })

  const refreshedToken = await refreshPromise
  return refreshedToken || token // Fall back to existing token if refresh fails
}

// Add response interceptor for debugging and fallback auth error handling
client.interceptors.response.use(
  (response) => {
    console.log('✅ Axios Response:', response.status, response.config.url, 'Data length:', response.data?.length || 'N/A')
    return response
  },
  async (error) => {
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

      // Handle 401 Unauthorized - token refresh already attempted in request interceptor
      // This is a fallback for edge cases where refresh failed or wasn't possible
      if (error.response.status === 401 && !error.config?.url?.includes('/auth/')) {
        console.warn('🔒 Authentication failed - clearing session')
        localStorage.removeItem('oil_lifting_token')
        localStorage.removeItem('oil_lifting_refresh_token')
        localStorage.removeItem('oil_lifting_user')
        localStorage.removeItem('oil_lifting_token_expiry')
        delete client.defaults.headers.common['Authorization']

        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login?expired=true'
        }
      }

      // Handle 429 Too Many Requests (rate limiting)
      if (error.response.status === 429) {
        const retryAfter = error.response.data?.retry_after || 60
        console.warn(`⏳ Rate limited. Retry after ${retryAfter} seconds.`)
      }
    }

    if (error.request && !error.response) {
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
  // Get all authority amendments and top-ups
  getAllAuthorities: (contractId?: number, productName?: string) => {
    const params: any = {}
    if (contractId) params.contract_id = contractId
    if (productName) params.product_name = productName
    return client.get('/api/contracts/authorities/all', { params })
  },
  // Get contracts eligible for cross-contract combi with the specified contract
  getEligibleForCrossCombi: (contractId: number, month: number, year: number) =>
    client.get(`/api/contracts/eligible-for-cross-combi/${contractId}`, { params: { month, year } }),
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
  // Get adjustments (defer/advance history) for a quarterly plan
  getAdjustments: (planId: number) => client.get(`/api/quarterly-plans/${planId}/adjustments`),
  // Get all adjustments for a contract's quarterly plans
  getContractAdjustments: (contractId: number) => client.get(`/api/quarterly-plans/contract/${contractId}/adjustments`),
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
  move: (id: number, data: { action: 'DEFER' | 'ADVANCE'; target_month: number; target_year: number; reason?: string; authority_reference?: string }) =>
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
  // Cross-contract combi operations
  createCrossContractCombi: (data: any) => 
    client.post('/api/cargos/cross-contract-combi', data),
  deleteCombiGroup: (combiGroupId: string, params?: { permanent?: boolean; reason?: string; user_id?: number; user_initials?: string }) =>
    client.delete(`/api/cargos/combi-group/${combiGroupId}`, { params }),
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
  generateTng: (monthlyPlanId: number, format: 'docx' | 'pdf' = 'docx') =>
    client.get(`/api/documents/tng/${monthlyPlanId}`, {
      responseType: 'arraybuffer',
      params: { format },
      headers: {
        'Accept': format === 'pdf' 
          ? 'application/pdf' 
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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

