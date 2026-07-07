import { Link } from "react-router-dom"

const items = [
  { icon: "bi-house", title: "Dashboard", path: "/" },
  { icon: "bi-columns-gap", title: "Workspaces", path: "/workspaces" },
  { icon: "bi-grid", title: "Projects", path: "/projects" },
  { icon: "bi-check2-square", title: "My Tasks", path: "/tasks" },
  { icon: "bi-gear", title: "User Settings", path: "/settings" },
]

interface SidebarItemsProps {
  currentUser?: any
  onClose?: () => void
}

const SidebarItems = ({ currentUser, onClose }: SidebarItemsProps) => {
  const finalItems = currentUser?.is_superuser
    ? [...items, { icon: "bi-people", title: "Admin", path: "/admin" }]
    : items

  return (
    <>
      <p className="small px-3 py-2 fw-bold text-secondary mb-0">Menu</p>
      <div className="list-group list-group-flush">
        {finalItems.map(({ icon, title, path }) => (
          <Link
            key={title}
            to={path}
            onClick={onClose}
            className="list-group-item list-group-item-action border-0 d-flex align-items-center gap-3 px-3 py-2"
          >
            <i className={`bi ${icon}`} />
            <span>{title}</span>
          </Link>
        ))}
      </div>
    </>
  )
}

export default SidebarItems
