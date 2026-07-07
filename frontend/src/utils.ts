export const emailPattern = {
  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
  message: "Invalid email address",
}

export const passwordRules = {
  minLength: 8,
  message: "Password must be at least 8 characters",
}
