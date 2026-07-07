import { useEffect, useState } from "react"
import api from "@/api"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

export default function SettingsPage() {
  const { user: currentUser, logout } = useAuth()
  const [activeTab, setActiveTab] = useState("profile")

  if (!currentUser) return null

  const tabs = [
    { key: "profile", label: "My Profile" },
    { key: "password", label: "Password" },
    { key: "appearance", label: "Appearance" },
    ...(!currentUser.is_superuser
      ? [{ key: "danger", label: "Danger Zone" }]
      : []),
  ]

  return (
    <div>
      <h2 className="pt-3 pb-3">User Settings</h2>
      <ul className="nav nav-tabs mb-4">
        {tabs.map((tab) => (
          <li className="nav-item" key={tab.key}>
            <button
              className={`nav-link ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {activeTab === "profile" && <ProfileTab user={currentUser} />}
      {activeTab === "password" && <PasswordTab />}
      {activeTab === "appearance" && <AppearanceTab />}
      {activeTab === "danger" && <DangerTab logout={logout} />}
    </div>
  )
}

function ProfileTab({ user }: { user: any }) {
  const [editMode, setEditMode] = useState(false)
  const [fullName, setFullName] = useState(user.full_name || "")
  const [email, setEmail] = useState(user.email || "")
  const [jobTitle, setJobTitle] = useState(user.job_title || "")
  const [submitting, setSubmitting] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.patch("/api/v1/users/me", {
        full_name: fullName,
        email,
        job_title: jobTitle,
      })
      showSuccessToast("User updated successfully.")
      setEditMode(false)
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed to update")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSave} style={{ maxWidth: "400px" }}>
      <h5 className="mb-3">User Information</h5>
      <div className="mb-3">
        <label className="form-label">Full Name</label>
        {editMode ? (
          <input
            type="text"
            className="form-control"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        ) : (
          <p className={fullName ? "" : "text-secondary"}>
            {fullName || "N/A"}
          </p>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label">Job Title</label>
        {editMode ? (
          <input
            type="text"
            className="form-control"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        ) : (
          <p className={jobTitle ? "" : "text-secondary"}>
            {jobTitle || "N/A"}
          </p>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label">Email</label>
        {editMode ? (
          <input
            type="email"
            className="form-control"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        ) : (
          <p>{email}</p>
        )}
      </div>
      <div className="d-flex gap-2">
        {editMode ? (
          <>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditMode(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditMode(true)}
          >
            Edit
          </button>
        )}
      </div>
    </form>
  )
}

function PasswordTab() {
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (newPw !== confirmPw) {
      setError("Passwords do not match")
      return
    }
    if (newPw.length < 8) {
      setError("New password must be at least 8 characters")
      return
    }
    setSubmitting(true)
    try {
      await api.patch("/api/v1/users/me/password", {
        current_password: currentPw,
        new_password: newPw,
      })
      showSuccessToast("Password updated successfully.")
      setCurrentPw("")
      setNewPw("")
      setConfirmPw("")
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed to update password")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: "400px" }}>
      <h5 className="mb-3">Change Password</h5>
      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      <div className="mb-3">
        <label className="form-label">Current Password</label>
        <input
          type="password"
          className="form-control"
          required
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
        />
      </div>
      <div className="mb-3">
        <label className="form-label">New Password</label>
        <input
          type="password"
          className="form-control"
          required
          minLength={8}
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />
      </div>
      <div className="mb-3">
        <label className="form-label">Confirm Password</label>
        <input
          type="password"
          className="form-control"
          required
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "Saving..." : "Save"}
      </button>
    </form>
  )
}

function AppearanceTab() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light",
  )

  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme)
    localStorage.setItem("theme", theme)
  }, [theme])

  return (
    <div style={{ maxWidth: "400px" }}>
      <h5 className="mb-3">Appearance</h5>
      <div className="d-flex gap-3">
        <button
          className={`btn ${theme === "light" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setTheme("light")}
        >
          ☀️ Light
        </button>
        <button
          className={`btn ${theme === "dark" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setTheme("dark")}
        >
          🌙 Dark
        </button>
      </div>
    </div>
  )
}

function DangerTab({ logout }: { logout: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const handleDelete = async () => {
    setSubmitting(true)
    try {
      await api.delete("/api/v1/users/me")
      showSuccessToast("Your account has been successfully deleted")
      logout()
    } catch {
      showErrorToast("Failed to delete account")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: "400px" }}>
      <h5 className="mb-3">Delete Account</h5>
      <p>
        Permanently delete your data and everything associated with your
        account.
      </p>
      <button className="btn btn-danger" onClick={() => setShowConfirm(true)}>
        Delete
      </button>

      {showConfirm && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirmation Required</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowConfirm(false)}
                />
              </div>
              <div className="modal-body">
                <p>
                  All your account data will be{" "}
                  <strong>permanently deleted.</strong> This action cannot be
                  undone.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowConfirm(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={submitting}
                >
                  {submitting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
