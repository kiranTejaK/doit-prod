import {
  AlertTriangle,
  KeyRound,
  Loader2,
  Moon,
  Palette,
  ShieldAlert,
  Sun,
  User,
} from "lucide-react"
import { useState } from "react"
import api from "@/api"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import useAuth from "@/hooks/useAuth"
import { useTheme } from "@/hooks/useTheme"

export default function SettingsPage() {
  const { user: currentUser, logout } = useAuth()
  const [activeTab, setActiveTab] = useState("profile")

  if (!currentUser) return null

  const tabs = [
    { key: "profile", label: "My Profile", icon: User },
    { key: "password", label: "Password", icon: KeyRound },
    { key: "appearance", label: "Appearance", icon: Palette },
    ...(!currentUser.is_superuser
      ? [{ key: "danger", label: "Danger Zone", icon: ShieldAlert }]
      : []),
  ]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          User Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your personal profile, security preferences, and theme.
        </p>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-border gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === "profile" && <ProfileTab user={currentUser} />}
        {activeTab === "password" && <PasswordTab />}
        {activeTab === "appearance" && <AppearanceTab />}
        {activeTab === "danger" && <DangerTab logout={logout} />}
      </div>
    </div>
  )
}

function ProfileTab({ user }: { user: any }) {
  const [profile, setProfile] = useState(user)
  const [showModal, setShowModal] = useState(false)
  const [fullName, setFullName] = useState(user.full_name || "")
  const [email, setEmail] = useState(user.email || "")
  const [jobTitle, setJobTitle] = useState(user.job_title || "")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const handleOpenModal = () => {
    setFullName(profile.full_name || "")
    setEmail(profile.email || "")
    setJobTitle(profile.job_title || "")
    setShowModal(true)
  }

  const handleCancel = () => {
    setShowModal(false)
    setFullName(profile.full_name || "")
    setEmail(profile.email || "")
    setJobTitle(profile.job_title || "")
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast({
        title: "Validation Error",
        description: "Email address is required.",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      const res = await api.patch("/api/v1/users/me", {
        full_name: fullName,
        email,
        job_title: jobTitle,
      })
      setProfile(res.data)
      toast({
        title: "Profile updated",
        description: "Your user information has been saved successfully.",
        variant: "success",
      })
      setShowModal(false)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.detail || "Failed to update profile",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>User Information</CardTitle>
          <CardDescription>
            View your public profile details and primary contact email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Full Name</Label>
            <p className="text-sm font-semibold text-foreground">
              {profile.full_name || "Not provided"}
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Job Title</Label>
            <p className="text-sm font-semibold text-foreground">
              {profile.job_title || "Not provided"}
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Email Address
            </Label>
            <p className="text-sm font-semibold text-foreground">
              {profile.email}
            </p>
          </div>

          <div className="pt-2">
            <Button type="button" onClick={handleOpenModal}>
              Edit Profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit Profile Modal Dialog */}
      <Dialog open={showModal} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent>
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
              <DialogDescription>
                Update your account details below. Click Save when finished.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-full-name">Full Name</Label>
                <Input
                  id="edit-full-name"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-job-title">Job Title</Label>
                <Input
                  id="edit-job-title"
                  placeholder="Software Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email Address *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  required
                  placeholder="john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PasswordTab() {
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const { toast } = useToast()

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
      toast({
        title: "Password changed",
        description: "Your password has been updated.",
        variant: "success",
      })
      setCurrentPw("")
      setNewPw("")
      setConfirmPw("")
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.detail || "Failed to update password",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>
          Ensure your account stays secure by using a strong password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="current-pw">Current Password</Label>
            <Input
              id="current-pw"
              type="password"
              required
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-pw">New Password</Label>
            <Input
              id="new-pw"
              type="password"
              required
              minLength={8}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-pw">Confirm New Password</Label>
            <Input
              id="confirm-pw"
              type="password"
              required
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Updating...
              </>
            ) : (
              "Update Password"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AppearanceTab() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance Preferences</CardTitle>
        <CardDescription>
          Customize how DOit looks on your device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <button
            type="button"
            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all w-32 ${
              resolvedTheme === "light"
                ? "border-primary bg-primary/5 text-primary font-semibold"
                : "border-border hover:border-border/80 text-muted-foreground"
            }`}
            onClick={() => setTheme("light")}
          >
            <Sun size={24} className="mb-2" />
            <span className="text-xs">Light Theme</span>
          </button>

          <button
            type="button"
            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all w-32 ${
              resolvedTheme === "dark"
                ? "border-primary bg-primary/5 text-primary font-semibold"
                : "border-border hover:border-border/80 text-muted-foreground"
            }`}
            onClick={() => setTheme("dark")}
          >
            <Moon size={24} className="mb-2" />
            <span className="text-xs">Dark Theme</span>
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

function DangerTab({ logout }: { logout: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const handleDelete = async () => {
    setSubmitting(true)
    try {
      await api.delete("/api/v1/users/me")
      toast({
        title: "Account deleted",
        description: "Your account has been deleted.",
        variant: "success",
      })
      logout()
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete account.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Delete Account</CardTitle>
        <CardDescription>
          Permanently remove your account and all associated personal data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Once deleted, your profile and personal preferences cannot be
          recovered.
        </p>
        <Button variant="destructive" onClick={() => setShowConfirm(true)}>
          Delete My Account
        </Button>

        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle size={20} /> Confirmation Required
              </DialogTitle>
              <DialogDescription>
                Are you completely sure? This action is permanent and cannot be
                undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-4">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Deleting...
                  </>
                ) : (
                  "Permanently Delete"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
