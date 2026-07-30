import {
  ArrowLeft,
  Briefcase,
  FolderKanban,
  Layers,
  MoreHorizontal,
  ShieldAlert,
  ShieldCheck,
  UserMinus,
  Users,
} from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import useAuth from "@/hooks/useAuth"
import {
  useRemoveWorkspaceMember,
  useUpdateWorkspaceMemberRole,
  useWorkspaceDetail,
} from "@/hooks/useWorkspaces"

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data, isLoading } = useWorkspaceDetail(workspaceId)
  const { user: currentUser } = useAuth()
  const updateRole = useUpdateWorkspaceMemberRole()
  const removeMember = useRemoveWorkspaceMember()
  const { toast } = useToast()

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    )
  }

  if (!data?.workspace) {
    return (
      <div className="py-12 text-center space-y-4 max-w-md mx-auto">
        <h2 className="text-xl font-bold text-foreground">
          Workspace not found
        </h2>
        <Button variant="outline" asChild>
          <Link to="/workspaces">
            <ArrowLeft size={16} /> Back to Workspaces
          </Link>
        </Button>
      </div>
    )
  }

  const { workspace, projects, members } = data

  const isOwnerOrSuperuser =
    Boolean(currentUser?.is_superuser) || currentUser?.id === workspace.owner_id

  const handleRoleChange = async (
    userId: string,
    newRole: "admin" | "member",
  ) => {
    if (!workspaceId) return
    try {
      await updateRole.mutateAsync({ workspaceId, userId, role: newRole })
      toast({
        title: "Role updated",
        description: `Member role successfully updated to ${newRole}.`,
        variant: "success",
      })
    } catch (err: any) {
      toast({
        title: "Error updating role",
        description:
          err.response?.data?.detail || "Failed to update member role.",
        variant: "destructive",
      })
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!workspaceId) return
    try {
      await removeMember.mutateAsync({ workspaceId, userId })
      toast({
        title: "Member removed",
        description: "Member was successfully removed from the workspace.",
        variant: "success",
      })
    } catch (err: any) {
      toast({
        title: "Error removing member",
        description: err.response?.data?.detail || "Failed to remove member.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Back button + Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground gap-1.5"
          asChild
        >
          <Link to="/workspaces">
            <ArrowLeft size={14} /> Workspaces
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Layers size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {workspace.name}
            </h1>
            {workspace.description && (
              <p className="text-sm text-muted-foreground">
                {workspace.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <FolderKanban size={18} className="text-primary" />
            Projects ({projects.length})
          </h2>
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed py-8 text-center">
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No projects in this workspace yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="group"
              >
                <Card className="h-full transition-all group-hover:border-primary/50 group-hover:shadow-md">
                  <CardContent className="p-5 flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <Briefcase size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {project.name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {project.description || "No description"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Members Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Users size={18} className="text-primary" />
          Members ({members.length})
        </h2>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  {isOwnerOrSuperuser && (
                    <th className="px-4 py-3 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isOwnerOrSuperuser ? 4 : 3}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      No members found.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => {
                    const isWorkspaceOwnerRow =
                      m.id === workspace.owner_id || m.role === "owner"

                    return (
                      <tr
                        key={m.id}
                        className="hover:bg-accent/40 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px]">
                                {(m.full_name || m.email)[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span>{m.full_name || "Member"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {m.email}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              m.role === "owner"
                                ? "default"
                                : m.role === "admin"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="capitalize text-[11px]"
                          >
                            {m.role}
                          </Badge>
                        </td>
                        {isOwnerOrSuperuser && (
                          <td className="px-4 py-3 text-right">
                            {isWorkspaceOwnerRow ? (
                              <span className="text-xs text-muted-foreground italic pr-2">
                                Owner
                              </span>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm">
                                    <MoreHorizontal size={16} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {m.role === "member" && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleRoleChange(m.id, "admin")
                                      }
                                    >
                                      <ShieldCheck
                                        size={14}
                                        className="mr-2 text-primary"
                                      />
                                      Promote to Admin
                                    </DropdownMenuItem>
                                  )}
                                  {m.role === "admin" && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleRoleChange(m.id, "member")
                                      }
                                    >
                                      <ShieldAlert
                                        size={14}
                                        className="mr-2 text-amber-500"
                                      />
                                      Demote to Member
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => handleRemoveMember(m.id)}
                                    className="text-red-600 dark:text-red-400 focus:text-red-600"
                                  >
                                    <UserMinus size={14} className="mr-2" />
                                    Remove from Workspace
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
