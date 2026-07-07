import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import api from "@/api"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") || ""
  const navigate = useNavigate()
  const { user, isLoading: isAuthLoading } = useAuth()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [invitation, setInvitation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (!token) {
      setError(true)
      setLoading(false)
      return
    }
    api
      .get(`/api/v1/invitations/${token}`)
      .then((res) => setInvitation(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [token])

  const handleAccept = async () => {
    setAccepting(true)
    try {
      await api.post(`/api/v1/invitations/${token}/accept`)
      showSuccessToast("You have successfully joined the workspace")
      navigate("/")
    } catch (err: any) {
      showErrorToast(err.response?.data?.detail || "Failed to join workspace")
    } finally {
      setAccepting(false)
    }
  }

  if (loading || isAuthLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status" />
      </div>
    )
  }

  if (error || !invitation) {
    return (
      <div className="container py-5 text-center" style={{ maxWidth: "500px" }}>
        <h3 className="text-danger">Invalid or Expired Invitation</h3>
        <p>The invitation link is invalid or has expired.</p>
        <Link to="/login" className="btn btn-outline-primary">
          Go to Login
        </Link>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container py-5 text-center" style={{ maxWidth: "500px" }}>
        <h3>Join Workspace</h3>
        <p>You have been invited to join a workspace.</p>
        <p className="fw-bold">
          Please Log In or Sign Up to accept this invitation.
        </p>
        <Link to="/login" className="btn btn-primary btn-lg me-2">
          Log In
        </Link>
        <Link to="/signup" className="btn btn-outline-primary btn-lg">
          Sign Up
        </Link>
      </div>
    )
  }

  return (
    <div className="container py-5 text-center" style={{ maxWidth: "500px" }}>
      <h3>You're Invited!</h3>
      <p>
        You are invited to join the workspace with your account{" "}
        <b>{user.email}</b>.
      </p>
      {invitation.email !== user.email && (
        <div className="alert alert-warning small">
          Warning: The invitation was sent to <b>{invitation.email}</b>, but you
          are logged in as <b>{user.email}</b>.
        </div>
      )}
      <button
        className="btn btn-success btn-lg mb-2"
        onClick={handleAccept}
        disabled={accepting}
      >
        {accepting ? "Joining..." : "Accept & Join Workspace"}
      </button>
      <br />
      <Link to="/" className="btn btn-link">
        Cancel
      </Link>
    </div>
  )
}
