import { AlertTriangle, Check, Loader2, UserCheck } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import api from "@/api"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import useAuth from "@/hooks/useAuth"

export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") || ""
  const navigate = useNavigate()
  const { user, isLoading: isAuthLoading } = useAuth()
  const { toast } = useToast()

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
      await api.post(`/api/v1/invitations/accept?token=${token}`)
      toast({
        title: "Workspace joined!",
        description: "You have successfully joined the workspace.",
        variant: "success",
      })
      navigate("/")
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.detail || "Failed to join workspace.",
        variant: "destructive",
      })
    } finally {
      setAccepting(false)
    }
  }

  if (loading || isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
      </div>
    )
  }

  if (error || !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Invalid or Expired Invitation
          </h2>
          <p className="text-sm text-muted-foreground">
            This invitation link is invalid or has expired. Please ask the
            workspace admin to send a new invite.
          </p>
          <Button variant="outline" className="w-full" asChild>
            <Link to="/login">Go to Sign In</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserCheck size={32} />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Join Workspace
          </h2>
          <p className="text-sm text-muted-foreground">
            You have been invited to join a workspace on DOit. Please sign in or
            create an account to accept.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button className="w-full" asChild>
              <Link to="/login">Sign In</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/signup">Create Account</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
          <UserCheck size={32} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          You&apos;re Invited!
        </h2>
        <p className="text-sm text-muted-foreground">
          You are invited to join the workspace as{" "}
          <span className="font-semibold text-foreground">{user.email}</span>.
        </p>

        {invitation.email !== user.email && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground text-left">
            <p className="font-semibold">Notice:</p>
            This invitation was issued for <b>{invitation.email}</b>, but you
            are currently signed in as <b>{user.email}</b>.
          </div>
        )}

        <div className="space-y-2 pt-2">
          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Joining Workspace...
              </>
            ) : (
              <>
                <Check size={16} />
                Accept & Join Workspace
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            asChild
          >
            <Link to="/">Cancel</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
