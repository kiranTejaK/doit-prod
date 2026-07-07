import { useState } from "react"
import { Link } from "react-router-dom"
import useAuth from "@/hooks/useAuth"
import Logo from "/assets/images/fastapi-logo.svg"

export default function Login() {
  const { login, error, resetError } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    resetError()
    setSubmitting(true)
    try {
      await login(email, password)
    } catch {
      // error is displayed from useAuth
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

        {error && <div className="alert alert-danger py-2 small">{error}</div>}

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
          <Link to="/recover-password" className="text-decoration-none small">
            Forgot Password?
          </Link>
        </div>

        <button
          type="submit"
          className="btn btn-primary w-100"
          disabled={submitting}
        >
          {submitting ? "Logging in..." : "Log In"}
        </button>

        <p className="text-center mt-3 mb-0 small">
          Don't have an account? <Link to="/signup">Sign Up</Link>
        </p>
      </form>
    </div>
  )
}
