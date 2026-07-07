import axios from "axios"

// Central axios instance with auth token interceptor
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
})

// Attach Authorization header automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401/403, clear token and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && [401, 403].includes(error.response.status)) {
      localStorage.removeItem("access_token")
      window.location.href = "/login"
    }
    return Promise.reject(error)
  },
)

export default api
