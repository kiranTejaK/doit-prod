import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import "./index.css"

import { Toaster } from "@/components/ui/toaster"
import NotFound from "./components/Common/NotFound"
import AcceptInvite from "./pages/AcceptInvite"
import AdminPage from "./pages/AdminPage"
// Authenticated pages
import Dashboard from "./pages/Dashboard"
import ItemsPage from "./pages/ItemsPage"
// Layout
import Layout from "./pages/Layout"
// Auth pages
import Login from "./pages/Login"
import ProjectDetailPage from "./pages/ProjectDetailPage"
import ProjectsPage from "./pages/ProjectsPage"
import RecoverPassword from "./pages/RecoverPassword"
import ResetPassword from "./pages/ResetPassword"
import SettingsPage from "./pages/SettingsPage"
import Signup from "./pages/Signup"
import TasksPage from "./pages/TasksPage"
import VerifyEmail from "./pages/VerifyEmail"
import WorkspaceDetailPage from "./pages/WorkspaceDetailPage"
import WorkspacesPage from "./pages/WorkspacesPage"

// ─── TanStack Query Client ───────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,      // 5 minutes — data is fresh, no background refetch
      gcTime: 1000 * 60 * 10,        // 10 minutes — keep in cache after unmount
      retry: 1,                       // Retry failed requests once
      refetchOnWindowFocus: false,    // Prevent refetch on tab switch (avoids render loops)
    },
    mutations: {
      retry: 0,
    },
  },
})

// ─── Theme Init — apply before first paint ────────────────────────────────────
const savedTheme = localStorage.getItem("theme") || "system"
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
const isDark =
  savedTheme === "dark" || (savedTheme === "system" && prefersDark)

if (isDark) {
  document.documentElement.classList.add("dark")
}

// ─── Auth Guards ─────────────────────────────────────────────────────────────
function isLoggedIn() {
  return localStorage.getItem("access_token") !== null
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  if (isLoggedIn()) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

// ─── App Root ────────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route
            path="/login"
            element={
              <GuestOnly>
                <Login />
              </GuestOnly>
            }
          />
          <Route
            path="/signup"
            element={
              <GuestOnly>
                <Signup />
              </GuestOnly>
            }
          />
          <Route
            path="/recover-password"
            element={
              <GuestOnly>
                <RecoverPassword />
              </GuestOnly>
            }
          />
          <Route
            path="/reset-password"
            element={
              <GuestOnly>
                <ResetPassword />
              </GuestOnly>
            }
          />
          <Route
            path="/verify-email"
            element={
              <GuestOnly>
                <VerifyEmail />
              </GuestOnly>
            }
          />
          <Route path="/accept-invite" element={<AcceptInvite />} />

          {/* Authenticated routes inside Layout */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="items" element={<ItemsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="workspaces" element={<WorkspacesPage />} />
            <Route
              path="workspaces/:workspaceId"
              element={<WorkspaceDetailPage />}
            />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="tasks" element={<TasksPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  </StrictMode>,
)
