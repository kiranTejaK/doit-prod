import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Loader2, Mail } from "lucide-react"
import api from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

export default function RecoverPassword() {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post(`/api/v1/password-recovery/${email}`)
      toast({
        title: "Recovery email sent",
        description: "A password recovery link has been sent to your email address.",
        variant: "success",
      })
      setEmail("")
    } catch {
      toast({
        title: "Error",
        description: "Failed to send password recovery email.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-lg mb-4">
            D
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Password Recovery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your email and we&apos;ll send you a recovery link
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Sending link...
                </>
              ) : (
                <>
                  <Mail size={16} />
                  Send Reset Link
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          <Link to="/login" className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
            <ArrowLeft size={14} />
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
