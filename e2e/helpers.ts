import { readdirSync, readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

type AnyItem = {
  id: string;
  type: "cloze" | "choice" | "build";
  accept?: string[];
  options?: string[];
  correct?: number;
  tiles?: string[];
};

const dir = new URL("../src/content/packs/", import.meta.url);
export const items = new Map<string, AnyItem>(
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")).items as AnyItem[])
    .map((i) => [i.id, i]),
);

/** Pick explanation language, then onboarding. */
export async function onboard(page: Page, opts: { canRead: boolean; lang?: "en" | "bg"; minutes?: 10 | 20 | 30 | 45 }) {
  await page.goto("/");
  if (opts.lang === "bg") await page.getByRole("radio", { name: /Български/ }).check();
  else await page.getByRole("radio", { name: /English only/ }).check();
  await page.locator("form").getByRole("button").click();
  await page.waitForURL("**/start");
  await page.getByRole("radio").nth(opts.canRead ? 0 : 1).check();
  await page.getByRole("button", { name: /Next|Напред/ }).click();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: /Next|Напред/ }).click();
  await page.getByRole("button", { name: /Next|Напред/ }).click();
  const minutes = [10, 20, 30, 45].indexOf(opts.minutes ?? 10);
  await page.getByRole("radio").nth(minutes).check();
  await page.getByRole("button", { name: /Start learning|Започни/ }).click();
  await page.waitForURL("**/today");
}

/** Answer the exercise on screen. mode: right first time, wrong then right, or give up. */
export async function answerExercise(page: Page, mode: "right" | "wrong-then-right" | "give-up" = "right") {
  const ex = page.locator(".exercise");
  const id = await ex.getAttribute("data-item-id");
  const item = items.get(id!);
  expect(item, `unknown item ${id}`).toBeTruthy();
  const check = page.getByRole("button", { name: /^(Check|Провери)$/ });

  const giveWrong = async () => {
    if (item!.type === "choice") {
      const wrong = item!.options!.findIndex((_, i) => i !== item!.correct);
      await ex.locator(".choice").nth(wrong).click();
    } else if (item!.type === "cloze") {
      await ex.getByRole("textbox").fill("zzz");
    } else {
      await ex.locator(".build-bank .tile").last().click();
    }
    await check.click();
  };
  const giveRight = async () => {
    if (item!.type === "choice") {
      await ex.locator(".choice", { hasText: item!.options![item!.correct!] }).first().click();
    } else if (item!.type === "cloze") {
      await ex.getByRole("textbox").fill(item!.accept![0]);
    } else {
      const clear = page.getByRole("button", { name: /^(Clear|Изчисти)$/ });
      if (await clear.isVisible()) await clear.click();
      const words = item!.accept![0].replace(/[.!?]$/, "").split(" ");
      const bank = ex.locator(".build-bank .tile:not([disabled])");
      for (const w of words) {
        await bank.filter({ hasText: new RegExp(`^${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[.!?]?$`, "i") }).first().click();
      }
    }
    await check.click();
  };

  if (mode === "right") await giveRight();
  else if (mode === "wrong-then-right") {
    await giveWrong();
    await expect(page.locator(".feedback-wrong")).toBeVisible();
    await giveRight();
  } else {
    await giveWrong();
    await page.getByRole("button", { name: /^(Show answer|Покажи отговора)$/ }).click();
  }
  await expect(page.locator(".feedback-right, .feedback-shown")).toBeVisible();
  await page.getByRole("button", { name: /^(Continue|Продължи)$/ }).click();
}

/** Run a whole session, answering every exercise; returns how many exercises were answered. */
export async function runSession(page: Page, modeFor: (n: number) => "right" | "wrong-then-right" | "give-up" = () => "right") {
  let n = 0;
  const bar = page.getByRole("progressbar");
  const anyStep = page.locator(".exercise, .step-word, .step-note, .step-text, .step-summary").first();
  for (let guard = 0; guard < 80; guard++) {
    await anyStep.waitFor();
    if (await page.locator(".step-summary").isVisible()) return n;
    const before = await bar.getAttribute("aria-valuenow");
    if (await page.locator(".exercise").isVisible()) {
      await answerExercise(page, modeFor(n++));
    } else if (await page.locator(".step-word").isVisible()) {
      await page.getByRole("button", { name: /Show meaning|Покажи значението/ }).click();
      await page.getByRole("button", { name: /^(Knew it|Знаех я)$/ }).click();
    } else {
      await page.getByRole("button", { name: /^(Continue|Продължи)$/ }).click();
    }
    await expect(bar).not.toHaveAttribute("aria-valuenow", before!);
  }
  throw new Error("session did not finish");
}

/** Simulate time away: move every stored card's due and last-review dates back by `days`. */
export async function ageCards(page: Page, days: number) {
  await page.evaluate(
    (ms) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("wayline");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction("cards", "readwrite");
          const store = tx.objectStore("cards");
          store.openCursor().onsuccess = (e) => {
            const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (!cur) return;
            const c = cur.value;
            c.fsrs.due = new Date(c.fsrs.due.getTime() - ms);
            if (c.fsrs.last_review) c.fsrs.last_review = new Date(c.fsrs.last_review.getTime() - ms);
            cur.update(c);
            cur.continue();
          };
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
        };
      }),
    days * 86_400_000,
  );
}

/** Add n practised item cards, all due now (a big backlog). */
export async function seedBacklog(page: Page, ids: string[]) {
  await page.evaluate(
    (ids) =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open("wayline");
        req.onsuccess = () => {
          const tx = req.result.transaction("cards", "readwrite");
          const past = new Date(Date.now() - 9 * 86_400_000);
          for (const id of ids)
            tx.objectStore("cards").put({
              id: `item:${id}`, kind: "item", ref: id, lastOutcome: "first", createdAt: past.toISOString(),
              fsrs: { due: new Date(Date.now() - 86_400_000), stability: 3, difficulty: 5, elapsed_days: 0, scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: past },
            });
          tx.oncomplete = () => { req.result.close(); resolve(); };
        };
      }),
    ids,
  );
}
