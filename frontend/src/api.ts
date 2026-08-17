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

// --- Refresh token rotation logic ---
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value: string) => void
  reject: (reason: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token as string)
    }
  })
  failedQueue = []
}

// On 401 (Unauthorized), attempt a silent token refresh before redirecting to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Only attempt refresh on 401, and only once per request (_retry guard)
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem("refresh_token")

      // No refresh token available — redirect to login immediately
      if (!refreshToken) {
        localStorage.removeItem("access_token")
        window.location.href = "/login"
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // Another refresh is already in flight — queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        // Use a raw axios call (not `api`) to avoid triggering this interceptor again
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/v1/login/refresh-token`,
          { refresh_token: refreshToken },
        )

        const newAccessToken: string = data.access_token
        const newRefreshToken: string = data.refresh_token

        localStorage.setItem("access_token", newAccessToken)
        localStorage.setItem("refresh_token", newRefreshToken)

        api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`
        processQueue(null, newAccessToken)

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        // Refresh failed — clear all tokens and redirect to login
        processQueue(refreshError, null)
        localStorage.removeItem("access_token")
        localStorage.removeItem("refresh_token")
        window.location.href = "/login"
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

export default api
