import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import api from "@/api"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

const PER_PAGE = 5

export default function AdminPage() {
  const { user: currentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get("page") || "1", 10)

  const [users, setUsers] = useState<any[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Add User Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addEmail, setAddEmail] = useState("")
  const [addFullName, setAddFullName] = useState("")
  const [addPassword, setAddPassword] = useState("")
  const [addSuperuser, setAddSuperuser] = useState(false)
  const [addSubmitting, setAddSubmitting] = useState(false)

  // Edit User Modal state
  const [editUser, setEditUser] = useState<any>(null)
  const [editEmail, setEditEmail] = useState("")
  const [editFullName, setEditFullName] = useState("")
  const [editSuperuser, setEditSuperuser] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const { showSuccessToast, showErrorToast } = useCustomToast()

  const fetchUsers = () => {
    setLoading(true)
    api
      .get(`/api/v1/users/?skip=${(page - 1) * PER_PAGE}&limit=${PER_PAGE}`)
      .then((res) => {
        setUsers(res.data.data || [])
        setCount(res.data.count || 0)
      })
      .catch(() => showErrorToast("Failed to load users"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddSubmitting(true)
    try {
      await api.post("/api/v1/users/", {
        email: addEmail,
        full_name: addFullName,
        password: addPassword,
        is_superuser: addSuperuser,
      })
      showSuccessToast("User created successfully.")
      setShowAddModal(false)
      setAddEmail("")
      setAddFullName("")
      setAddPassword("")
      setAddSuperuser(false)
      fetchUsers()
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed to create user")
    } finally {
      setAddSubmitting(false)
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
    setEditSubmitting(true)
    try {
      await api.patch(`/api/v1/users/${editUser.id}`, {
        email: editEmail,
        full_name: editFullName,
        is_superuser: editSuperuser,
      })
      showSuccessToast("User updated successfully.")
      setEditUser(null)
      fetchUsers()
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed to update user")
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return
    try {
      await api.delete(`/api/v1/users/${userId}`)
      showSuccessToast("User deleted successfully.")
      fetchUsers()
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed to delete user")
    }
  }

  const totalPages = Math.ceil(count / PER_PAGE)

  return (
    <div>
      <h2 className="pt-3 pb-3">Users Management</h2>

      <button
        className="btn btn-primary mb-3"
        onClick={() => setShowAddModal(true)}
      >
        <i className="bi bi-plus" /> Add User
      </button>

      {loading ? (
        <div className="text-center p-4">
          <div className="spinner-border" role="status" />
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Full name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      {u.full_name || (
                        <span className="text-secondary">N/A</span>
                      )}
                      {currentUser?.id === u.id && (
                        <span className="badge bg-info ms-1">You</span>
                      )}
                    </td>
                    <td className="text-truncate" style={{ maxWidth: "200px" }}>
                      {u.email}
                    </td>
                    <td>{u.is_superuser ? "Superuser" : "User"}</td>
                    <td>{u.is_active ? "Active" : "Inactive"}</td>
                    <td>
                      {currentUser?.id !== u.id && (
                        <div className="btn-group btn-group-sm">
                          <button
                            className="btn btn-outline-primary"
                            onClick={() => openEditModal(u)}
                          >
                            <i className="bi bi-pencil" />
                          </button>
                          <button
                            className="btn btn-outline-danger"
                            onClick={() => handleDeleteUser(u.id)}
                          >
                            <i className="bi bi-trash" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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

      {/* Add User Modal */}
      {showAddModal && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleAddUser}>
                <div className="modal-header">
                  <h5 className="modal-title">Add User</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowAddModal(false)}
                  />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Email *</label>
                    <input
                      type="email"
                      className="form-control"
                      required
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Full Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={addFullName}
                      onChange={(e) => setAddFullName(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Password *</label>
                    <input
                      type="password"
                      className="form-control"
                      required
                      minLength={8}
                      value={addPassword}
                      onChange={(e) => setAddPassword(e.target.value)}
                    />
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={addSuperuser}
                      onChange={(e) => setAddSuperuser(e.target.checked)}
                    />
                    <label className="form-check-label">Is Superuser</label>
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

      {/* Edit User Modal */}
      {editUser && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleEditUser}>
                <div className="modal-header">
                  <h5 className="modal-title">Edit User</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setEditUser(null)}
                  />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Email *</label>
                    <input
                      type="email"
                      className="form-control"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Full Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                    />
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={editSuperuser}
                      onChange={(e) => setEditSuperuser(e.target.checked)}
                    />
                    <label className="form-check-label">Is Superuser</label>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditUser(null)}
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
