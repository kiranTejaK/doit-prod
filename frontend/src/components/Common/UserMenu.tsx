import { useState } from "react"
import { Link } from "react-router-dom"
import useAuth from "@/hooks/useAuth"

const UserMenu = () => {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <div className="dropdown">
      <button
        className="btn btn-primary btn-sm dropdown-toggle d-flex align-items-center gap-2"
        type="button"
        onClick={() => setOpen(!open)}
      >
        <i className="bi bi-person-circle" />
        <span className="text-truncate" style={{ maxWidth: "120px" }}>
          {user?.full_name || "User"}
        </span>
      </button>
      {open && (
        <ul
          className="dropdown-menu show"
          style={{ position: "absolute", right: 0 }}
        >
          <li>
            <Link
              to="/settings"
              className="dropdown-item d-flex align-items-center gap-2"
              onClick={() => setOpen(false)}
            >
              <i className="bi bi-person" /> My Profile
            </Link>
          </li>
          <li>
            <hr className="dropdown-divider" />
          </li>
          <li>
            <button
              className="dropdown-item d-flex align-items-center gap-2"
              onClick={() => {
                logout()
                setOpen(false)
              }}
            >
              <i className="bi bi-box-arrow-right" /> Log Out
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

export default UserMenu
