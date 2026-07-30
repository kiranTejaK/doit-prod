import { useEffect, useState } from "react"

type Theme = "light" | "dark" | "system"

/**
 * useTheme — Dark mode toggle using Tailwind's `.dark` class on <html>.
 *
 * Replaces the old Bootstrap `data-bs-theme` attribute approach.
 * Persists preference to localStorage and respects system preference.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme) || "system"
  })

  const resolvedTheme = (() => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
    }
    return theme
  })()

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("dark", "light")

    if (resolvedTheme === "dark") {
      root.classList.add("dark")
    }
  }, [resolvedTheme])

  // Keep in sync with system preference changes
  useEffect(() => {
    if (theme !== "system") return

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      const root = document.documentElement
      root.classList.remove("dark", "light")
      if (media.matches) root.classList.add("dark")
    }

    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem("theme", newTheme)
    setThemeState(newTheme)
  }

  return { theme, resolvedTheme, setTheme }
}
