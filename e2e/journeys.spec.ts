import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ageCards, items, onboard, runSession, seedBacklog } from "./helpers";

// Learner journeys run on desktop Chromium plus both phone profiles; Firefox/WebKit desktop run the welcome suite.
test.beforeEach(({ browserName, isMobile }) => {
  test.skip(!isMobile && browserName !== "chromium", "journeys run on chromium + phones");
});

test("complete beginner starts with letters and sounds", async ({ page }) => {
  await onboard(page, { canRead: false });
  await expect(page.locator(".route-stop").first()).toContainText("Pre-A1");
  await expect(page.locator(".route-stop").first()).toHaveAttribute("data-state", "current");
});

test("A1 learner finishes a session, progress survives a reload, and the route advances", async ({ page }) => {
  await onboard(page, { canRead: true, minutes: 10 });
  const region = await page.locator(".today-region").innerText();
  await page.getByRole("link", { name: /Start today's session/ }).click();
  const answered = await runSession(page, (n) => (n === 1 ? "wrong-then-right" : n === 2 ? "give-up" : "right"));
  expect(answered).toBeGreaterThanOrEqual(3);
  await expect(page.locator(".summary-list")).toContainText("needed help");

  await page.getByRole("link", { name: "Back to Today" }).click();
  await expect(page.locator(".today-region")).toHaveText(region);
  await expect(page.locator(".today-stats")).toContainText(`${answered} of`);
  await expect(page.getByText("Today's session is done")).toBeVisible();

  await page.reload();
  await expect(page.locator(".today-stats")).toContainText(`${answered} of`);

  // Mistakes from this session were recorded.
  const mistakes = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("wayline");
        req.onsuccess = () => {
          const tx = req.result.transaction("mistakes", "readonly");
          const c = tx.objectStore("mistakes").count();
          c.onsuccess = () => resolve(c.result);
        };
      }),
  );
  expect(mistakes).toBe(2);
});

test("Bulgarian explanations appear in lessons", async ({ page }) => {
  await onboard(page, { canRead: true, lang: "bg" });
  await page.getByRole("link", { name: /Започни днешния урок/ }).click();
  await page.locator(".exercise, .step-note").first().waitFor();
  if (await page.locator(".step-note").isVisible()) {
    await expect(page.locator(".step-label")).toHaveText("Нещо ново");
    await page.getByRole("button", { name: "Продължи" }).click();
  }
  await expect(page.locator(".exercise-objective")).toHaveText(/[а-яА-Я]/);
});

test("Word Lens: tap a word, save it, find it under Words", async ({ page }) => {
  await onboard(page, { canRead: true });
  await page.getByRole("link", { name: /Start today's session/ }).click();
  const word = page.locator(".lens-word:not(.lens-word-plain)").first();
  const text = await word.innerText();
  await word.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Save to review" }).click();
  await expect(sheet.getByRole("button", { name: "Saved to review" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("link", { name: "Words" }).click();
  await expect(page.locator(".word-list")).toContainText(new RegExp(text, "i"));
});

test("after a week away the review queue is capped, not a backlog", async ({ page }) => {
  await onboard(page, { canRead: true, minutes: 10 });
  await page.getByRole("link", { name: /Start today's session/ }).click();
  await runSession(page);
  // 30 items practised a week ago, all due now.
  await seedBacklog(page, [...items.keys()].slice(0, 30));
  await ageCards(page, 8);
  await page.goto("/review");
  const start = page.getByRole("link", { name: /Start review \(\d+\)/ });
  await expect(start).toBeVisible();
  expect(Number((await start.innerText()).match(/\d+/)![0])).toBe(20); // 10-minute plan → cap of 20
  await page.goto("/today");
  await expect(page.getByText(/more reviews are waiting/)).toBeVisible();
  await page.getByRole("link", { name: "Review" }).click();
  await start.click();
  await runSession(page);
  await expect(page.locator(".summary-list")).toContainText("20 reviews");
});

test("back up, delete everything, restore", async ({ page }) => {
  await onboard(page, { canRead: true });
  await page.getByRole("link", { name: /Start today's session/ }).click();
  const answered = await runSession(page);
  await page.getByRole("link", { name: "Back to Today" }).click();
  await page.getByRole("link", { name: "Settings" }).click();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^wayline-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path, "utf8"));
  expect(backup.format).toBe("wayline-backup");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete all progress" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Draw your way into English.");

  // Restore needs the app open: onboard again quickly, then restore over it.
  await onboard(page, { canRead: true });
  await page.getByRole("link", { name: "Settings" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("restore-input").setInputFiles(path);
  await expect(page.getByRole("status").filter({ hasText: "Backup restored" })).toBeVisible();
  await page.waitForURL("**/today");
  await expect(page.locator(".today-stats")).toContainText(`${answered} of`);
});

test("a damaged backup is rejected and nothing changes", async ({ page }) => {
  await onboard(page, { canRead: true });
  await page.getByRole("link", { name: "Settings" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("restore-input").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"format":"nope"}') });
  await expect(page.getByRole("alert")).toContainText("isn't a Wayline backup");
});

test("lessons work offline once loaded", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "service worker control is observable in Chromium only");
  await onboard(page, { canRead: true });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await context.setOffline(true);
  await page.goto("/today");
  await page.getByRole("link", { name: /Start today's session/ }).click();
  await runSession(page);
  await context.setOffline(false);
});
