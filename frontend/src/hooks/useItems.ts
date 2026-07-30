import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import api from "@/api"

export interface Item {
  id: string
  title: string
  description?: string
  owner_id: string
}

export function useItems(params?: { skip?: number; limit?: number }) {
  const skip = params?.skip ?? 0
  const limit = params?.limit ?? 100

  return useQuery({
    queryKey: ["items", { skip, limit }],
    queryFn: async () => {
      const res = await api.get(`/api/v1/items/?skip=${skip}&limit=${limit}`)
      return {
        items: (res.data.data || []) as Item[],
        count: (res.data.count || 0) as number,
      }
    },
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { title: string; description?: string }) => {
      const res = await api.post("/api/v1/items/", data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { title?: string; description?: string } }) => {
      const res = await api.patch(`/api/v1/items/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/items/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })
}
