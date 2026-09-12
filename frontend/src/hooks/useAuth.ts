import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { isAxiosError } from "axios"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/api"

export interface User {
  id: string
  email: string
  is_active: boolean
  is_superuser: boolean
  full_name: string | null
  job_title: string | null
  avatar_url: string | null
}

const isLoggedIn = (): boolean => {
  return localStorage.getItem("access_token") !== null
}

const useAuth = () => {
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Fetch current user via TanStack Query
  const { data: user = null, isLoading } = useQuery<User | null>({
    queryKey: ["currentUser"],
    queryFn: async () => {
      if (!isLoggedIn()) return null
      const res = await api.get<User>("/api/v1/users/me")
      return res.data
    },
    enabled: isLoggedIn(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async ({
      username,
      password,
    }: {
      username: string
      password: string
    }) => {
      const formData = new URLSearchParams()
      formData.append("username", username)
      formData.append("password", password)
      const res = await api.post("/api/v1/login/access-token", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
      return res.data
    },
    onSuccess: async (data) => {
      localStorage.setItem("access_token", data.access_token)
      if (data.refresh_token) {
        localStorage.setItem("refresh_token", data.refresh_token)
      }
      await queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      navigate("/")
    },
    onError: (err: unknown) => {
      let detail = "Login failed"
      if (isAxiosError(err) && err.response?.data?.detail) {
        detail = String(err.response.data.detail)
      }
      setError(detail)
    },
  })

  // Sign up mutation
  const signUpMutation = useMutation({
    mutationFn: async (data: {
      email: string
      full_name: string
      password: string
    }) => {
      const res = await api.post("/api/v1/users/signup", data)
      return res.data
    },
    onSuccess: () => {
      navigate("/login")
    },
    onError: (err: unknown) => {
      let detail = "Sign up failed"
      if (isAxiosError(err) && err.response?.data?.detail) {
        detail = String(err.response.data.detail)
      }
      setError(detail)
    },
  })

  // Logout function
  const logout = async () => {
    const refreshToken = localStorage.getItem("refresh_token")
    if (refreshToken) {
      try {
        await api.post("/api/v1/login/logout", { refresh_token: refreshToken })
      } catch {
        // Ignore network/server errors during logout
      }
    }
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    queryClient.setQueryData(["currentUser"], null)
    await queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    navigate("/login")
  }

  const login = async (username: string, password: string) => {
    setError(null)
    return loginMutation.mutateAsync({ username, password })
  }

  const signUp = async (data: {
    email: string
    full_name: string
    password: string
  }) => {
    setError(null)
    return signUpMutation.mutateAsync(data)
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
