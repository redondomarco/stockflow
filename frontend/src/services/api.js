import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_URL}/token/refresh/`, { refresh })
          localStorage.setItem('access_token', data.access)
          err.config.headers.Authorization = `Bearer ${data.access}`
          return api.request(err.config)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        }
      } else {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

// Auth
export const login = (username, password) =>
  api.post('/token/', { username, password })

// Products
export const productsApi = {
  list: (params) => api.get('/products/', { params }),
  get: (id) => api.get(`/products/${id}/`),
  create: (data) => api.post('/products/', data),
  update: (id, data) => api.patch(`/products/${id}/`, data),
  delete: (id) => api.delete(`/products/${id}/`),
  adjustStock: (id, data) => api.post(`/products/${id}/adjust_stock/`, data),
  movements: (id) => api.get(`/products/${id}/movements/`),
  lowStock: () => api.get('/products/low_stock/'),
  stats: () => api.get('/products/stats/'),
  categories: () => api.get('/products/categories/'),
  createCategory: (data) => api.post('/products/categories/', data),
  suppliers: () => api.get('/products/suppliers/'),
  createSupplier: (data) => api.post('/products/suppliers/', data),
  stockMovements: (params) => api.get('/products/movements/', { params }),
  exportProducts: () => api.get('/products/export_csv/', { responseType: 'blob' }),
  importProducts: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/products/import_csv/', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

// Price lists
export const priceListsApi = {
  list: () => api.get('/orders/price-lists/'),
  create: (data) => api.post('/orders/price-lists/', data),
  update: (id, data) => api.patch(`/orders/price-lists/${id}/`, data),
  delete: (id) => api.delete(`/orders/price-lists/${id}/`),
  exportCsv: () => api.get('/orders/price-lists/export_csv/', { responseType: 'blob' }),
  importCsv: (file, replace = false) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/orders/price-lists/import_csv/${replace ? '?replace=1' : ''}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// Orders
export const ordersApi = {
  list: (params) => api.get('/orders/', { params }),
  get: (id) => api.get(`/orders/${id}/`),
  create: (data) => api.post('/orders/', data),
  update: (id, data) => api.patch(`/orders/${id}/`, data),
  deliver: (id, data) => api.post(`/orders/${id}/deliver/`, data),
  changeStatus: (id, data) => api.post(`/orders/${id}/change_status/`, data),
  stats: () => api.get('/orders/stats/'),
  customers: (params) => api.get('/orders/customers/', { params }),
  createCustomer: (data) => api.post('/orders/customers/', data),
  updateCustomer: (id, data) => api.patch(`/orders/customers/${id}/`, data),
  getCustomerProducts: (id) => api.get(`/orders/customers/${id}/products/`),
  setCustomerProducts: (id, productIds) => api.post(`/orders/customers/${id}/products/`, { product_ids: productIds }),
  accountStatement: (customerId) => api.get(`/orders/customers/${customerId}/account_statement/`),
  debtDashboard: () => api.get('/orders/customers/debt_dashboard/'),
  exportCustomers: () => api.get('/orders/customers/export_csv/', { responseType: 'blob' }),
  importCustomers: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/orders/customers/import_csv/', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

// Users
export const usersApi = {
  list: () => api.get('/users/'),
  create: (data) => api.post('/users/', data),
  update: (id, data) => api.patch(`/users/${id}/`, data),
  delete: (id) => api.delete(`/users/${id}/`),
  exportCsv: () => api.get('/users/export_csv/', { responseType: 'blob' }),
  importCsv: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/users/import_csv/', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

// Delivery routes
export const routesApi = {
  list: () => api.get('/orders/routes/'),
  get: (id) => api.get(`/orders/routes/${id}/`),
  create: (data) => api.post('/orders/routes/', data),
  update: (id, data) => api.patch(`/orders/routes/${id}/`, data),
  delete: (id) => api.delete(`/orders/routes/${id}/`),
  availableOrders: () => api.get('/orders/routes/available_orders/'),
  changeStatus: (id, status) => api.post(`/orders/routes/${id}/change_status/`, { status }),
  addOrders: (id, items) => api.post(`/orders/routes/${id}/add_orders/`, { items }),
  removeItem: (id, itemId) => api.post(`/orders/routes/${id}/remove_item/`, { item_id: itemId }),
  updateItem: (id, itemId, data) => api.post(`/orders/routes/${id}/update_item/`, { item_id: itemId, ...data }),
}

// Payments
export const paymentsApi = {
  list: (params) => api.get('/payments/', { params }),
  create: (data) => api.post('/payments/', data),
  approve: (id, data) => api.post(`/payments/${id}/approve/`, data),
  reject: (id, data) => api.post(`/payments/${id}/reject/`, data),
  refund: (id) => api.post(`/payments/${id}/refund/`),
  stats: () => api.get('/payments/stats/'),
}

export default api
