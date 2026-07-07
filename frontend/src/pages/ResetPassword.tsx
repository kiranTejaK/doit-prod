import { useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/api"
import useCustomToast from "@/hooks/useCustomToast"

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const navigate = useNavigate()

  const token = new URLSearchParams(window.location.search).get("token")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (!token) {
      setError("Invalid reset link")
      return
    }
    setSubmitting(true)
    try {
      await api.post("/api/v1/reset-password", {
        new_password: newPassword,
        token,
      })
      showSuccessToast("Password updated successfully.")
      navigate("/login")
    } catch {
      showErrorToast("Failed to reset password.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="d-flex align-items-center justify-content-center vh-100 bg-body-tertiary">
      <form
        onSubmit={handleSubmit}
        className="p-4 rounded bg-body shadow"
        style={{ maxWidth: "400px", width: "100%" }}
      >
        <h3 className="text-center mb-2">Reset Password</h3>
        <p className="text-center text-secondary mb-4">
          Enter your new password below.
        </p>
        {error && <div className="alert alert-danger py-2 small">{error}</div>}
        <div className="mb-3">
          <label className="form-label">New Password</label>
          <input
            type="password"
            className="form-control"
            placeholder="New Password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Confirm Password</label>
          <input
            type="password"
            className="form-control"
            placeholder="Confirm Password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary w-100"
          disabled={submitting}
        >
          {submitting ? "Resetting..." : "Reset Password"}
        </button>
      </form>
    </div>
  )
}
