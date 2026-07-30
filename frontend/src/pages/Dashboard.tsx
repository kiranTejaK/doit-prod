import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  ListTodo,
} from "lucide-react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import useAuth from "@/hooks/useAuth"
import { type Project, useProjects } from "@/hooks/useProjects"
import { useTasks } from "@/hooks/useTasks"

export default function Dashboard() {
  const { user } = useAuth()
  const { data: projectsData, isLoading: isProjectsLoading } = useProjects()
  const { data: tasks = [], isLoading: isTasksLoading } = useTasks(
    user?.id ? { assignee_id: user.id } : undefined,
  )

  const projects = projectsData?.projects || []
  const isLoading = isProjectsLoading || isTasksLoading

  const totalProjects = projects.length
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((t) => t.status === "done").length
  const pendingTasks = totalTasks - completedTasks
  const recentProjects = projects.slice(0, 4)
  const upcomingTasks = tasks.filter((t) => t.status !== "done").slice(0, 5)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const statCards = [
    {
      label: "Total Projects",
      value: totalProjects,
      icon: Briefcase,
      color: "bg-primary/10 text-primary",
    },
    {
      label: "My Tasks",
      value: totalTasks,
      icon: ListTodo,
      color: "bg-info/10 text-info",
    },
    {
      label: "Pending",
      value: pendingTasks,
      icon: Clock,
      color: "bg-warning/10 text-warning-foreground",
    },
    {
      label: "Completed",
      value: completedTasks,
      icon: CheckCircle2,
      color: "bg-success/10 text-success",
    },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Hi, {user?.full_name || user?.email?.split("@")[0]} 👋🏼
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Here&apos;s an overview of your projects and task progress.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" asChild>
            <Link to="/tasks">View All Tasks</Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="transition-all hover:shadow-md">
            <CardContent className="p-5 flex items-center gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${color}`}
              >
                <Icon size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground truncate">
                  {label}
                </p>
                <h3 className="text-2xl font-bold tracking-tight text-foreground">
                  {value}
                </h3>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base font-semibold">
              Recent Projects
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-primary"
              asChild
            >
              <Link to="/projects">
                View All <ArrowRight size={12} />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="flex-1 space-y-2">
            {recentProjects.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No active projects found.
              </div>
            ) : (
              recentProjects.map((project: Project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-medium truncate text-foreground">
                      {project.name}
                    </p>
                    {project.workspace_name && (
                      <p className="text-xs text-muted-foreground truncate">
                        {project.workspace_name}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[11px]">
                    Project
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Tasks */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base font-semibold">
              Upcoming Tasks
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-primary"
              asChild
            >
              <Link to="/tasks">
                View All <ArrowRight size={12} />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="flex-1 space-y-2">
            {upcomingTasks.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No pending tasks assigned to you. 🎉
              </div>
            ) : (
              upcomingTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 pr-2 flex-1">
                    <p className="text-sm font-medium truncate text-foreground">
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge
                        variant={
                          task.priority === "high" || task.priority === "urgent"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-[10px] px-1.5 py-0"
                      >
                        {task.priority}
                      </Badge>
                      {task.project_name && (
                        <span className="text-xs text-muted-foreground truncate">
                          {task.project_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {task.due_date && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(task.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
