import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/api"

export default function VerifyEmail() {
  const [status, setStatus] = useState<"pending" | "success" | "error">(
    "pending",
  )
  const [errorMsg, setErrorMsg] = useState("")
  const navigate = useNavigate()
  const token = new URLSearchParams(window.location.search).get("token")

  useEffect(() => {
    if (!token) {
      setStatus("error")
      setErrorMsg("Invalid verification link.")
      return
    }
    api
      .post("/api/v1/verify-email", { token })
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error")
        setErrorMsg(err.response?.data?.detail || "Verification failed.")
      })
  }, [token])

  return (
    <div className="d-flex align-items-center justify-content-center vh-100 bg-body-tertiary">
      <div
        className="text-center p-4 rounded bg-body shadow"
        style={{ maxWidth: "450px", width: "100%" }}
      >
        {status === "pending" && (
          <>
            <div className="spinner-border text-primary mb-3" role="status" />
            <h4>Verifying your email...</h4>
            <p className="text-secondary">Please wait.</p>
          </>
        )}
        {status === "success" && (
          <>
            <i
              className="bi bi-check-circle text-success"
              style={{ fontSize: "4rem" }}
            />
            <h4 className="text-success mt-3">Email Verified!</h4>
            <p>
              Your email has been successfully verified. You can now log in.
            </p>
            <button
              className="btn btn-primary mt-2"
              onClick={() => navigate("/login")}
            >
              Continue to Login
            </button>
          </>
        )}
        {status === "error" && (
          <>
            <i
              className="bi bi-exclamation-circle text-danger"
              style={{ fontSize: "4rem" }}
            />
            <h4 className="text-danger mt-3">Verification Failed</h4>
            <p>{errorMsg}</p>
            <button
              className="btn btn-outline-primary mt-2"
              onClick={() => navigate("/login")}
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  )
}
