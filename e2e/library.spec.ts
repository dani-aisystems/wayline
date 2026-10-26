import { expect, test, type Page } from "@playwright/test";
import { answerExercise, onboardA1, runSession } from "./helpers";

const START = /^(Start today's session|Continue learning)$/;

async function count(page: Page, store: string): Promise<number> {
  return page.evaluate(
    (s) =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("wayline");
        req.onsuccess = () => {
          const c = req.result.transaction(s, "readonly").objectStore(s).count();
          c.onsuccess = () => resolve(c.result);
        };
      }),
    store,
  );
}

test("dashboard shows only real data before and after a session", async ({ page }) => {
  await onboardA1(page, { minutes: 10 });
  const xpCard = page.locator("section", { has: page.getByRole("heading", { name: "Experience", exact: true }) });
  // The level test is the only XP so far; skills not covered by the test say so.
  const before = Number((await xpCard.locator(".xp-total").innerText()).replace(/\D/g, ""));
  expect(before).toBe(25);
  await expect(page.getByText("Finish a lesson to earn your first one.")).toBeVisible();
  await expect(page.getByText("Not measured yet").first()).toBeVisible();

  await page.getByRole("link", { name: START }).click();
  const answered = await runSession(page, (n) => (n === 0 ? "wrong-then-right" : "right"));
  await page.getByRole("link", { name: "Back to Today" }).click();

  const xpText = await xpCard.locator(".xp-total").innerText();
  expect(Number(xpText.replace(/\D/g, "")) - before).toBeGreaterThanOrEqual(answered * 5);
  await expect(page.getByText("First lesson finished")).toBeVisible();
  await expect(page.getByRole("img", { name: /Minutes studied per day/ })).toBeVisible();

  // Reloading can't pay XP twice.
  const rows = await count(page, "xp");
  await page.reload();
  await expect(xpCard.locator(".xp-total")).toHaveText(xpText);
  expect(await count(page, "xp")).toBe(rows);
});

test("vocabulary: save a word, see its state, mark it known without it becoming mastered", async ({ page }) => {
  await onboardA1(page);
  await page.getByRole("link", { name: START }).click();
  const word = page.locator(".lens-word:not(.lens-word-plain)").first();
  const text = (await word.innerText()).toLowerCase();
  await word.click();
  await page.getByRole("dialog").getByRole("button", { name: "Save to review" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "End session" }).click();

  await page.getByRole("link", { name: "Library" }).click();
  await page.getByRole("link", { name: /My vocabulary/ }).click();
  const row = page.locator(".lib-word").filter({ hasText: new RegExp(text, "i") });
  await expect(row.locator(".state-pill")).toHaveText("New");
  await row.getByRole("button", { name: "Review history" }).click();
  await expect(row).toContainText("Not reviewed yet");

  await row.getByRole("button", { name: "I already know this" }).click();
  await expect(page.getByText("Marked as known")).toBeVisible();
  await expect(row.locator(".state-pill")).not.toHaveText(/New|Mastered|Strong/);
  await expect(row).toContainText("Easy");

  await page.getByRole("button", { name: /^New/ }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: /^All/ }).click();
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".lib-word")).toHaveCount(0);
});

test("mistake notebook: wrong answers appear, practising them right moves them to fixed", async ({ page }) => {
  await onboardA1(page, { minutes: 10 });
  await page.getByRole("link", { name: START }).click();
  await runSession(page, (n) => (n === 0 ? "give-up" : "right"));
  await page.getByRole("link", { name: "Back to Today" }).click();

  await page.getByRole("link", { name: "Library" }).click();
  await page.getByRole("link", { name: /Mistake notebook/ }).click();
  const card = page.locator(".mis-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("You answered");
  await expect(card).toContainText("Correct answer");

  await card.getByRole("link", { name: "Practise again" }).click();
  await answerExercise(page, "right");
  await expect(page.getByText(/1 of 1 right first time/)).toBeVisible();
  await page.getByRole("link", { name: "Back to the library" }).click();
  await page.getByRole("link", { name: /Mistake notebook/ }).click();
  await expect(page.locator(".mis-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Fixed" }).click();
  await expect(page.locator(".mis-card")).toHaveCount(1);
});

test("library search finds words, grammar and texts; alphabet and reference pages work", async ({ page }) => {
  await onboardA1(page);
  await page.getByRole("link", { name: "Library" }).click();
  const search = page.getByRole("searchbox", { name: "Search the library" });
  await search.fill("hello");
  await expect(page.locator(".hit").first()).toContainText(/hello/i);
  await search.fill("qqqzzz");
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await search.fill("");

  await page.getByRole("link", { name: /Grammar/ }).click();
  await expect(page.locator(".gram-card").first()).toBeVisible();
  await page.getByRole("link", { name: "Practise", exact: true }).first().click();
  await expect(page.locator(".exercise")).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();

  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.getByRole("link", { name: /Alphabet/ }).click();
  await page.getByRole("button", { name: /^Q,/ }).click();
  await expect(page.locator(".abc-detail")).toContainText("cue");
  const q = await page.locator(".card", { hasText: "Quick check" }).locator("p").first().innerText();
  const letter = q.match(/letter (\w)/)![1].toLowerCase();
  await page.locator(".card", { hasText: "Quick check" }).getByRole("button", { name: new RegExp(`^${letter}`, "i") }).click();
  await expect(page.getByText("Right.")).toBeVisible();

  await page.getByRole("link", { name: "← Library" }).click();
  await page.getByRole("link", { name: /CEFR levels/ }).click();
  await expect(page.locator(".cefr-card")).toHaveCount(6);
  await expect(page.locator('.cefr-card[aria-current="true"]')).toContainText("A1");
});

test("expressions: filter, read usage, save one and find it in My vocabulary", async ({ page }) => {
  await onboardA1(page);
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.getByRole("link", { name: /Expressions & phrases/ }).click();
  await page.getByRole("button", { name: "Idioms" }).click();
  await expect(page.locator(".expr-card", { hasText: "read between the lines" })).toBeVisible();
  await expect(page.locator(".expr-card", { hasText: "Nice to meet you" })).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();
  const card = page.locator(".expr-card", { hasText: "I'm inclined to agree" });
  await expect(card).toContainText("When to use it");
  await expect(card).toContainText("Formal");
  await card.getByRole("button", { name: "Save to review" }).click();
  await expect(card.getByText("Saved")).toBeVisible();

  await page.getByRole("link", { name: "← Library" }).click();
  await page.getByRole("link", { name: /My vocabulary/ }).click();
  await expect(page.locator(".lib-word", { hasText: "I'm inclined to agree" }).locator(".state-pill")).toHaveText("New");
});
