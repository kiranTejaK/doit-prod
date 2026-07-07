import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import Logo from "/assets/images/fastapi-logo.svg"
import UserMenu from "./UserMenu"

function Navbar() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light",
  )

  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme)
    localStorage.setItem("theme", theme)
  }, [theme])

  const toggleTheme = () =>
    setTheme((prev) => (prev === "light" ? "dark" : "light"))

  return (
    <nav className="navbar navbar-expand-md border-bottom bg-body-tertiary sticky-top px-3 d-none d-md-flex">
      <div className="container-fluid d-flex justify-content-between align-items-center">
        <Link to="/" className="navbar-brand">
          <img
            src={Logo}
            alt="Logo"
            style={{ maxWidth: "180px", padding: "0.5rem" }}
          />
        </Link>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={toggleTheme}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          <UserMenu />
        </div>
      </div>
    </nav>
  )
}

export default Navbar
