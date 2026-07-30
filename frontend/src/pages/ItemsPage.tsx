import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
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
  useCreateItem,
  useDeleteItem,
  useItems,
  useUpdateItem,
} from "@/hooks/useItems"

const PER_PAGE = 5

export default function ItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get("page") || "1", 10)
  const skip = (page - 1) * PER_PAGE

  const { data, isLoading } = useItems({ skip, limit: PER_PAGE })
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const { toast } = useToast()

  // Add Modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addTitle, setAddTitle] = useState("")
  const [addDesc, setAddDesc] = useState("")

  // Edit Modal
  const [editItem, setEditItem] = useState<any>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editDesc, setEditDesc] = useState("")

  const items = data?.items || []
  const count = data?.count || 0
  const totalPages = Math.ceil(count / PER_PAGE)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createItem.mutateAsync({
        title: addTitle,
        description: addDesc,
      })
      toast({
        title: "Item added",
        description: `Item "${addTitle}" created.`,
        variant: "success",
      })
      setShowAddModal(false)
      setAddTitle("")
      setAddDesc("")
    } catch {
      toast({
        title: "Error",
        description: "Failed to create item.",
        variant: "destructive",
      })
    }
  }

  const openEdit = (item: any) => {
    setEditItem(item)
    setEditTitle(item.title)
    setEditDesc(item.description || "")
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editItem) return
    try {
      await updateItem.mutateAsync({
        id: editItem.id,
        data: {
          title: editTitle,
          description: editDesc,
        },
      })
      toast({
        title: "Item updated",
        description: "Item details saved.",
        variant: "success",
      })
      setEditItem(null)
    } catch {
      toast({
        title: "Error",
        description: "Failed to update item.",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return
    try {
      await deleteItem.mutateAsync(id)
      toast({
        title: "Item deleted",
        description: "Item deleted successfully.",
        variant: "success",
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete item.",
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
            <Package className="text-primary" size={24} /> Items Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage custom data records and project items.
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="gap-2">
          <Plus size={16} /> Add Item
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Package size={24} />
            </div>
            <h3 className="text-lg font-medium text-foreground">
              No items found
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Create an item to keep track of your custom resources.
            </p>
            <Button
              onClick={() => setShowAddModal(true)}
              className="gap-2 mt-2"
            >
              <Plus size={16} /> Add Item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b border-border">
                  <tr>
                    <th className="px-4 py-3.5">ID</th>
                    <th className="px-4 py-3.5">Title</th>
                    <th className="px-4 py-3.5">Description</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-accent/40 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                        {item.id.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-foreground">
                        {item.title}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {item.description || "No description"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
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

      {/* Add Item Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>Add Item</DialogTitle>
              <DialogDescription>Create a new item entry.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="item-title">Title *</Label>
                <Input
                  id="item-title"
                  required
                  placeholder="Item title"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-desc">Description</Label>
                <Input
                  id="item-desc"
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
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createItem.isPending}>
                {createItem.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  "Create Item"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Item Modal */}
      <Dialog
        open={Boolean(editItem)}
        onOpenChange={(open) => !open && setEditItem(null)}
      >
        <DialogContent>
          <form onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle>Edit Item</DialogTitle>
              <DialogDescription>
                Update details for this item.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-title">Title *</Label>
                <Input
                  id="edit-title"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-desc">Description</Label>
                <Input
                  id="edit-desc"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditItem(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateItem.isPending}>
                {updateItem.isPending ? (
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
