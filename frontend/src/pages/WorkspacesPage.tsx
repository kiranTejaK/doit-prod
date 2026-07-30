import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Plus,
  UserPlus,
} from "lucide-react"
import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
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
import { useToast } from "@/hooks/use-toast"
import {
  useCreateWorkspace,
  useInviteMember,
  useWorkspaces,
} from "@/hooks/useWorkspaces"

const PER_PAGE = 5

export default function WorkspacesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get("page") || "1", 10)
  const skip = (page - 1) * PER_PAGE

  const { data, isLoading } = useWorkspaces({ skip, limit: PER_PAGE })
  const createWorkspace = useCreateWorkspace()
  const inviteMember = useInviteMember()
  const { toast } = useToast()

  // Add Modal state
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState("")
  const [addDesc, setAddDesc] = useState("")

  // Invite Modal state
  const [inviteWsId, setInviteWsId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")

  const workspaces = data?.workspaces || []
  const count = data?.count || 0
  const totalPages = Math.ceil(count / PER_PAGE)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createWorkspace.mutateAsync({ name: addName, description: addDesc })
      toast({
        title: "Workspace created",
        description: `Workspace "${addName}" created successfully.`,
        variant: "success",
      })
      setShowAdd(false)
      setAddName("")
      setAddDesc("")
    } catch {
      toast({
        title: "Error",
        description: "Failed to create workspace.",
        variant: "destructive",
      })
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteWsId) return
    try {
      await inviteMember.mutateAsync({
        email: inviteEmail,
        workspace_id: inviteWsId,
      })
      toast({
        title: "Invitation sent",
        description: `Invitation sent to ${inviteEmail}.`,
        variant: "success",
      })
      setInviteWsId(null)
      setInviteEmail("")
    } catch {
      toast({
        title: "Error",
        description: "Failed to send invitation.",
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
            Workspaces
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your team environments and collaborators.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus size={16} /> Add Workspace
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
      ) : workspaces.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Layers size={24} />
            </div>
            <h3 className="text-lg font-medium text-foreground">
              No workspaces yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Create a workspace to organize your projects and invite team
              members.
            </p>
            <Button onClick={() => setShowAdd(true)} className="gap-2 mt-2">
              <Plus size={16} /> Create Workspace
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
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {workspaces.map((ws) => (
                    <tr
                      key={ws.id}
                      className="hover:bg-accent/40 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-semibold text-foreground">
                        <Link
                          to={`/workspaces/${ws.id}`}
                          className="hover:text-primary transition-colors inline-flex items-center gap-2"
                        >
                          <Layers size={16} className="text-muted-foreground" />
                          {ws.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {ws.description || "No description"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => setInviteWsId(ws.id)}
                        >
                          <UserPlus size={14} /> Invite
                        </Button>
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

      {/* Add Modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>Add Workspace</DialogTitle>
              <DialogDescription>
                Create a new space for your team&apos;s projects and tasks.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="ws-name">Workspace Name *</Label>
                <Input
                  id="ws-name"
                  required
                  placeholder="e.g. Engineering"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-desc">Description</Label>
                <Input
                  id="ws-desc"
                  placeholder="Optional description"
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createWorkspace.isPending}>
                {createWorkspace.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  "Create Workspace"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invite Modal */}
      <Dialog
        open={Boolean(inviteWsId)}
        onOpenChange={(open) => !open && setInviteWsId(null)}
      >
        <DialogContent>
          <form onSubmit={handleInvite}>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation email to join this workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email Address *</Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteWsId(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMember.isPending}>
                {inviteMember.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Sending...
                  </>
                ) : (
                  "Send Invitation"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
