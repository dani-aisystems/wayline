import { test } from "@playwright/test";
import { onboardA1, runSession } from "./helpers";

/** Visual review screenshots. Run with SHOTS=1; skipped in the normal suite. */
test.skip(!process.env.SHOTS, "screenshots only on demand");

test("screens", async ({ page }, info) => {
  const dir = `screenshots/${info.project.name}`;
  await onboardA1(page, { minutes: 10 });
  await page.getByRole("link", { name: /^(Start today's session|Continue learning)$/ }).click();
  await runSession(page, (n) => (n === 0 ? "give-up" : "right"));
  await page.getByRole("link", { name: "Back to Today" }).click();
  await page.locator(".dash-hero").waitFor();
  await page.screenshot({ path: `${dir}/dashboard.png`, fullPage: true });
  for (const p of ["/library", "/library/words", "/library/mistakes", "/library/grammar", "/library/alphabet", "/library/reading", "/library/cefr"]) {
    await page.getByRole("link", { name: "Library", exact: true }).click();
    if (p !== "/library") await page.locator(`a[href="${p}"]`).first().click();
    await page.locator(".page-title").first().waitFor();
    await page.screenshot({ path: `${dir}/${p.replace(/\//g, "_").slice(1)}.png`, fullPage: true });
  }
});
