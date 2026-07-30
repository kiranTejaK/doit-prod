import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * cn() — Merge Tailwind utility classes safely.
 * Combines clsx for conditional logic + tailwind-merge to resolve conflicts.
 *
 * @example
 *   cn("px-4 py-2", isActive && "bg-primary", "px-2") // → "py-2 bg-primary px-2"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
