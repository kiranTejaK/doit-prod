import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/api"

const isLoggedIn = () => {
  return localStorage.getItem("access_token") !== null
}

const useAuth = () => {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // Fetch current user on mount if logged in
  useEffect(() => {
    if (!isLoggedIn()) {
      setIsLoading(false)
      return
    }
    let mounted = true
    api
      .get("/api/v1/users/me")
      .then((res) => {
        if (mounted) setUser(res.data)
      })
      .catch(() => {
        if (mounted) setError("Failed to load user")
      })
      .finally(() => {
        if (mounted) setIsLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const login = async (username: string, password: string) => {
    try {
      const formData = new URLSearchParams()
      formData.append("username", username)
      formData.append("password", password)
      const res = await api.post("/api/v1/login/access-token", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
      localStorage.setItem("access_token", res.data.access_token)
      const userRes = await api.get("/api/v1/users/me")
      setUser(userRes.data)
      navigate("/")
    } catch (err: any) {
      const detail = err.response?.data?.detail || "Login failed"
      setError(typeof detail === "string" ? detail : "Login failed")
      throw err
    }
  }

  const signUp = async (data: {
    email: string
    full_name: string
    password: string
  }) => {
    try {
      await api.post("/api/v1/users/signup", data)
      navigate("/login")
    } catch (err: any) {
      const detail = err.response?.data?.detail || "Sign up failed"
      setError(typeof detail === "string" ? detail : "Sign up failed")
      throw err
    }
  }

  const logout = () => {
    localStorage.removeItem("access_token")
    setUser(null)
    navigate("/login")
  }

  return {
    login,
    signUp,
    logout,
    user,
    isLoading,
    error,
    resetError: () => setError(null),
  }
}

export { isLoggedIn }
export default useAuth
