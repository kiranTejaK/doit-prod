import { useEffect, useState } from "react"
import api from "@/api"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

export default function TasksPage() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Add Task Modal
  const [showAdd, setShowAdd] = useState(false)
  const [projects, setProjects] = useState<any[]>([])
  const [addTitle, setAddTitle] = useState("")
  const [addDesc, setAddDesc] = useState("")
  const [addProjectId, setAddProjectId] = useState("")
  const [addStatus, setAddStatus] = useState("todo")
  const [addPriority, setAddPriority] = useState("medium")
  const [addSubmitting, setAddSubmitting] = useState(false)

  // Task Detail
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState("")
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const fetchTasks = () => {
    if (!user?.id) return
    setLoading(true)
    api
      .get(`/api/v1/tasks/?assignee_id=${user.id}&limit=100`)
      .then((res) => setTasks(res.data.data || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const handleToggleStatus = async (e: React.MouseEvent, task: any) => {
    e.stopPropagation()
    const newStatus = task.status === "done" ? "todo" : "done"
    try {
      await api.patch(`/api/v1/tasks/${task.id}`, { status: newStatus })
      fetchTasks()
    } catch {
      showErrorToast("Failed to update task")
    }
  }

  const openAddModal = () => {
    setShowAdd(true)
    api
      .get("/api/v1/projects/?limit=100")
      .then((res) => setProjects(res.data.data || []))
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddSubmitting(true)
    try {
      await api.post("/api/v1/tasks/", {
        title: addTitle,
        description: addDesc,
        project_id: addProjectId,
        status: addStatus,
        priority: addPriority,
      })
      showSuccessToast("Task created.")
      setShowAdd(false)
      setAddTitle("")
      setAddDesc("")
      fetchTasks()
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed")
    } finally {
      setAddSubmitting(false)
    }
  }

  const openTaskDetail = (task: any) => {
    setSelectedTask(task)
    setComments([])
    setCommentText("")
    api
      .get(`/api/v1/comments/?task_id=${task.id}`)
      .then((res) => setComments(res.data.data || []))
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setCommentSubmitting(true)
    try {
      await api.post("/api/v1/comments/", {
        content: commentText,
        task_id: selectedTask.id,
      })
      showSuccessToast("Comment added.")
      setCommentText("")
      api
        .get(`/api/v1/comments/?task_id=${selectedTask.id}`)
        .then((res) => setComments(res.data.data || []))
    } catch {
      showErrorToast("Failed to add comment")
    } finally {
      setCommentSubmitting(false)
    }
  }

  if (loading)
    return (
      <div className="text-center p-5">
        <div className="spinner-border" role="status" />
      </div>
    )
  if (error) return <div className="p-4 text-danger">Error loading tasks.</div>

  return (
    <div>
      <h2 className="pt-3 pb-3">My Tasks</h2>

      <div className="table-responsive border rounded">
        <table className="table table-striped table-hover mb-0">
          <thead>
            <tr>
              <th>Title</th>
              <th>Project</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-secondary py-4">
                  No tasks assigned to you yet.
                </td>
              </tr>
            ) : (
              tasks.map((task: any) => (
                <tr
                  key={task.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => openTaskDetail(task)}
                >
                  <td className="fw-medium">
                    <div className="d-flex align-items-center gap-2">
                      <button
                        className={`btn btn-sm p-0 ${task.status === "done" ? "text-success" : "text-secondary"}`}
                        onClick={(e) => handleToggleStatus(e, task)}
                      >
                        <i
                          className={`bi ${task.status === "done" ? "bi-check-circle-fill" : "bi-circle"}`}
                        />
                      </button>
                      <span
                        className="text-truncate"
                        style={{ maxWidth: "250px" }}
                      >
                        {task.title}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      {task.project_color && (
                        <span
                          className="rounded-circle"
                          style={{
                            width: 8,
                            height: 8,
                            backgroundColor: task.project_color,
                            display: "inline-block",
                          }}
                        />
                      )}
                      {task.project_name || "-"}
                    </div>
                  </td>
                  <td>
                    <span className="badge bg-secondary">{task.status}</span>
                  </td>
                  <td>
                    <span
                      className={`badge ${task.priority === "high" ? "bg-danger" : "bg-success"}`}
                    >
                      {task.priority}
                    </span>
                  </td>
                  <td>
                    {task.due_date
                      ? new Date(task.due_date).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <button className="btn btn-primary" onClick={openAddModal}>
          <i className="bi bi-plus" /> Add Task
        </button>
      </div>

      {/* Add Task Modal */}
      {showAdd && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleAdd}>
                <div className="modal-header">
                  <h5 className="modal-title">Add Task</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowAdd(false)}
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
                  <div className="mb-3">
                    <label className="form-label">Project *</label>
                    <select
                      className="form-select"
                      required
                      value={addProjectId}
                      onChange={(e) => setAddProjectId(e.target.value)}
                    >
                      <option value="">Select a project</option>
                      {projects.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={addStatus}
                      onChange={(e) => setAddStatus(e.target.value)}
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Priority</label>
                    <select
                      className="form-select"
                      value={addPriority}
                      onChange={(e) => setAddPriority(e.target.value)}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
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

      {/* Task Detail Offcanvas */}
      {selectedTask && (
        <>
          <div
            className="offcanvas offcanvas-end show"
            style={{ visibility: "visible", width: "450px", zIndex: 1055 }}
          >
            <div className="offcanvas-header">
              <div>
                <h5 className="offcanvas-title">{selectedTask.title}</h5>
                <div className="d-flex gap-2 mt-1">
                  <span
                    className={`badge ${selectedTask.status === "done" ? "bg-success" : "bg-secondary"}`}
                  >
                    {selectedTask.status?.replace("_", " ")}
                  </span>
                  <span
                    className={`badge ${selectedTask.priority === "high" ? "bg-danger" : "bg-warning text-dark"}`}
                  >
                    {selectedTask.priority}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setSelectedTask(null)}
              />
            </div>
            <div className="offcanvas-body">
              <div className="mb-3">
                <strong className="small">Description</strong>
                <p className={selectedTask.description ? "" : "text-secondary"}>
                  {selectedTask.description || "No description."}
                </p>
              </div>
              <hr />
              <div className="d-flex gap-4 mb-3">
                <div>
                  <small className="text-secondary fw-bold">ASSIGNEE</small>
                  <br />
                  <small>
                    {selectedTask.assignee_id ? "Assigned" : "Unassigned"}
                  </small>
                </div>
                <div>
                  <small className="text-secondary fw-bold">DUE DATE</small>
                  <br />
                  <small>
                    {selectedTask.due_date
                      ? new Date(selectedTask.due_date).toLocaleDateString()
                      : "No Due Date"}
                  </small>
                </div>
              </div>
              <hr />
              <strong className="small">
                <i className="bi bi-chat" /> Comments
              </strong>
              <div className="mt-2 mb-3">
                {comments.length === 0 ? (
                  <p className="small text-secondary fst-italic">
                    No comments yet.
                  </p>
                ) : (
                  comments.map((c: any) => (
                    <div
                      key={c.id}
                      className="border rounded p-2 mb-2 bg-body-tertiary"
                    >
                      <div className="d-flex justify-content-between mb-1">
                        <small className="fw-medium">
                          {c.user_full_name || "User"}
                        </small>
                        <small className="text-secondary">
                          {new Date(c.created_at).toLocaleString()}
                        </small>
                      </div>
                      <p
                        className="mb-0 small"
                        style={{ whiteSpace: "pre-wrap" }}
                      >
                        {c.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleAddComment}>
                <textarea
                  className="form-control mb-2"
                  rows={2}
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={commentSubmitting}
                >
                  {commentSubmitting ? "Posting..." : "Comment"}
                </button>
              </form>
            </div>
          </div>
          <div
            className="offcanvas-backdrop show"
            onClick={() => setSelectedTask(null)}
          />
        </>
      )}
    </div>
  )
}
