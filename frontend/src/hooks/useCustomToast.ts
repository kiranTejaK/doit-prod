// Simple toast using DOM-based Bootstrap toast
const useCustomToast = () => {
  const showToast = (
    title: string,
    description: string,
    type: "success" | "error",
  ) => {
    let container = document.getElementById("toast-container")
    if (!container) {
      container = document.createElement("div")
      container.id = "toast-container"
      container.className = "toast-container position-fixed top-0 end-0 p-3"
      container.style.zIndex = "9999"
      document.body.appendChild(container)
    }

    const toastEl = document.createElement("div")
    toastEl.className = `toast show border-0 ${type === "success" ? "bg-success" : "bg-danger"} text-white`
    toastEl.setAttribute("role", "alert")
    toastEl.innerHTML = `
      <div class="toast-header ${type === "success" ? "bg-success" : "bg-danger"} text-white">
        <strong class="me-auto">${title}</strong>
        <button type="button" class="btn-close btn-close-white" onclick="this.closest('.toast').remove()"></button>
      </div>
      <div class="toast-body">${description}</div>
    `
    container.appendChild(toastEl)
    setTimeout(() => {
      toastEl.remove()
    }, 4000)
  }

  const showSuccessToast = (description: string) =>
    showToast("Success!", description, "success")
  const showErrorToast = (description: string) =>
    showToast("Error!", description, "error")

  return { showSuccessToast, showErrorToast }
}

export default useCustomToast
