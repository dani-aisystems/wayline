import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("welcome and explanation language", () => {
  test("loads with the tagline and an English-only default on an English device", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Draw your way into English.");
    await expect(page.getByRole("radio", { name: /English only/ })).toBeChecked();
  });

  test("choosing Bulgarian switches the interface and survives a reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: /Български/ }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/start");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Можеш ли да прочетеш това изречение?");
    await expect(page.locator("html")).toHaveAttribute("lang", "bg");

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Начертай своя път към английския.");
    await expect(page.getByRole("radio", { name: /Български/ })).toBeChecked();
  });

  test("theme choice is applied and saved", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Theme").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("has no serious accessibility violations, light and dark", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious, serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`).join("\n")).toEqual([]);
    }
  });

  test("makes no requests to other origins", async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const external: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.protocol.startsWith("http") && u.origin !== origin) external.push(r.url());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(external).toEqual([]);
  });

  test("keyboard users can reach and use every control", async ({ page, browserName, isMobile }) => {
    test.skip(isMobile, "keyboard path is a desktop concern");
    test.skip(browserName === "webkit", "Safari only tabs to form controls when the OS setting is on");
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Theme")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("radio", { name: /English only/ })).toBeFocused();
  });
});

test.describe("Bulgarian device", () => {
  test.use({ locale: "bg-BG" });
  test("defaults explanations to Bulgarian before the learner chooses", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("radio", { name: /Български/ })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("lang", "bg");
  });
});

test.describe("layout", () => {
  for (const width of [320, 360, 390, 768, 1280, 1920]) {
    test(`no horizontal scroll at ${width}px`, async ({ page, isMobile }) => {
      test.skip(isMobile, "width sweep runs on desktop projects");
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("touch targets are at least 44px tall on phones", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone-only check");
    await page.goto("/");
    for (const el of await page.locator("button, select, label.lang-option").all()) {
      const box = await el.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("offline", () => {
  test("loads offline after the first visit", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "service-worker control is only observable in Chromium");
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // now controlled by the service worker
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await context.setOffline(false);
  });
});
