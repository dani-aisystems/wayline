import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Learner journeys include a full placement test plus a lesson.
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: `npm run preview -- --port ${PORT} --strictPort`, port: PORT, reuseExistingServer: !process.env.CI },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
  ],
});
