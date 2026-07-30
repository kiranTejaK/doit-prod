import {
  CheckSquare2,
  ChevronLeft,
  FolderKanban,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sun,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import useAuth from "@/hooks/useAuth"
import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/utils"

interface NavItem {
  icon: React.ElementType
  label: string
  path: string
  superuserOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Layers, label: "Workspaces", path: "/workspaces" },
  { icon: FolderKanban, label: "Projects", path: "/projects" },
  { icon: CheckSquare2, label: "My Tasks", path: "/tasks" },
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: Shield, label: "Admin", path: "/admin", superuserOnly: true },
]

function getInitials(name?: string | null, email?: string | null) {
  if (name) {
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }
  return (email?.[0] ?? "U").toUpperCase()
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const { user, logout } = useAuth()
  const location = useLocation()

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const isDark = resolvedTheme === "dark"

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.superuserOnly || user?.is_superuser,
  )

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-4 border-b border-sidebar-border",
          collapsed && !isMobile && "justify-center px-3",
        )}
      >
        <img src="/favicon.svg" alt="DOit Logo" className="w-8 h-8 shrink-0" />
        {(!collapsed || isMobile) && (
          <div>
            <p className="text-sm font-bold tracking-tight text-sidebar-foreground">
              DOit
            </p>
            <p className="text-xs text-muted-foreground leading-none">
              Assign. Track. Finish.
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-1 px-2">
          {(!collapsed || isMobile) && (
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Navigation
            </p>
          )}
          {visibleItems.map(({ icon: Icon, label, path }) => {
            const isActive =
              path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(path)
            const item = (
              <Link
                key={path}
                to={path}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors duration-150",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground",
                  collapsed && !isMobile && "justify-center px-2",
                )}
              >
                <Icon
                  className={cn(
                    "shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                  size={18}
                />
                {(!collapsed || isMobile) && <span>{label}</span>}
                {(!collapsed || isMobile) && isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Link>
            )

            if (collapsed && !isMobile) {
              return (
                <TooltipProvider key={path} delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>{item}</TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            }
            return item
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        {/* Theme toggle */}
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={collapsed && !isMobile ? "icon" : "sm"}
                className={cn(
                  "text-muted-foreground hover:text-foreground w-full",
                  collapsed && !isMobile ? "" : "justify-start gap-2",
                )}
                onClick={() => setTheme(isDark ? "light" : "dark")}
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
                {(!collapsed || isMobile) && (
                  <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
                )}
              </Button>
            </TooltipTrigger>
            {collapsed && !isMobile && (
              <TooltipContent side="right">
                {isDark ? "Light Mode" : "Dark Mode"}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        <Separator />

        {/* User */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-md p-1.5",
            collapsed && !isMobile && "justify-center",
          )}
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={user?.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">
              {getInitials(user?.full_name, user?.email)}
            </AvatarFallback>
          </Avatar>
          {(!collapsed || isMobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-sidebar-foreground">
                {user?.full_name || "User"}
              </p>
              <p className="text-[10px] truncate text-muted-foreground">
                {user?.email}
              </p>
            </div>
          )}
          {(!collapsed || isMobile) && (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={logout}
                  >
                    <LogOut size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Log out</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop Sidebar ─────────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-sidebar border-r border-sidebar-border sticky top-0 h-screen transition-all duration-200 ease-in-out shrink-0",
          collapsed ? "w-[56px]" : "w-[220px]",
        )}
      >
        <SidebarContent />

        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute -right-3 top-[72px] h-6 w-6 rounded-full border border-border bg-background shadow-sm text-muted-foreground hover:text-foreground z-10"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            size={12}
            className={cn(
              "transition-transform duration-200",
              collapsed && "rotate-180",
            )}
          />
        </Button>
      </aside>

      {/* ── Mobile Sidebar (drawer) ──────────────────────── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside className="fixed left-0 top-0 z-50 h-full w-[260px] bg-sidebar border-r border-sidebar-border shadow-xl md:hidden">
            <SidebarContent isMobile />
          </aside>
        </>
      )}

      {/* ── Main Content ─────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar (mobile only) */}
        <header className="flex md:hidden items-center gap-3 border-b border-border bg-background px-4 h-14 sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </Button>
          <span className="font-semibold text-sm text-foreground">DOit</span>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
