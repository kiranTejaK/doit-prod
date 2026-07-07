import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import api from "@/api"
import useCustomToast from "@/hooks/useCustomToast"

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Add Task Modal
  const [showAddTask, setShowAddTask] = useState(false)
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDesc, setTaskDesc] = useState("")
  const [taskStatus, setTaskStatus] = useState("todo")
  const [taskPriority, setTaskPriority] = useState("medium")
  const [taskSubmitting, setTaskSubmitting] = useState(false)

  // Members Modal
  const [showMembers, setShowMembers] = useState(false)
  const [members, setMembers] = useState<any[]>([])
  const [wsMembers, setWsMembers] = useState<any[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [addingMember, setAddingMember] = useState(false)

  // Task Detail Drawer
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState("")
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const fetchData = () => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      api.get(`/api/v1/projects/${projectId}`),
      api.get(`/api/v1/tasks/?project_id=${projectId}&limit=1000`),
    ])
      .then(([projRes, taskRes]) => {
        setProject(projRes.data)
        setTasks(taskRes.data.data || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    setTaskSubmitting(true)
    try {
      await api.post("/api/v1/tasks/", {
        title: taskTitle,
        description: taskDesc,
        project_id: projectId,
        status: taskStatus,
        priority: taskPriority,
      })
      showSuccessToast("Task created.")
      setShowAddTask(false)
      setTaskTitle("")
      setTaskDesc("")
      fetchData()
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed")
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await api.patch(`/api/v1/tasks/${taskId}`, { status: newStatus })
      fetchData()
    } catch {
      showErrorToast("Failed to update task status")
    }
  }

  const openMembers = () => {
    setShowMembers(true)
    api
      .get(`/api/v1/projects/${projectId}/members`)
      .then((res) => setMembers(res.data.data || res.data || []))
    if (project?.workspace_id) {
      api
        .get(`/api/v1/workspaces/${project.workspace_id}/members?limit=100`)
        .then((res) => setWsMembers(res.data.data || res.data || []))
    }
  }

  const handleAddMember = async () => {
    if (!selectedUserId) return
    setAddingMember(true)
    try {
      await api.post(`/api/v1/projects/${projectId}/members`, {
        user_id: selectedUserId,
        role: "member",
      })
      showSuccessToast("Member added.")
      setSelectedUserId("")
      api
        .get(`/api/v1/projects/${projectId}/members`)
        .then((res) => setMembers(res.data.data || res.data || []))
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed to add member")
    } finally {
      setAddingMember(false)
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
  if (!project) return <div className="p-4">Project not found.</div>

  // Group tasks by status for Kanban
  const columns = [
    { id: "todo", title: "Todo" },
    { id: "in_progress", title: "In Progress" },
    { id: "done", title: "Completed" },
    { id: "re_opened", title: "Re-opened" },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center pt-2 pb-3">
        <div className="d-flex align-items-center gap-3">
          <h2 className="mb-0">{project.name}</h2>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={openMembers}
          >
            <i className="bi bi-people" /> Members
          </button>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddTask(true)}
        >
          <i className="bi bi-plus" /> Add Task
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="p-4 text-center border rounded text-secondary">
          <p>No tasks in this project yet.</p>
          <button
            className="btn btn-primary"
            onClick={() => setShowAddTask(true)}
          >
            <i className="bi bi-plus" /> Add Task
          </button>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {columns.map((col) => {
            const colTasks = tasks.filter(
              (t) => (t.status || "todo") === col.id,
            )
            return (
              <div key={col.id} className="p-3 rounded border bg-body-tertiary">
                <div className="d-flex justify-content-between mb-2">
                  <h6 className="mb-0">
                    {col.title}{" "}
                    <span className="badge bg-secondary ms-1">
                      {colTasks.length}
                    </span>
                  </h6>
                </div>
                <div className="small text-secondary d-flex border-bottom pb-1 mb-2 gap-2">
                  <span style={{ flex: 2 }}>TASK NAME</span>
                  <span style={{ flex: 1 }}>PRIORITY</span>
                  <span style={{ flex: 1 }}>DUE DATE</span>
                  <span style={{ flex: 0.5 }}>ACTION</span>
                </div>
                {colTasks.length === 0 ? (
                  <div className="text-center text-secondary border border-dashed rounded p-2 small">
                    Empty
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <div
                      key={task.id}
                      className="d-flex align-items-center gap-2 border rounded p-2 mb-1 bg-body shadow-sm"
                      style={{ cursor: "pointer" }}
                      onClick={() => openTaskDetail(task)}
                    >
                      <div
                        style={{ flex: 2 }}
                        className="d-flex align-items-center gap-2"
                      >
                        <button
                          className={`btn btn-sm p-0 ${task.status === "done" ? "text-success" : "text-secondary"}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStatusChange(
                              task.id,
                              task.status === "done" ? "todo" : "done",
                            )
                          }}
                        >
                          <i
                            className={`bi ${task.status === "done" ? "bi-check-circle-fill" : "bi-circle"}`}
                          />
                        </button>
                        <span className="text-truncate fw-medium">
                          {task.title}
                        </span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <span
                          className={`badge ${task.priority === "high" ? "bg-danger" : task.priority === "medium" ? "bg-warning text-dark" : "bg-info"}`}
                        >
                          {task.priority || "none"}
                        </span>
                      </div>
                      <div style={{ flex: 1 }} className="small text-secondary">
                        {task.due_date
                          ? new Date(task.due_date).toLocaleDateString()
                          : "-"}
                      </div>
                      <div style={{ flex: 0.5 }}>
                        <select
                          className="form-select form-select-sm"
                          style={{ fontSize: "0.75rem" }}
                          value={task.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            handleStatusChange(task.id, e.target.value)
                          }
                        >
                          <option value="todo">Todo</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done">Done</option>
                          <option value="re_opened">Re-opened</option>
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTask && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleAddTask}>
                <div className="modal-header">
                  <h5 className="modal-title">Add Task</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowAddTask(false)}
                  />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Title *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <input
                      type="text"
                      className="form-control"
                      value={taskDesc}
                      onChange={(e) => setTaskDesc(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={taskStatus}
                      onChange={(e) => setTaskStatus(e.target.value)}
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
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value)}
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
                    onClick={() => setShowAddTask(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={taskSubmitting}
                  >
                    {taskSubmitting ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Members Modal */}
      {showMembers && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Project Members</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowMembers(false)}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-medium">Add Member</label>
                  <div className="d-flex gap-2">
                    <select
                      className="form-select"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                    >
                      <option value="">Select user...</option>
                      {wsMembers
                        .filter(
                          (wm: any) =>
                            !members.some((pm: any) => pm.id === wm.id),
                        )
                        .map((u: any) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.email}
                          </option>
                        ))}
                    </select>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!selectedUserId || addingMember}
                      onClick={handleAddMember}
                    >
                      Add
                    </button>
                  </div>
                </div>
                <label className="form-label fw-medium">
                  Current Members ({members.length})
                </label>
                <div className="list-group">
                  {members.map((m: any) => (
                    <div
                      key={m.id}
                      className="list-group-item d-flex justify-content-between align-items-center"
                    >
                      <span>{m.full_name || m.email}</span>
                      <small className="text-secondary">{m.role}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Offcanvas/Drawer */}
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
                    className={`badge ${selectedTask.status === "done" ? "bg-success" : selectedTask.status === "in_progress" ? "bg-primary" : "bg-secondary"}`}
                  >
                    {selectedTask.status?.replace("_", " ")}
                  </span>
                  <span
                    className={`badge ${selectedTask.priority === "high" ? "bg-danger" : "bg-warning text-dark"}`}
                  >
                    {selectedTask.priority || "No Priority"}
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
