import { useState, useMemo } from "react"
import { useParams, Link } from "react-router-dom"
import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  FolderKanban,
  Loader2,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import api from "@/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjectDetail } from "@/hooks/useProjects"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"

const WORKFLOW_STAGES = [
  {
    id: "todo",
    title: "To Do",
    badgeVariant: "secondary" as const,
    colorClass: "border-l-slate-400 dark:border-l-slate-500",
  },
  {
    id: "in_progress",
    title: "In Progress",
    badgeVariant: "default" as const,
    colorClass: "border-l-indigo-500 dark:border-l-indigo-400",
  },
  {
    id: "review",
    title: "In Review",
    badgeVariant: "warning" as const,
    colorClass: "border-l-amber-500 dark:border-l-amber-400",
  },
  {
    id: "done",
    title: "Completed",
    badgeVariant: "success" as const,
    colorClass: "border-l-emerald-500 dark:border-l-emerald-400",
  },
]

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading, error } = useProjectDetail(projectId)

  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Section collapse state (true = expanded, false = collapsed)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  // Controls state
  const [search, setSearch] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [sortBy, setSortBy] = useState<"title" | "priority" | "due_date">("title")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")

  // Add Task Modal
  const [showAddTask, setShowAddTask] = useState(false)
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDesc, setTaskDesc] = useState("")
  const [taskStatus, setTaskStatus] = useState("todo")
  const [taskPriority, setTaskPriority] = useState("medium")
  const [taskAssigneeId, setTaskAssigneeId] = useState("")
  const [taskDueDate, setTaskDueDate] = useState("")
  const [taskSubmitting, setTaskSubmitting] = useState(false)
  const [projMembersForTask, setProjMembersForTask] = useState<any[]>([])

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

  const toggleSection = (stageId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [stageId]: !prev[stageId],
    }))
  }

  const openAddTaskModal = () => {
    setShowAddTask(true)
    api.get(`/api/v1/projects/${projectId}/members`).then((res) => {
      const mList = res.data.data || res.data || []
      setProjMembersForTask(mList)
      if (mList.length > 0 && !taskAssigneeId) {
        setTaskAssigneeId(mList[0].id)
      }
    })
  }

  const tasks = data?.tasks || []
  const project = data?.project

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t: any) => {
      const matchesSearch =
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || "").toLowerCase().includes(search.toLowerCase())
      const matchesPriority = priorityFilter === "all" || (t.priority || "medium") === priorityFilter
      return matchesSearch && matchesPriority
    })
  }, [tasks, search, priorityFilter])

  // Sort helper
  const sortTasks = (taskList: any[]) => {
    return [...taskList].sort((a: any, b: any) => {
      let valA = a[sortBy] || ""
      let valB = b[sortBy] || ""
      if (sortBy === "due_date") {
        valA = valA ? new Date(valA).getTime() : 0
        valB = valB ? new Date(valB).getTime() : 0
      }
      if (valA < valB) return sortOrder === "asc" ? -1 : 1
      if (valA > valB) return sortOrder === "asc" ? 1 : -1
      return 0
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64 mb-2" />
        <div className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    )
  }

  const isForbidden = (error as any)?.response?.status === 403

  if (isForbidden) {
    return (
      <div className="py-16 text-center space-y-4 max-w-md mx-auto">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Lock size={28} />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Access Denied</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You are not a member of this project. Project details, tasks, and member lists are restricted to Project Members.
        </p>
        <Button variant="outline" asChild className="mt-2">
          <Link to="/projects">
            <ArrowLeft size={16} /> Back to Projects
          </Link>
        </Button>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="py-12 text-center space-y-4 max-w-md mx-auto">
        <h2 className="text-xl font-bold text-foreground">Project not found</h2>
        <Button variant="outline" asChild>
          <Link to="/projects">
            <ArrowLeft size={16} /> Back to Projects
          </Link>
        </Button>
      </div>
    )
  }

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskAssigneeId) {
      toast({
        title: "Validation Error",
        description: "Please select an assignee from the project members.",
        variant: "destructive",
      })
      return
    }
    setTaskSubmitting(true)
    try {
      await api.post("/api/v1/tasks/", {
        title: taskTitle,
        description: taskDesc,
        project_id: projectId,
        assignee_id: taskAssigneeId,
        status: taskStatus,
        priority: taskPriority,
        due_date: taskDueDate || undefined,
      })
      toast({
        title: "Task created",
        description: `Task "${taskTitle}" created successfully.`,
        variant: "success",
      })
      setShowAddTask(false)
      setTaskTitle("")
      setTaskDesc("")
      setTaskAssigneeId("")
      setTaskDueDate("")
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.detail || "Failed to create task",
        variant: "destructive",
      })
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleMoveStatus = async (taskId: string, newStatus: string) => {
    const previousProjectData = queryClient.getQueryData(["project", projectId])

    // Optimistic UI update
    queryClient.setQueryData(["project", projectId], (oldData: any) => {
      if (!oldData) return oldData
      return {
        ...oldData,
        tasks: oldData.tasks.map((t: any) =>
          t.id === taskId ? { ...t, status: newStatus } : t,
        ),
      }
    })

    try {
      await api.put(`/api/v1/tasks/${taskId}`, { status: newStatus })
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    } catch (err: any) {
      // Revert optimistic update on failure
      queryClient.setQueryData(["project", projectId], previousProjectData)
      toast({
        title: "Error moving task",
        description: err.response?.data?.detail || "Failed to update task status.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.delete(`/api/v1/tasks/${taskId}`)
      toast({
        title: "Task deleted",
        description: "Task removed successfully.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete task.",
        variant: "destructive",
      })
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
      toast({
        title: "Member added",
        description: "User added to project.",
        variant: "success",
      })
      setSelectedUserId("")
      api
        .get(`/api/v1/projects/${projectId}/members`)
        .then((res) => setMembers(res.data.data || res.data || []))
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.detail || "Failed to add member",
        variant: "destructive",
      })
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

  const toggleSort = (field: "title" | "priority" | "due_date") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(field)
      setSortOrder("asc")
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground gap-1.5" asChild>
          <Link to="/projects">
            <ArrowLeft size={14} /> Projects
          </Link>
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FolderKanban size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-sm text-muted-foreground">{project.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openMembers} className="gap-1.5">
              <Users size={15} /> Members
            </Button>
            <Button size="sm" onClick={openAddTaskModal} className="gap-1.5">
              <Plus size={15} /> Add Task
            </Button>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border shadow-xs">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search project tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 text-xs shadow-xs"
          >
            <option value="all">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className="text-xs text-muted-foreground">
          Total Tasks: <span className="font-semibold text-foreground">{filteredTasks.length}</span>
        </div>
      </div>

      {/* Grouped Workflow List View Sections */}
      <div className="space-y-6">
        {WORKFLOW_STAGES.map((stage) => {
          const stageTasks = sortTasks(
            filteredTasks.filter((t: any) => (t.status || "todo") === stage.id),
          )
          const isCollapsed = collapsedSections[stage.id] === true

          return (
            <div
              key={stage.id}
              className={`rounded-xl border border-border bg-card shadow-xs overflow-hidden border-l-4 ${stage.colorClass}`}
            >
              {/* Collapsible Section Header */}
              <div
                onClick={() => toggleSection(stage.id)}
                className="flex items-center justify-between px-4 py-3 bg-muted/30 cursor-pointer select-none border-b border-border/50 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Button variant="ghost" size="icon-sm" className="h-6 w-6 p-0 text-muted-foreground">
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </Button>
                  <h3 className="font-semibold text-sm text-foreground">{stage.title}</h3>
                  <Badge variant={stage.badgeVariant} className="text-[11px] h-5 px-2">
                    {stageTasks.length}
                  </Badge>
                </div>
              </div>

              {/* Section Task List Table */}
              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/20 text-xs font-semibold text-muted-foreground uppercase border-b border-border/50">
                      <tr>
                        <th className="px-4 py-2.5 cursor-pointer select-none" onClick={() => toggleSort("title")}>
                          <div className="flex items-center gap-1">
                            Task Name <ArrowUpDown size={12} />
                          </div>
                        </th>
                        <th className="px-4 py-2.5 cursor-pointer select-none" onClick={() => toggleSort("priority")}>
                          <div className="flex items-center gap-1">
                            Priority <ArrowUpDown size={12} />
                          </div>
                        </th>
                        <th className="px-4 py-2.5">Move To Stage</th>
                        <th className="px-4 py-2.5 cursor-pointer select-none" onClick={() => toggleSort("due_date")}>
                          <div className="flex items-center gap-1">
                            Due Date <ArrowUpDown size={12} />
                          </div>
                        </th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {stageTasks.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground italic">
                            No tasks in {stage.title}.
                          </td>
                        </tr>
                      ) : (
                        stageTasks.map((t: any) => (
                          <tr
                            key={t.id}
                            className="hover:bg-accent/40 transition-colors cursor-pointer"
                            onClick={() => openTaskDetail(t)}
                          >
                            <td className="px-4 py-3 font-medium text-foreground">
                              <div className="flex items-start gap-2.5">
                                <button
                                  type="button"
                                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleMoveStatus(t.id, t.status === "done" ? "todo" : "done")
                                  }}
                                >
                                  {t.status === "done" ? (
                                    <CheckCircle2 size={16} className="text-success" />
                                  ) : (
                                    <Circle size={16} />
                                  )}
                                </button>
                                <div>
                                  <span className={t.status === "done" ? "line-through text-muted-foreground" : ""}>
                                    {t.title}
                                  </span>
                                  {t.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                      {t.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <Badge
                                variant={
                                  t.priority === "urgent" || t.priority === "high"
                                    ? "destructive"
                                    : t.priority === "medium"
                                      ? "warning"
                                      : "secondary"
                                }
                                className="capitalize text-[11px]"
                              >
                                {t.priority || "normal"}
                              </Badge>
                            </td>

                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={t.status || "todo"}
                                onChange={(e) => handleMoveStatus(t.id, e.target.value)}
                                className="flex h-8 rounded-md border border-input bg-background px-2 py-0 text-xs shadow-xs focus:ring-1 focus:ring-primary"
                              >
                                <option value="todo">To Do</option>
                                <option value="in_progress">In Progress</option>
                                <option value="review">In Review</option>
                                <option value="done">Completed</option>
                              </select>
                            </td>

                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {t.due_date ? (
                                <span className="flex items-center gap-1">
                                  <Clock size={12} /> {new Date(t.due_date).toLocaleDateString()}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>

                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm">
                                    <MoreHorizontal size={16} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openTaskDetail(t)}>
                                    <MessageSquare size={14} className="mr-2" /> View Details & Comments
                                  </DropdownMenuItem>
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      Move to...
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      <DropdownMenuItem onClick={() => handleMoveStatus(t.id, "todo")}>
                                        To Do
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleMoveStatus(t.id, "in_progress")}>
                                        In Progress
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleMoveStatus(t.id, "review")}>
                                        In Review
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleMoveStatus(t.id, "done")}>
                                        Completed
                                      </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteTask(t.id)}
                                    className="text-red-600 dark:text-red-400 focus:text-red-600"
                                  >
                                    <Trash2 size={14} className="mr-2" /> Delete Task
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add Task Modal */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent>
          <form onSubmit={handleAddTask}>
            <DialogHeader>
              <DialogTitle>Add Task</DialogTitle>
              <DialogDescription>
                Create a new task in {project.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-title">Task Title *</Label>
                <Input
                  id="task-title"
                  required
                  placeholder="e.g. Implement user authentication"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-assignee">Assignee *</Label>
                <select
                  id="task-assignee"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                  value={taskAssigneeId}
                  onChange={(e) => setTaskAssigneeId(e.target.value)}
                >
                  <option value="">Select project member...</option>
                  {projMembersForTask.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name || m.email} ({m.role || "member"})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-desc">Description</Label>
                <Input
                  id="task-desc"
                  placeholder="Task details and scope"
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-status">Status</Label>
                  <select
                    id="task-status"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                    value={taskStatus}
                    onChange={(e) => setTaskStatus(e.target.value)}
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
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-due-date">Due Date</Label>
                  <Input
                    id="task-due-date"
                    type="date"
                    className="h-9 text-xs px-2"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddTask(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={taskSubmitting}>
                {taskSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  "Create Task"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Members Modal */}
      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project Members</DialogTitle>
            <DialogDescription>
              Manage members assigned to this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Add Member from Workspace</Label>
              <div className="flex gap-2">
                <select
                  className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Select user...</option>
                  {wsMembers
                    .filter((wm) => !members.some((pm) => pm.id === wm.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
                </select>
                <Button
                  size="sm"
                  disabled={!selectedUserId || addingMember}
                  onClick={handleAddMember}
                  className="gap-1"
                >
                  <UserPlus size={14} /> Add
                </Button>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Current Members ({members.length})
              </Label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2 rounded-md bg-accent/40 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px]">
                          {(m.full_name || m.email)[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground">{m.full_name || m.email}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {m.role || "member"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Detail Drawer */}
      {selectedTask && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
            onClick={() => setSelectedTask(null)}
          />
          <aside className="fixed right-0 top-0 z-50 h-full w-full sm:w-[450px] bg-card border-l border-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground text-base truncate">
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
                  {(selectedTask.status || "todo").replace("_", " ")}
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
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Description</p>
                <p className="text-sm text-foreground">
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
