import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import api from "@/api"

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [workspace, setWorkspace] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId) return
    Promise.all([
      api.get(`/api/v1/workspaces/${workspaceId}`),
      api.get(`/api/v1/projects/?workspace_id=${workspaceId}&limit=100`),
      api
        .get(`/api/v1/workspaces/${workspaceId}/members`)
        .catch(() => ({ data: { data: [] } })),
    ])
      .then(([wsRes, projRes, memRes]) => {
        setWorkspace(wsRes.data)
        setProjects(projRes.data.data || [])
        setMembers(memRes.data.data || memRes.data || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workspaceId])

  if (loading)
    return (
      <div className="text-center p-5">
        <div className="spinner-border" role="status" />
      </div>
    )
  if (!workspace) return <div className="p-4">Workspace not found.</div>

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center pt-3 pb-4">
        <div>
          <h2>{workspace.name}</h2>
          {workspace.description && (
            <p className="text-secondary">{workspace.description}</p>
          )}
        </div>
      </div>

      <h5 className="mb-3">Projects</h5>
      {projects.length === 0 ? (
        <div className="p-4 text-center border rounded border-dashed text-secondary mb-4">
          <p>No projects in this workspace yet.</p>
          <small>Create a project to get started.</small>
        </div>
      ) : (
        <div className="row g-3 mb-4">
          {projects.map((project: any) => (
            <div key={project.id} className="col-md-6 col-lg-4">
              <Link
                to={`/projects/${project.id}`}
                className="text-decoration-none"
              >
                <div
                  className="card border shadow-sm h-100"
                  style={{ transition: "all 0.2s" }}
                >
                  <div className="card-body">
                    <div className="d-flex align-items-center mb-2">
                      {project.color && (
                        <span
                          className="rounded-circle me-2"
                          style={{
                            width: 12,
                            height: 12,
                            backgroundColor: project.color,
                            display: "inline-block",
                          }}
                        />
                      )}
                      <h6 className="mb-0 text-truncate">{project.name}</h6>
                    </div>
                    <small className="text-secondary">
                      {project.description || "No description"}
                    </small>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      <h5 className="mb-3">Members</h5>
      <div className="table-responsive">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-secondary">
                  No members found.
                </td>
              </tr>
            ) : (
              members.map((m: any) => (
                <tr key={m.id}>
                  <td className="fw-medium">{m.full_name || "-"}</td>
                  <td className="text-secondary">{m.email}</td>
                  <td>
                    <span
                      className={`badge ${m.role === "owner" ? "bg-purple" : "bg-secondary"} text-uppercase`}
                      style={
                        m.role === "owner" ? { backgroundColor: "#7c3aed" } : {}
                      }
                    >
                      {m.role}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
