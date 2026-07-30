import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@/api"

export interface Project {
  id: string
  name: string
  description?: string
  workspace_id: string
  workspace_name?: string
  created_at: string
}

export function useProjects(params?: { skip?: number; limit?: number }) {
  const skip = params?.skip ?? 0
  const limit = params?.limit ?? 100

  return useQuery({
    queryKey: ["projects", { skip, limit }],
    queryFn: async () => {
      const res = await api.get(`/api/v1/projects/?skip=${skip}&limit=${limit}`)
      return {
        projects: (res.data.data || []) as Project[],
        count: (res.data.count || 0) as number,
      }
    },
  })
}

export function useProjectDetail(projectId?: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const [projRes, taskRes] = await Promise.all([
        api.get(`/api/v1/projects/${projectId}`),
        api.get(`/api/v1/tasks/?project_id=${projectId}&limit=1000`),
      ])

      return {
        project: projRes.data as Project,
        tasks: (taskRes.data.data || []) as any[],
      }
    },
    enabled: Boolean(projectId),
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      name: string
      description?: string
      workspace_id: string
    }) => {
      const res = await api.post("/api/v1/projects/", data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["workspace"] })
    },
  })
}
