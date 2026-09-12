import axios, { type InternalAxiosRequestConfig } from "axios"

// Central axios instance with auth token interceptor and credential cookies
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  withCredentials: true,
})

// Attach Authorization header automatically
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("access_token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// --- Refresh token rotation single-flight queue ---
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

// On 401 (Unauthorized), attempt a single-flight token refresh before redirecting to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (!originalRequest) {
      return Promise.reject(error)
    }

    const requestUrl = originalRequest.url || ""
    const isAuthEndpoint =
      requestUrl.includes("/login/access-token") ||
      requestUrl.includes("/login/refresh-token") ||
      requestUrl.includes("/auth/refresh") ||
      requestUrl.includes("/login/logout") ||
      requestUrl.includes("/auth/logout")

    // Only attempt refresh on 401, not on auth endpoints themselves, and only once per request
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      const refreshToken = localStorage.getItem("refresh_token")

      // If no refresh token is stored in localStorage or available, redirect to login
      if (!refreshToken) {
        localStorage.removeItem("access_token")
        if (window.location.pathname !== "/login") {
          window.location.href = "/login"
        }
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // Another refresh is already in flight — queue this request until resolution
        return new Promise<string>((resolve, reject) => {
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
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000"
        // Use raw axios call with credentials to avoid interceptor recursion
        const { data } = await axios.post(
          `${baseUrl}/api/v1/login/refresh-token`,
          { refresh_token: refreshToken },
          { withCredentials: true },
        )

        const newAccessToken: string = data.access_token
        const newRefreshToken: string = data.refresh_token

        localStorage.setItem("access_token", newAccessToken)
        if (newRefreshToken) {
          localStorage.setItem("refresh_token", newRefreshToken)
        }

        api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`
        processQueue(null, newAccessToken)

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        // Refresh failed (e.g. expired, revoked, or reuse detected)
        processQueue(refreshError, null)
        localStorage.removeItem("access_token")
        localStorage.removeItem("refresh_token")

        if (window.location.pathname !== "/login") {
          window.location.href = "/login"
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

export default api
