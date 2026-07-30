import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Shield,
  Trash2,
  UserPlus,
} from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import useAuth from "@/hooks/useAuth"
import {
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
} from "@/hooks/useUsers"

const PER_PAGE = 5

export default function AdminPage() {
  const { user: currentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get("page") || "1", 10)
  const skip = (page - 1) * PER_PAGE

  const { data, isLoading } = useUsers({ skip, limit: PER_PAGE })
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const { toast } = useToast()

  // Add User Modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addEmail, setAddEmail] = useState("")
  const [addFullName, setAddFullName] = useState("")
  const [addPassword, setAddPassword] = useState("")
  const [addSuperuser, setAddSuperuser] = useState(false)

  // Edit User Modal
  const [editUser, setEditUser] = useState<any>(null)
  const [editEmail, setEditEmail] = useState("")
  const [editFullName, setEditFullName] = useState("")
  const [editSuperuser, setEditSuperuser] = useState(false)

  const users = data?.users || []
  const count = data?.count || 0
  const totalPages = Math.ceil(count / PER_PAGE)

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createUser.mutateAsync({
        email: addEmail,
        full_name: addFullName,
        password: addPassword,
        is_superuser: addSuperuser,
      })
      toast({
        title: "User created",
        description: `User ${addEmail} created successfully.`,
        variant: "success",
      })
      setShowAddModal(false)
      setAddEmail("")
      setAddFullName("")
      setAddPassword("")
      setAddSuperuser(false)
    } catch {
      toast({
        title: "Error",
        description: "Failed to create user.",
        variant: "destructive",
      })
    }
  }

  const openEditModal = (u: any) => {
    setEditUser(u)
    setEditEmail(u.email)
    setEditFullName(u.full_name || "")
    setEditSuperuser(u.is_superuser)
  }

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editUser) return
    try {
      await updateUser.mutateAsync({
        userId: editUser.id,
        data: {
          email: editEmail,
          full_name: editFullName,
          is_superuser: editSuperuser,
        },
      })
      toast({
        title: "User updated",
        description: "User details saved successfully.",
        variant: "success",
      })
      setEditUser(null)
    } catch {
      toast({
        title: "Error",
        description: "Failed to update user.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return
    try {
      await deleteUser.mutateAsync(userId)
      toast({
        title: "User deleted",
        description: "User account deleted successfully.",
        variant: "success",
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete user.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="text-primary" size={24} /> Users Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Admin portal to manage system accounts, roles, and permissions.
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="gap-2">
          <UserPlus size={16} /> Add User
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b border-border">
                  <tr>
                    <th className="px-4 py-3.5">Full Name</th>
                    <th className="px-4 py-3.5">Email</th>
                    <th className="px-4 py-3.5">Role</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-accent/40 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span>{u.full_name || "N/A"}</span>
                          {currentUser?.id === u.id && (
                            <Badge variant="info" className="text-[10px]">
                              You
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {u.email}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant={u.is_superuser ? "default" : "secondary"}
                          className="capitalize text-[11px]"
                        >
                          {u.is_superuser ? "Superuser" : "User"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant={u.is_active ? "success" : "muted"}
                          className="capitalize text-[11px]"
                        >
                          {u.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {currentUser?.id !== u.id && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEditModal(u)}
                            >
                              <Pencil size={15} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteUser(u.id)}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        )}
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

      {/* Add User Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <form onSubmit={handleAddUser}>
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
              <DialogDescription>
                Create a new user account on DOit.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="add-email">Email Address *</Label>
                <Input
                  id="add-email"
                  type="email"
                  required
                  placeholder="user@company.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-name">Full Name</Label>
                <Input
                  id="add-name"
                  placeholder="Alex Rivera"
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-pass">Password *</Label>
                <Input
                  id="add-pass"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input
                  id="add-super"
                  type="checkbox"
                  className="rounded border-input text-primary focus:ring-primary"
                  checked={addSuperuser}
                  onChange={(e) => setAddSuperuser(e.target.checked)}
                />
                <Label htmlFor="add-super" className="cursor-pointer">
                  Grant Superuser / Admin Privileges
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  "Create User"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog
        open={Boolean(editUser)}
        onOpenChange={(open) => !open && setEditUser(null)}
      >
        <DialogContent>
          <form onSubmit={handleEditUser}>
            <DialogHeader>
              <DialogTitle>Edit User Account</DialogTitle>
              <DialogDescription>
                Update details for {editUser?.email}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email Address *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Full Name</Label>
                <Input
                  id="edit-name"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input
                  id="edit-super"
                  type="checkbox"
                  className="rounded border-input text-primary focus:ring-primary"
                  checked={editSuperuser}
                  onChange={(e) => setEditSuperuser(e.target.checked)}
                />
                <Label htmlFor="edit-super" className="cursor-pointer">
                  Superuser Access
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditUser(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
