import { useState } from "react"
import { Link } from "react-router-dom"
import useAuth from "@/hooks/useAuth"
import Logo from "/assets/images/fastapi-logo.svg"

export default function Signup() {
  const { signUp, error } = useAuth()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [validationError, setValidationError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError("")
    if (password !== confirmPassword) {
      setValidationError("Passwords do not match")
      return
    }
    if (password.length < 8) {
      setValidationError("Password must be at least 8 characters")
      return
    }
    setSubmitting(true)
    try {
      await signUp({ email, full_name: fullName, password })
    } catch {
      // errors displayed from useAuth
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
        <div className="text-center mb-4">
          <img src={Logo} alt="Logo" style={{ maxWidth: "180px" }} />
        </div>

        {(error || validationError) && (
          <div className="alert alert-danger py-2 small">
            {validationError || error}
          </div>
        )}

        <div className="mb-3">
          <label className="form-label">Full Name</label>
          <input
            type="text"
            className="form-control"
            placeholder="Full Name"
            required
            minLength={3}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
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
        <div className="mb-3">
          <label className="form-label">Password</label>
          <input
            type="password"
            className="form-control"
            placeholder="Password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {submitting ? "Signing up..." : "Sign Up"}
        </button>

        <p className="text-center mt-3 mb-0 small">
          Already have an account? <Link to="/login">Log In</Link>
        </p>
      </form>
    </div>
  )
}
