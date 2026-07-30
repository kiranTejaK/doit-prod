import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/api"
import { Button } from "@/components/ui/button"

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
      .post("/api/v1/login/verify-email", { token })
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error")
        setErrorMsg(err.response?.data?.detail || "Verification failed.")
      })
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-center">
        {status === "pending" && (
          <div className="py-6 space-y-4">
            <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Verifying your email...
            </h2>
            <p className="text-sm text-muted-foreground">
              Please wait while we confirm your account.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="py-6 space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 size={36} />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Email Verified!
            </h2>
            <p className="text-sm text-muted-foreground">
              Your email has been successfully verified. You can now access your
              DOit account.
            </p>
            <Button className="w-full mt-2" onClick={() => navigate("/login")}>
              Continue to Sign In
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="py-6 space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <AlertCircle size={36} />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Verification Failed
            </h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => navigate("/login")}
            >
              <ArrowLeft size={16} />
              Back to Sign In
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
