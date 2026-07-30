import { useState, useMemo } from "react"
import {
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Filter,
  FolderKanban,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserCheck,
  X,
} from "lucide-react"
import api from "@/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import useAuth from "@/hooks/useAuth"
import { useProjects } from "@/hooks/useProjects"
import {
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  Task,
} from "@/hooks/useTasks"
import { useToast } from "@/hooks/use-toast"

type SortField = "title" | "project_name" | "status" | "priority" | "due_date"
type SortOrder = "asc" | "desc"

export default function TasksPage() {
  const { user } = useAuth()
  const userId = user?.id
  const { data: tasks = [], isLoading, isError } = useTasks(
    userId ? { assignee_id: userId } : undefined,
  )
  const { data: projectsData } = useProjects()
  const { toast } = useToast()

  const createTaskMutation = useCreateTask()
  const updateTaskMutation = useUpdateTask()
  const deleteTaskMutation = useDeleteTask()

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")

  // Sorting State
  const [sortField, setSortField] = useState<SortField>("due_date")
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc")

  // Modal / Drawer State
  const [showAdd, setShowAdd] = useState(false)
  const [addTitle, setAddTitle] = useState("")
  const [addDesc, setAddDesc] = useState("")
  const [addProjectId, setAddProjectId] = useState("")
  const [addAssigneeId, setAddAssigneeId] = useState("")
  const [addStatus, setAddStatus] = useState("todo")
  const [addPriority, setAddPriority] = useState("medium")
  const [addDueDate, setAddDueDate] = useState("")

  // Project Members for selected project in Add modal
  const [projectMembers, setProjectMembers] = useState<any[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [validationError, setValidationError] = useState("")

  // Task Drawer & Comments
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState("")
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const projects = projectsData?.projects || []

  // Load project members when project is selected in Add Task Modal
  const handleProjectSelect = async (projId: string) => {
    setAddProjectId(projId)
    setAddAssigneeId("")
    setValidationError("")

    if (!projId) {
      setProjectMembers([])
      return
    }

    setLoadingMembers(true)
    try {
      const res = await api.get(`/api/v1/projects/${projId}/members`)
      const membersData = res.data.data || res.data || []
      setProjectMembers(membersData)

      // Default assignee to current user if member, otherwise first member
      const isUserMember = membersData.some((m: any) => m.id === userId)
      if (isUserMember && userId) {
        setAddAssigneeId(userId)
      } else if (membersData.length > 0) {
        setAddAssigneeId(membersData[0].id)
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to load project members.",
        variant: "destructive",
      })
    } finally {
      setLoadingMembers(false)
    }
  }

  // Handle Sort Toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  // Filtered & Sorted Tasks
  const processedTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        const matchesSearch =
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.project_name && t.project_name.toLowerCase().includes(searchQuery.toLowerCase()))

        const matchesStatus =
          statusFilter === "all" || t.status === statusFilter

        const matchesPriority =
          priorityFilter === "all" || t.priority === priorityFilter

        return matchesSearch && matchesStatus && matchesPriority
      })
      .sort((a, b) => {
        let valA = a[sortField] || ""
        let valB = b[sortField] || ""

        if (sortOrder === "desc") {
          return valA < valB ? 1 : valA > valB ? -1 : 0
        }
        return valA > valB ? 1 : valA < valB ? -1 : 0
      })
  }, [tasks, searchQuery, statusFilter, priorityFilter, sortField, sortOrder])

  // Summary Stats
  const stats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter((t) => t.status === "done").length
    const inProgress = tasks.filter((t) => t.status === "in_progress").length
    const urgent = tasks.filter((t) => t.priority === "urgent" || t.priority === "high").length
    return { total, completed, inProgress, urgent }
  }, [tasks])

  // Handle Status Toggle (Checkbox)
  const handleToggleStatus = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation()
    const newStatus = task.status === "done" ? "todo" : "done"
    try {
      await updateTaskMutation.mutateAsync({
        taskId: task.id,
        payload: { status: newStatus },
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      })
    }
  }

  // Handle Create Task Submit
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!addProjectId) {
      setValidationError("Please select a project.")
      return
    }
    if (!addAssigneeId) {
      setValidationError("Please assign this task to a project member.")
      return
    }

    setValidationError("")
    try {
      await createTaskMutation.mutateAsync({
        title: addTitle,
        description: addDesc || undefined,
        project_id: addProjectId,
        assignee_id: addAssigneeId,
        status: addStatus,
        priority: addPriority,
        due_date: addDueDate || undefined,
      })
      toast({
        title: "Task created",
        description: `Task "${addTitle}" created and assigned.`,
        variant: "success",
      })
      setShowAdd(false)
      setAddTitle("")
      setAddDesc("")
      setAddProjectId("")
      setAddAssigneeId("")
      setAddDueDate("")
    } catch (err: any) {
      setValidationError(err.response?.data?.detail || "Failed to create task")
    }
  }

  // Handle Delete Task
  const handleDeleteTask = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    try {
      await deleteTaskMutation.mutateAsync(taskId)
      toast({
        title: "Task deleted",
        description: "Task removed successfully.",
        variant: "success",
      })
      if (selectedTask?.id === taskId) {
        setSelectedTask(null)
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete task.",
        variant: "destructive",
      })
    }
  }

  // Open Task Drawer
  const openTaskDetail = (task: Task) => {
    setSelectedTask(task)
    setComments([])
    setCommentText("")
    api
      .get(`/api/v1/comments/?task_id=${task.id}`)
      .then((res) => setComments(res.data.data || []))
  }

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim() || !selectedTask) return
    setCommentSubmitting(true)
    try {
      await api.post("/api/v1/comments/", {
        content: commentText,
        task_id: selectedTask.id,
      })
      setCommentText("")
      api
        .get(`/api/v1/comments/?task_id=${selectedTask.id}`)
        .then((res) => setComments(res.data.data || []))
    } catch {
      toast({
        title: "Error",
        description: "Failed to post comment",
        variant: "destructive",
      })
    } finally {
      setCommentSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── Header & Stats ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            My Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Centralized view of tasks assigned to you across all projects.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2 shrink-0">
          <Plus size={16} /> New Task
        </Button>
      </div>

      {/* Stats Summary Widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card/60 border-border">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Tasks</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{stats.total}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <FolderKanban size={18} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">In Progress</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{stats.inProgress}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-info/10 text-info flex items-center justify-center">
              <Clock size={18} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Completed</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{stats.completed}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-success/10 text-success flex items-center justify-center">
              <CheckCircle2 size={18} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">High / Urgent</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{stats.urgent}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
              <UserCheck size={18} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Toolbar: Search & Filters ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/40 p-3 rounded-xl border border-border">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks or projects..."
            className="pl-9 h-9 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Filter size={14} className="text-muted-foreground shrink-0 hidden sm:block" />

          {/* Status Filter */}
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-hidden"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="review">In Review</option>
            <option value="done">Completed</option>
          </select>

          {/* Priority Filter */}
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-hidden"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>

          {(searchQuery || statusFilter !== "all" || priorityFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearchQuery("")
                setStatusFilter("all")
                setPriorityFilter("all")
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* ── Monday.com-Inspired Task Table ─────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/30 bg-destructive/10 text-destructive p-6 text-center">
          Failed to load tasks. Please try refreshing the page.
        </Card>
      ) : processedTasks.length === 0 ? (
        <Card className="border-dashed py-14 text-center">
          <CardContent className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-lg font-medium text-foreground">No tasks found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {searchQuery || statusFilter !== "all" || priorityFilter !== "all"
                ? "No tasks match your filter criteria."
                : "You don't have any tasks assigned yet."}
            </p>
            <Button onClick={() => setShowAdd(true)} className="gap-2 mt-2">
              <Plus size={16} /> Create Task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-muted/60 text-xs font-semibold text-muted-foreground uppercase border-b border-border sticky top-0 backdrop-blur-xs z-10">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">Done</th>
                  <th
                    className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("title")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Task Name</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("project_name")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Project</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Status</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("priority")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Priority</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="px-4 py-3">Assignee</th>
                  <th
                    className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors text-right"
                    onClick={() => handleSort("due_date")}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Due Date</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="w-12 px-3 py-3 text-center">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {processedTasks.map((task) => {
                  const isDone = task.status === "done"
                  const isOverdue =
                    task.due_date &&
                    !isDone &&
                    new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0))

                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-accent/40 transition-colors group cursor-pointer"
                      onClick={() => openTaskDetail(task)}
                    >
                      {/* Checkbox / Status Toggle */}
                      <td className="px-3 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          onClick={(e) => handleToggleStatus(e, task)}
                        >
                          {isDone ? (
                            <CheckCircle2 size={18} className="text-success" />
                          ) : (
                            <Circle size={18} />
                          )}
                        </button>
                      </td>

                      {/* Task Name */}
                      <td className="px-4 py-3.5">
                        <div>
                          <p
                            className={`font-medium text-foreground text-sm line-clamp-1 ${
                              isDone ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {task.description}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Project */}
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-secondary/50 text-secondary-foreground">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: task.project_color || "#6366f1" }}
                          />
                          {task.project_name || "General"}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="secondary"
                          className={`text-[11px] font-semibold px-2 py-0.5 capitalize border-0 ${
                            task.status === "done"
                              ? "bg-success/15 text-success"
                              : task.status === "in_progress"
                                ? "bg-primary/15 text-primary"
                                : task.status === "review"
                                  ? "bg-warning/15 text-warning"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {task.status?.replace("_", " ")}
                        </Badge>
                      </td>

                      {/* Priority Badge */}
                      <td className="px-4 py-3.5">
                        <Badge
                          variant={
                            task.priority === "high" || task.priority === "urgent"
                              ? "destructive"
                              : task.priority === "medium"
                                ? "warning"
                                : "secondary"
                          }
                          className="text-[11px] px-2 py-0.5 capitalize"
                        >
                          {task.priority || "medium"}
                        </Badge>
                      </td>

                      {/* Assignee */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                              {(user?.full_name || user?.email || "U")[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-foreground font-medium truncate max-w-[120px]">
                            {user?.full_name || user?.email?.split("@")[0]}
                          </span>
                        </div>
                      </td>

                      {/* Due Date */}
                      <td className="px-4 py-3.5 text-right">
                        {task.due_date ? (
                          <span
                            className={`inline-flex items-center justify-end gap-1 text-xs ${
                              isOverdue
                                ? "text-destructive font-semibold"
                                : "text-muted-foreground"
                            }`}
                          >
                            <Calendar size={12} />
                            {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Actions Menu */}
                      <td className="px-3 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-muted-foreground">
                              <MoreHorizontal size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="left" align="start">
                            <DropdownMenuItem onClick={() => openTaskDetail(task)}>
                              <MessageSquare size={14} className="mr-2" /> Details & Comments
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => handleDeleteTask(e, task.id)}
                            >
                              <Trash2 size={14} className="mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── New Task Modal (Mandatory Assignee Validation) ───────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleCreateTask}>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
              <DialogDescription>
                Assign a new task to a project member.
              </DialogDescription>
            </DialogHeader>

            {validationError && (
              <div className="p-3 rounded-md bg-destructive/15 border border-destructive/30 text-destructive text-xs font-medium">
                {validationError}
              </div>
            )}

            <div className="space-y-4 py-3">
              {/* Task Title */}
              <div className="space-y-1.5">
                <Label htmlFor="task-title">Task Title *</Label>
                <Input
                  id="task-title"
                  required
                  placeholder="e.g. Redesign analytics dashboard"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                />
              </div>

              {/* Project Select */}
              <div className="space-y-1.5">
                <Label htmlFor="task-project">Project *</Label>
                <select
                  id="task-project"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={addProjectId}
                  onChange={(e) => handleProjectSelect(e.target.value)}
                >
                  <option value="">Select a project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assignee Select (Mandatory Project Member) */}
              <div className="space-y-1.5">
                <Label htmlFor="task-assignee" className="flex items-center justify-between">
                  <span>Assignee *</span>
                  {loadingMembers && <span className="text-xs text-muted-foreground">Loading members...</span>}
                </Label>
                <select
                  id="task-assignee"
                  required
                  disabled={!addProjectId || loadingMembers}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm disabled:opacity-50"
                  value={addAssigneeId}
                  onChange={(e) => setAddAssigneeId(e.target.value)}
                >
                  <option value="">
                    {!addProjectId
                      ? "Select a project first..."
                      : projectMembers.length === 0
                        ? "No members in project"
                        : "Select assignee..."}
                  </option>
                  {projectMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name || m.email} ({m.role || "member"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="task-desc">Description</Label>
                <Input
                  id="task-desc"
                  placeholder="Scope, requirements, or links"
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                />
              </div>

              {/* Status, Priority, Due Date */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-status">Status</Label>
                  <select
                    id="task-status"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
                    value={addStatus}
                    onChange={(e) => setAddStatus(e.target.value)}
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">In Review</option>
                    <option value="done">Completed</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="task-priority">Priority</Label>
                  <select
                    id="task-priority"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
                    value={addPriority}
                    onChange={(e) => setAddPriority(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="task-due">Due Date</Label>
                  <Input
                    id="task-due"
                    type="date"
                    className="h-9 text-xs px-2"
                    value={addDueDate}
                    onChange={(e) => setAddDueDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTaskMutation.isPending || !addAssigneeId}>
                {createTaskMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-1" /> Creating...
                  </>
                ) : (
                  "Create Task"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Task Detail Drawer ──────────────────────────────────────── */}
      {selectedTask && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
            onClick={() => setSelectedTask(null)}
          />
          <aside className="fixed right-0 top-0 z-50 h-full w-full sm:w-[460px] bg-card border-l border-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground text-base truncate pr-2">
                {selectedTask.title}
              </h3>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSelectedTask(null)}
              >
                <X size={18} />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="secondary" className="capitalize">
                  {selectedTask.status?.replace("_", " ")}
                </Badge>
                <Badge
                  variant={
                    selectedTask.priority === "high" || selectedTask.priority === "urgent"
                      ? "destructive"
                      : "secondary"
                  }
                  className="capitalize"
                >
                  {selectedTask.priority || "No Priority"}
                </Badge>
                {selectedTask.project_name && (
                  <Badge variant="outline" className="ml-auto text-xs">
                    {selectedTask.project_name}
                  </Badge>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Description</p>
                <p className="text-sm text-foreground leading-relaxed">
                  {selectedTask.description || "No description provided."}
                </p>
              </div>

              <Separator className="my-4" />

              {/* Comments */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                  <MessageSquare size={14} /> Comments ({comments.length})
                </p>
                <div className="space-y-2">
                  {comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No comments yet.</p>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className="p-3 rounded-lg bg-accent/40 text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold text-foreground">
                          <span>{c.user_full_name || "User"}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-muted-foreground whitespace-pre-wrap">{c.content}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddComment} className="pt-2 space-y-2">
                  <Input
                    placeholder="Write a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                  />
                  <Button type="submit" size="sm" disabled={commentSubmitting} className="w-full">
                    {commentSubmitting ? "Posting..." : "Post Comment"}
                  </Button>
                </form>
              </div>
            </ScrollArea>
          </aside>
        </>
      )}
    </div>
  )
}
