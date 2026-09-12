import { expect, test } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"

test.use({ storageState: { cookies: [], origins: [] } })

test.describe("Frontend Refresh Token Authentication Lifecycle", () => {
  test("successful login stores access and refresh tokens", async ({
    page,
  }) => {
    await page.goto("/login")
    await page.getByPlaceholder("Email").fill(firstSuperuser)
    await page
      .getByPlaceholder("Password", { exact: true })
      .fill(firstSuperuserPassword)
    await page.getByRole("button", { name: "Log In" }).click()

    await page.waitForURL("/")

    const accessToken = await page.evaluate(() =>
      localStorage.getItem("access_token"),
    )
    const refreshToken = await page.evaluate(() =>
      localStorage.getItem("refresh_token"),
    )

    expect(accessToken).toBeTruthy()
    expect(refreshToken).toBeTruthy()
  })

  test("automatic token refresh on 401 unauthorized request", async ({
    page,
  }) => {
    // 1. Log in first
    await page.goto("/login")
    await page.getByPlaceholder("Email").fill(firstSuperuser)
    await page
      .getByPlaceholder("Password", { exact: true })
      .fill(firstSuperuserPassword)
    await page.getByRole("button", { name: "Log In" }).click()
    await page.waitForURL("/")

    const initialRefreshToken = await page.evaluate(() =>
      localStorage.getItem("refresh_token"),
    )
    expect(initialRefreshToken).toBeTruthy()

    // 2. Set an expired/bogus access token in localStorage to induce a 401
    await page.evaluate(() =>
      localStorage.setItem("access_token", "invalid_expired_token"),
    )

    // 3. Track network calls to /api/v1/login/refresh-token
    let refreshCalls = 0
    await page.route("**/api/v1/login/refresh-token", async (route) => {
      refreshCalls++
      await route.continue()
    })

    // 4. Trigger an authenticated API request
    await page.reload()
    await page.waitForURL("/")

    // The user should still be logged in because of silent refresh
    const newAccessToken = await page.evaluate(() =>
      localStorage.getItem("access_token"),
    )
    expect(newAccessToken).toBeTruthy()
    expect(newAccessToken).not.toBe("invalid_expired_token")
    expect(refreshCalls).toBeGreaterThanOrEqual(1)
  })

  test("logout revokes tokens and navigates to login", async ({ page }) => {
    await page.goto("/login")
    await page.getByPlaceholder("Email").fill(firstSuperuser)
    await page
      .getByPlaceholder("Password", { exact: true })
      .fill(firstSuperuserPassword)
    await page.getByRole("button", { name: "Log In" }).click()
    await page.waitForURL("/")

    await page.getByTestId("user-menu").click()
    await page.getByRole("menuitem", { name: "Log out" }).click()
    await page.waitForURL("/login")

    const accessToken = await page.evaluate(() =>
      localStorage.getItem("access_token"),
    )
    const refreshToken = await page.evaluate(() =>
      localStorage.getItem("refresh_token"),
    )

    expect(accessToken).toBeNull()
    expect(refreshToken).toBeNull()
  })
})
