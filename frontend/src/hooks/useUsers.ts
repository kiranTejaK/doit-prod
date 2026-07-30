import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@/api"

export interface User {
  id: string
  email: string
  full_name?: string
  is_superuser: boolean
  is_active: boolean
  job_title?: string
}

export function useUsers(params?: { skip?: number; limit?: number }) {
  const skip = params?.skip ?? 0
  const limit = params?.limit ?? 100

  return useQuery({
    queryKey: ["users", { skip, limit }],
    queryFn: async () => {
      const res = await api.get(`/api/v1/users/?skip=${skip}&limit=${limit}`)
      return {
        users: (res.data.data || []) as User[],
        count: (res.data.count || 0) as number,
      }
    },
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/api/v1/users/", data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const res = await api.patch(`/api/v1/users/${userId}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/api/v1/users/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })
}
