import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, FolderKanban, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useCreateProject, useProjects } from "@/hooks/useProjects"
import { useWorkspaces } from "@/hooks/useWorkspaces"
import { useToast } from "@/hooks/use-toast"

const PER_PAGE = 5

export default function ProjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get("page") || "1", 10)
  const skip = (page - 1) * PER_PAGE

  const { data, isLoading } = useProjects({ skip, limit: PER_PAGE })
  const { data: wsData } = useWorkspaces({ limit: 100 })
  const createProject = useCreateProject()
  const { toast } = useToast()

  // Add Modal state
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState("")
  const [addDesc, setAddDesc] = useState("")
  const [addWsId, setAddWsId] = useState("")

  const projects = data?.projects || []
  const count = data?.count || 0
  const totalPages = Math.ceil(count / PER_PAGE)
  const workspaces = wsData?.workspaces || []

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addWsId) return
    try {
      await createProject.mutateAsync({
        name: addName,
        description: addDesc,
        workspace_id: addWsId,
      })
      toast({
        title: "Project created",
        description: `Project "${addName}" created successfully.`,
        variant: "success",
      })
      setShowAdd(false)
      setAddName("")
      setAddDesc("")
      setAddWsId("")
    } catch {
      toast({
        title: "Error",
        description: "Failed to create project.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Projects
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Organize tasks and track progress across workspaces.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus size={16} /> Add Project
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-1/3 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FolderKanban size={24} />
            </div>
            <h3 className="text-lg font-medium text-foreground">No projects yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Create a project inside a workspace to start assigning and tracking tasks.
            </p>
            <Button onClick={() => setShowAdd(true)} className="gap-2 mt-2">
              <Plus size={16} /> Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Table */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b border-border">
                  <tr>
                    <th className="px-4 py-3.5">Name</th>
                    <th className="px-4 py-3.5">Description</th>
                    <th className="px-4 py-3.5">Workspace</th>
                    <th className="px-4 py-3.5 text-right">Project ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projects.map((p) => (
                    <tr key={p.id} className="hover:bg-accent/40 transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-foreground">
                        <Link
                          to={`/projects/${p.id}`}
                          className="hover:text-primary transition-colors inline-flex items-center gap-2"
                        >
                          <FolderKanban size={16} className="text-muted-foreground" />
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {p.description || "No description"}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-foreground">
                        {p.workspace_name || p.workspace_id}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground">
                        {p.id.slice(0, 8)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
              <span>
                Showing {skip + 1}–{Math.min(skip + PER_PAGE, count)} of {count}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={page <= 1}
                  onClick={() => setSearchParams({ page: String(page - 1) })}
                >
                  <ChevronLeft size={14} />
                </Button>
                <span className="px-2 font-medium text-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={page >= totalPages}
                  onClick={() => setSearchParams({ page: String(page + 1) })}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Project Modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>Add Project</DialogTitle>
              <DialogDescription>
                Create a new project within an existing workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="proj-name">Project Name *</Label>
                <Input
                  id="proj-name"
                  required
                  placeholder="e.g. Website Redesign"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-desc">Description</Label>
                <Input
                  id="proj-desc"
                  placeholder="Optional description"
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-ws">Workspace *</Label>
                <select
                  id="proj-ws"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                  value={addWsId}
                  onChange={(e) => setAddWsId(e.target.value)}
                >
                  <option value="">Select a workspace...</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createProject.isPending}>
                {createProject.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  "Create Project"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
