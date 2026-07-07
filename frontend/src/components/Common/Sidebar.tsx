import { useEffect, useState } from "react"
import api from "@/api"
import SidebarItems from "./SidebarItems"

const Sidebar = () => {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    api
      .get("/api/v1/users/me")
      .then((res) => setCurrentUser(res.data))
      .catch(() => {})
  }, [])

  const handleLogout = () => {
    localStorage.removeItem("access_token")
    window.location.href = "/login"
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="btn btn-outline-secondary position-fixed d-md-none m-3"
        style={{ zIndex: 1050 }}
        onClick={() => setDrawerOpen(true)}
      >
        <i className="bi bi-list fs-4" />
      </button>

      {/* Mobile offcanvas */}
      {drawerOpen && (
        <>
          <div
            className="offcanvas offcanvas-start show d-md-none"
            style={{ visibility: "visible", zIndex: 1055 }}
          >
            <div className="offcanvas-header">
              <h5 className="offcanvas-title">Menu</h5>
              <button
                type="button"
                className="btn-close"
                onClick={() => setDrawerOpen(false)}
              />
            </div>
            <div className="offcanvas-body d-flex flex-column justify-content-between">
              <div>
                <SidebarItems
                  currentUser={currentUser}
                  onClose={() => setDrawerOpen(false)}
                />
                <button
                  className="btn btn-link text-decoration-none d-flex align-items-center gap-2 px-3 py-2"
                  onClick={handleLogout}
                >
                  <i className="bi bi-box-arrow-right" /> Log Out
                </button>
              </div>
              {currentUser?.email && (
                <p
                  className="small p-2 text-truncate"
                  style={{ maxWidth: "250px" }}
                >
                  Logged in as: {currentUser.email}
                </p>
              )}
            </div>
          </div>
          <div
            className="offcanvas-backdrop show d-md-none"
            onClick={() => setDrawerOpen(false)}
          />
        </>
      )}

      {/* Desktop sidebar */}
      <div
        className="d-none d-md-flex flex-column bg-body-tertiary border-end p-3"
        style={{
          minWidth: "220px",
          height: "100vh",
          position: "sticky",
          top: 0,
        }}
      >
        <SidebarItems currentUser={currentUser} />
      </div>
    </>
  )
}

export default Sidebar
