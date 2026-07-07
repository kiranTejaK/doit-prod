import { useState } from "react"
import api from "@/api"
import useCustomToast from "@/hooks/useCustomToast"

export default function RecoverPassword() {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post(`/api/v1/password-recovery/${email}`)
      showSuccessToast("Password recovery email sent successfully.")
      setEmail("")
    } catch {
      showErrorToast("Failed to send recovery email.")
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
        <h3 className="text-center mb-2">Password Recovery</h3>
        <p className="text-center text-secondary mb-4">
          A password recovery email will be sent to your registered account.
        </p>
        <div className="mb-3">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-control"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary w-100"
          disabled={submitting}
        >
          {submitting ? "Sending..." : "Continue"}
        </button>
      </form>
    </div>
  )
}
