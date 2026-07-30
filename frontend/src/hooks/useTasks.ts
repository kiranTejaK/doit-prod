import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@/api"

export interface Task {
  id: string
  title: string
  description?: string
  status: "todo" | "in_progress" | "review" | "done"
  priority: "low" | "medium" | "high" | "urgent"
  assignee_id: string
  assignee_name?: string
  assignee_avatar?: string
  project_id: string
  project_name?: string
  project_color?: string
  due_date?: string
  created_at: string
}

export interface TaskCreatePayload {
  title: string
  description?: string
  project_id: string
  assignee_id: string
  status?: string
  priority?: string
  due_date?: string
}

export interface TaskUpdatePayload {
  title?: string
  description?: string
  status?: string
  priority?: string
  assignee_id?: string
  due_date?: string
}

export function useTasks(params?: {
  assignee_id?: string
  project_id?: string
  limit?: number
}) {
  const { assignee_id, project_id, limit = 100 } = params || {}

  return useQuery({
    queryKey: ["tasks", { assignee_id, project_id, limit }],
    queryFn: async () => {
      let url = `/api/v1/tasks/?limit=${limit}`
      if (assignee_id) {
        url += `&assignee_id=${assignee_id}`
      }
      if (project_id) {
        url += `&project_id=${project_id}`
      }
      const res = await api.get(url)
      return (res.data.data || []) as Task[]
    },
    enabled: assignee_id !== undefined ? Boolean(assignee_id) : true,
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: TaskCreatePayload) => {
      const res = await api.post("/api/v1/tasks/", payload)
      return res.data as Task
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      if (data.project_id) {
        queryClient.invalidateQueries({
          queryKey: ["project", data.project_id],
        })
      }
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taskId,
      payload,
    }: {
      taskId: string
      payload: TaskUpdatePayload
    }) => {
      const res = await api.put(`/api/v1/tasks/${taskId}`, payload)
      return res.data as Task
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      if (data.project_id) {
        queryClient.invalidateQueries({
          queryKey: ["project", data.project_id],
        })
      }
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await api.delete(`/api/v1/tasks/${taskId}`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["project"] })
    },
  })
}
