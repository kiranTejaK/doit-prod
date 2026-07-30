import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@/api"

export interface Workspace {
  id: string
  name: string
  description?: string
  owner_id: string
  created_at: string
}

export interface WorkspaceMember {
  id: string
  full_name?: string
  email: string
  role: string
}

export function useWorkspaces(params?: { skip?: number; limit?: number }) {
  const skip = params?.skip ?? 0
  const limit = params?.limit ?? 100

  return useQuery({
    queryKey: ["workspaces", { skip, limit }],
    queryFn: async () => {
      const res = await api.get(
        `/api/v1/workspaces/?skip=${skip}&limit=${limit}`,
      )
      return {
        workspaces: (res.data.data || []) as Workspace[],
        count: (res.data.count || 0) as number,
      }
    },
  })
}

export function useWorkspaceDetail(workspaceId?: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: async () => {
      const [wsRes, projRes, memRes] = await Promise.all([
        api.get(`/api/v1/workspaces/${workspaceId}`),
        api.get(`/api/v1/projects/?workspace_id=${workspaceId}&limit=100`),
        api
          .get(`/api/v1/workspaces/${workspaceId}/members`)
          .catch(() => ({ data: { data: [] } })),
      ])

      return {
        workspace: wsRes.data as Workspace,
        projects: (projRes.data.data || []) as any[],
        members: (memRes.data.data || memRes.data || []) as WorkspaceMember[],
      }
    },
    enabled: Boolean(workspaceId),
  })
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await api.post("/api/v1/workspaces/", data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    },
  })
}

export function useInviteMember() {
  return useMutation({
    mutationFn: async (data: {
      email: string
      workspace_id: string
      role?: string
    }) => {
      const res = await api.post("/api/v1/invitations/", {
        ...data,
        role: data.role || "member",
      })
      return res.data
    },
  })
}

export function useUpdateWorkspaceMemberRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      workspaceId: string
      userId: string
      role: "admin" | "member"
    }) => {
      const res = await api.put(
        `/api/v1/workspaces/${data.workspaceId}/members/${data.userId}`,
        {
          role: data.role,
        },
      )
      return res.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["workspace", variables.workspaceId],
      })
    },
  })
}

export function useRemoveWorkspaceMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { workspaceId: string; userId: string }) => {
      const res = await api.delete(
        `/api/v1/workspaces/${data.workspaceId}/members/${data.userId}`,
      )
      return res.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["workspace", variables.workspaceId],
      })
    },
  })
}
