import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import api from "@/api"
import useCustomToast from "@/hooks/useCustomToast"

const PER_PAGE = 5

export default function WorkspacesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get("page") || "1", 10)
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Add Modal
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState("")
  const [addDesc, setAddDesc] = useState("")
  const [addSubmitting, setAddSubmitting] = useState(false)

  // Invite Modal
  const [inviteWsId, setInviteWsId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteSubmitting, setInviteSubmitting] = useState(false)

  const fetchWorkspaces = () => {
    setLoading(true)
    api
      .get(
        `/api/v1/workspaces/?skip=${(page - 1) * PER_PAGE}&limit=${PER_PAGE}`,
      )
      .then((res) => {
        setWorkspaces(res.data.data || [])
        setCount(res.data.count || 0)
      })
      .catch(() => showErrorToast("Failed to load workspaces"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddSubmitting(true)
    try {
      await api.post("/api/v1/workspaces/", {
        name: addName,
        description: addDesc,
      })
      showSuccessToast("Workspace created.")
      setShowAdd(false)
      setAddName("")
      setAddDesc("")
      fetchWorkspaces()
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed")
    } finally {
      setAddSubmitting(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteSubmitting(true)
    try {
      await api.post("/api/v1/invitations/", {
        email: inviteEmail,
        workspace_id: inviteWsId,
        role: "member",
      })
      showSuccessToast("Invitation sent.")
      setInviteWsId(null)
      setInviteEmail("")
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed")
    } finally {
      setInviteSubmitting(false)
    }
  }

  const totalPages = Math.ceil(count / PER_PAGE)

  return (
    <div>
      <h2 className="pt-3 pb-3">Workspaces Management</h2>
      <button className="btn btn-primary mb-3" onClick={() => setShowAdd(true)}>
        <i className="bi bi-plus" /> Add Workspace
      </button>

      {loading ? (
        <div className="text-center p-4">
          <div className="spinner-border" role="status" />
        </div>
      ) : workspaces.length === 0 ? (
        <div className="text-center p-5 text-secondary">
          <i className="bi bi-grid fs-1 d-block mb-2" />
          <h5>No workspaces yet</h5>
          <p>Create a workspace to get started</p>
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((ws: any) => (
                  <tr key={ws.id}>
                    <td>
                      <Link
                        to={`/workspaces/${ws.id}`}
                        className="fw-bold text-decoration-none"
                      >
                        {ws.name}
                      </Link>
                    </td>
                    <td className={ws.description ? "" : "text-secondary"}>
                      {ws.description || "N/A"}
                    </td>
                    <td>
                      <button
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => setInviteWsId(ws.id)}
                      >
                        <i className="bi bi-person-plus" /> Invite
                      </button>
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
      {showAdd && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleAdd}>
                <div className="modal-header">
                  <h5 className="modal-title">Add Workspace</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowAdd(false)}
                  />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
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
                    onClick={() => setShowAdd(false)}
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

      {/* Invite Modal */}
      {inviteWsId && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleInvite}>
                <div className="modal-header">
                  <h5 className="modal-title">Invite Member</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setInviteWsId(null)}
                  />
                </div>
                <div className="modal-body">
                  <p className="small text-secondary">
                    They will receive an email with a link to join.
                  </p>
                  <div className="mb-3">
                    <label className="form-label">Email *</label>
                    <input
                      type="email"
                      className="form-control"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setInviteWsId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={inviteSubmitting}
                  >
                    {inviteSubmitting ? "Sending..." : "Send Invitation"}
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
