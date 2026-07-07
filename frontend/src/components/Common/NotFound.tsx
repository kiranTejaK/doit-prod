import { Link } from "react-router-dom"

const NotFound = () => {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center vh-100 p-4">
      <h1 className="display-1 fw-bold mb-2">404</h1>
      <h2 className="h4 fw-bold mb-2">Oops!</h2>
      <p className="text-secondary text-center mb-4">
        The page you are looking for was not found.
      </p>
      <Link to="/" className="btn btn-primary mt-2">
        Go Back
      </Link>
    </div>
  )
}

export default NotFound
