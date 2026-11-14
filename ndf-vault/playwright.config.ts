import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the self-contained page (`npm run build:page`),
 * which is exactly what gets hosted.
 */
// Without a UTF-8 locale, headless Chromium replaces any download name that has an accent with "download".
const utf8 = /utf-?8/i.test(process.env.LC_ALL ?? process.env.LANG ?? "") ? {} : { LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "fr-CA",
    timezoneId: "America/Toronto",
    trace: "off",
    viewport: { width: 1440, height: 900 },
    launchOptions: { env: { ...(process.env as Record<string, string>), ...utf8 } },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: "node scripts/serve-dist.mjs", url: "http://127.0.0.1:4173/preview.html", reuseExistingServer: !process.env.CI, timeout: 20_000 },
});
