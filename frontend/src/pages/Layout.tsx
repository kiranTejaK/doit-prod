import { Outlet } from "react-router-dom"
import Navbar from "../components/Common/Navbar"
import Sidebar from "../components/Common/Sidebar"

export default function Layout() {
  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <Sidebar />
      <div
        className="flex-grow-1 d-flex flex-column"
        style={{ minHeight: "100vh" }}
      >
        <Navbar />
        <main className="flex-grow-1 overflow-auto p-3 p-md-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
