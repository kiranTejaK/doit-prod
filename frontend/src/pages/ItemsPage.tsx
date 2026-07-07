import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import api from "@/api"
import useCustomToast from "@/hooks/useCustomToast"

const PER_PAGE = 5

export default function ItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get("page") || "1", 10)
  const [items, setItems] = useState<any[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Add Modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addTitle, setAddTitle] = useState("")
  const [addDesc, setAddDesc] = useState("")
  const [addSubmitting, setAddSubmitting] = useState(false)

  // Edit Modal
  const [editItem, setEditItem] = useState<any>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [editSubmitting, setEditSubmitting] = useState(false)

  const fetchItems = () => {
    setLoading(true)
    api
      .get(`/api/v1/items/?skip=${(page - 1) * PER_PAGE}&limit=${PER_PAGE}`)
      .then((res) => {
        setItems(res.data.data || [])
        setCount(res.data.count || 0)
      })
      .catch(() => showErrorToast("Failed to load items"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddSubmitting(true)
    try {
      await api.post("/api/v1/items/", {
        title: addTitle,
        description: addDesc,
      })
      showSuccessToast("Item created successfully.")
      setShowAddModal(false)
      setAddTitle("")
      setAddDesc("")
      fetchItems()
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed")
    } finally {
      setAddSubmitting(false)
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
    setEditSubmitting(true)
    try {
      await api.patch(`/api/v1/items/${editItem.id}`, {
        title: editTitle,
        description: editDesc,
      })
      showSuccessToast("Item updated.")
      setEditItem(null)
      fetchItems()
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed")
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return
    try {
      await api.delete(`/api/v1/items/${id}`)
      showSuccessToast("Item deleted.")
      fetchItems()
    } catch {
      showErrorToast("Failed to delete item")
    }
  }

  const totalPages = Math.ceil(count / PER_PAGE)

  return (
    <div>
      <h2 className="pt-3 pb-3">Items Management</h2>
      <button
        className="btn btn-primary mb-3"
        onClick={() => setShowAddModal(true)}
      >
        <i className="bi bi-plus" /> Add Item
      </button>

      {loading ? (
        <div className="text-center p-4">
          <div className="spinner-border" role="status" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center p-5 text-secondary">
          <i className="bi bi-search fs-1 d-block mb-2" />
          <h5>You don't have any items yet</h5>
          <p>Add a new item to get started</p>
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id}>
                    <td className="text-truncate" style={{ maxWidth: "150px" }}>
                      {item.id}
                    </td>
                    <td className="text-truncate" style={{ maxWidth: "200px" }}>
                      {item.title}
                    </td>
                    <td
                      className={item.description ? "" : "text-secondary"}
                      style={{ maxWidth: "200px" }}
                    >
                      {item.description || "N/A"}
                    </td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button
                          className="btn btn-outline-primary"
                          onClick={() => openEdit(item)}
                        >
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          className="btn btn-outline-danger"
                          onClick={() => handleDelete(item.id)}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <nav className="d-flex justify-content-end">
              <ul className="pagination pagination-sm">
                <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                  <button
                    className="page-link"
                    onClick={() => setSearchParams({ page: String(page - 1) })}
                  >
                    Prev
                  </button>
                </li>
                {Array.from({ length: totalPages }, (_, i) => (
                  <li
                    key={i + 1}
                    className={`page-item ${page === i + 1 ? "active" : ""}`}
                  >
                    <button
                      className="page-link"
                      onClick={() => setSearchParams({ page: String(i + 1) })}
                    >
                      {i + 1}
                    </button>
                  </li>
                ))}
                <li
                  className={`page-item ${page >= totalPages ? "disabled" : ""}`}
                >
                  <button
                    className="page-link"
                    onClick={() => setSearchParams({ page: String(page + 1) })}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          )}
        </>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleAdd}>
                <div className="modal-header">
                  <h5 className="modal-title">Add Item</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowAddModal(false)}
                  />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Title *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={addTitle}
                      onChange={(e) => setAddTitle(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <input
                      type="text"
                      className="form-control"
                      value={addDesc}
                      onChange={(e) => setAddDesc(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={addSubmitting}
                  >
                    {addSubmitting ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleEdit}>
                <div className="modal-header">
                  <h5 className="modal-title">Edit Item</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setEditItem(null)}
                  />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Title *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditItem(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={editSubmitting}
                  >
                    {editSubmitting ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
