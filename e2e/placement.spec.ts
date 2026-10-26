import { test, expect } from "@playwright/test";
import { onboard, startAt, takeTest } from "./helpers";

test.beforeEach(({ browserName, isMobile }) => {
  test.skip(!isMobile && browserName !== "chromium", "placement journeys run on chromium + phones");
});

test("a learner who knows almost nothing is placed at the very start", async ({ page }) => {
  await onboard(page, { canRead: true, self: 0 });
  const n = await takeTest(page, "none");
  expect(n).toBeGreaterThanOrEqual(12);
  await expect(page.locator(".res-band")).toHaveText(/Pre-A1|A1/);
  await expect(page.getByText("Not assessed").first()).toBeVisible(); // speaking/writing
  await expect(page.getByText("not an official CEFR qualification")).toBeVisible();
});

test("a B1 learner is placed around B1, with a skill profile and topics to work on", async ({ page }) => {
  await onboard(page, { canRead: true, self: 2 });
  const n = await takeTest(page, "B1");
  expect(n).toBeLessThanOrEqual(30);
  await expect(page.locator(".res-band")).toHaveText(/A2|B1|B2/);
  await expect(page.locator(".res-skill")).toHaveCount(7);
  await expect(page.locator(".res-range")).toContainText(/B1/);
  await startAt(page);
  // The route starts at the accepted level, not at A1.
  await expect(page.locator(".route-stop").first()).not.toContainText("Pre-A1");
});

test("an advanced learner who rated themselves low can still reach C2", async ({ page }) => {
  await onboard(page, { canRead: true, self: 1 });
  await takeTest(page, "C2");
  await expect(page.locator(".res-band")).toHaveText(/C1|C2/);
  await expect(page.locator(".res-actions")).not.toContainText("A1");
});

test("an interrupted test resumes where it stopped", async ({ page }) => {
  await onboard(page, { canRead: true });
  await page.getByRole("button", { name: "Start the test" }).click();
  await page.getByRole("button", { name: "I don't know" }).click();
  await expect(page.locator(".pl-count")).toHaveText("Question 2");
  await page.getByRole("button", { name: "I don't know" }).click();
  await expect(page.locator(".pl-count")).toHaveText("Question 3");
  await page.reload();
  await page.getByRole("button", { name: "Continue the test" }).click();
  await expect(page.locator(".pl-count")).toHaveText("Question 3");
});

test("choosing one level lower is respected", async ({ page }) => {
  await onboard(page, { canRead: true });
  await takeTest(page, "B2");
  const lower = page.locator(".res-actions .btn").nth(1);
  const label = await lower.innerText();
  const band = label.match(/\(([^)]+)\)/)![1];
  await lower.click();
  await page.waitForURL("**/today");
  const stored = await page.evaluate(
    () => new Promise<string>((resolve) => {
      const req = indexedDB.open("wayline");
      req.onsuccess = () => {
        const g = req.result.transaction("profile").objectStore("profile").get("me");
        g.onsuccess = () => resolve(g.result.acceptedBand);
      };
    }),
  );
  expect(stored === band || (band === "Pre-A1" && stored === "preA1")).toBe(true);
});
