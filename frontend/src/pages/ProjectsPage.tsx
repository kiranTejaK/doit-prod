import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import api from "@/api"
import useCustomToast from "@/hooks/useCustomToast"

const PER_PAGE = 5

export default function ProjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get("page") || "1", 10)
  const [projects, setProjects] = useState<any[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Add Project Modal
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState("")
  const [addDesc, setAddDesc] = useState("")
  const [addWsId, setAddWsId] = useState("")
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [workspaces, setWorkspaces] = useState<any[]>([])

  const fetchProjects = () => {
    setLoading(true)
    api
      .get(`/api/v1/projects/?skip=${(page - 1) * PER_PAGE}&limit=${PER_PAGE}`)
      .then((res) => {
        setProjects(res.data.data || [])
        setCount(res.data.count || 0)
      })
      .catch(() => showErrorToast("Failed to load projects"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const openAddModal = () => {
    setShowAdd(true)
    api
      .get("/api/v1/workspaces/?limit=100")
      .then((res) => setWorkspaces(res.data.data || []))
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddSubmitting(true)
    try {
      await api.post("/api/v1/projects/", {
        name: addName,
        description: addDesc,
        workspace_id: addWsId,
      })
      showSuccessToast("Project created.")
      setShowAdd(false)
      setAddName("")
      setAddDesc("")
      setAddWsId("")
      fetchProjects()
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed")
    } finally {
      setAddSubmitting(false)
    }
  }

  const totalPages = Math.ceil(count / PER_PAGE)

  return (
    <div>
      <h2 className="pt-3 pb-3">Projects Management</h2>
      <button className="btn btn-primary mb-3" onClick={openAddModal}>
        <i className="bi bi-plus" /> Add Project
      </button>

      {loading ? (
        <div className="text-center p-4">
          <div className="spinner-border" role="status" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center p-5 text-secondary">
          <i className="bi bi-grid fs-1 d-block mb-2" />
          <h5>No projects yet</h5>
          <p>Create a project to get started</p>
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Workspace</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        to={`/projects/${p.id}`}
                        className="fw-bold text-decoration-none"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className={p.description ? "" : "text-secondary"}>
                      {p.description || "N/A"}
                    </td>
                    <td>{p.workspace_name || p.workspace_id}</td>
                    <td className="text-truncate" style={{ maxWidth: "150px" }}>
                      {p.id}
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

      {/* Add Project Modal */}
      {showAdd && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleAdd}>
                <div className="modal-header">
                  <h5 className="modal-title">Add Project</h5>
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
                  <div className="mb-3">
                    <label className="form-label">Workspace *</label>
                    <select
                      className="form-select"
                      required
                      value={addWsId}
                      onChange={(e) => setAddWsId(e.target.value)}
                    >
                      <option value="">Select a workspace</option>
                      {workspaces.map((ws: any) => (
                        <option key={ws.id} value={ws.id}>
                          {ws.name}
                        </option>
                      ))}
                    </select>
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
    </div>
  )
}
