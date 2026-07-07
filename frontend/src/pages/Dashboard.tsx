import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import api from "@/api"
import useAuth from "@/hooks/useAuth"

export default function Dashboard() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api
        .get("/api/v1/projects/?limit=100")
        .catch(() => ({ data: { data: [] } })),
      api
        .get(`/api/v1/tasks/?assignee_id=${user?.id}&limit=100`)
        .catch(() => ({ data: { data: [] } })),
    ])
      .then(([projRes, taskRes]) => {
        setProjects(projRes.data.data || [])
        setTasks(taskRes.data.data || [])
      })
      .finally(() => setLoading(false))
  }, [user?.id])

  if (loading) {
    return (
      <div className="d-flex justify-content-center p-5">
        <div className="spinner-border" role="status" />
      </div>
    )
  }

  const totalProjects = projects.length
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((t: any) => t.status === "done").length
  const pendingTasks = totalTasks - completedTasks
  const recentProjects = projects.slice(0, 3)
  const upcomingTasks = tasks
    .filter((t: any) => t.status !== "done")
    .slice(0, 5)

  return (
    <div>
      <div className="mb-4">
        <h2>Hi, {user?.full_name || user?.email?.split("@")[0]} 👋🏼</h2>
        <p className="text-secondary">Here's what's happening today.</p>
      </div>

      {/* Stats Cards */}
      <div className="row g-3 mb-4">
        {[
          {
            label: "Total Projects",
            value: totalProjects,
            icon: "bi-briefcase",
            color: "primary",
          },
          {
            label: "My Tasks",
            value: totalTasks,
            icon: "bi-list-task",
            color: "info",
          },
          {
            label: "Pending",
            value: pendingTasks,
            icon: "bi-clock",
            color: "warning",
          },
          {
            label: "Completed",
            value: completedTasks,
            icon: "bi-check-circle",
            color: "success",
          },
        ].map((stat) => (
          <div key={stat.label} className="col-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body d-flex align-items-center gap-3">
                <div
                  className={`rounded-circle bg-${stat.color} bg-opacity-10 p-3`}
                >
                  <i className={`bi ${stat.icon} fs-4 text-${stat.color}`} />
                </div>
                <div>
                  <small className="text-secondary">{stat.label}</small>
                  <h3 className="mb-0">{stat.value}</h3>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-4">
        {/* Recent Projects */}
        <div className="col-lg-6">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0">Recent Projects</h5>
            <Link to="/projects" className="text-decoration-none small fw-bold">
              View All
            </Link>
          </div>
          {recentProjects.length === 0 ? (
            <p className="text-secondary">No projects yet.</p>
          ) : (
            recentProjects.map((project: any) => (
              <div key={project.id} className="card mb-2 border shadow-sm">
                <div className="card-body d-flex justify-content-between align-items-center py-3">
                  <div>
                    <h6 className="mb-1">{project.name}</h6>
                    <small className="text-secondary">
                      {project.workspace_name || ""}
                    </small>
                  </div>
                  <i className="bi bi-briefcase text-secondary" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Upcoming Tasks */}
        <div className="col-lg-6">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0">Upcoming Tasks</h5>
            <Link to="/tasks" className="text-decoration-none small fw-bold">
              View All
            </Link>
          </div>
          <div className="card border shadow-sm">
            <div className="list-group list-group-flush">
              {upcomingTasks.length === 0 ? (
                <div className="list-group-item text-secondary">
                  No pending tasks.
                </div>
              ) : (
                upcomingTasks.map((task: any) => (
                  <div
                    key={task.id}
                    className="list-group-item d-flex align-items-center gap-3"
                  >
                    <i className="bi bi-circle text-secondary" />
                    <div className="flex-grow-1">
                      <div className="fw-medium text-truncate">
                        {task.title}
                      </div>
                      <small>
                        <span
                          className={`badge ${task.priority === "high" ? "bg-danger" : "bg-secondary"} me-1`}
                        >
                          {task.priority}
                        </span>
                        <span className="text-secondary">
                          {task.project_name || ""}
                        </span>
                      </small>
                    </div>
                    {task.due_date && (
                      <small className="text-secondary">
                        {new Date(task.due_date).toLocaleDateString()}
                      </small>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
