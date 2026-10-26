import { readdirSync, readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

type AnyItem = {
  id: string;
  type: "cloze" | "choice" | "build" | "fix" | "speak" | "listen" | "dialogue";
  accept?: string[];
  options?: string[];
  correct?: number;
  tiles?: string[];
  lines?: ({ by: string; text: string } | { learner: true; options: { text: string; correct: boolean }[] })[];
};

/**
 * Oral items. Speaking uses the "continue without microphone" path (no real mic in CI) and self-assessment;
 * listening and dialogue are choices. "wrong" modes pick a wrong option first where the item has one.
 */
async function answerOral(page: Page, item: AnyItem, mode: "right" | "wrong-then-right" | "give-up") {
  const ex = page.locator(".exercise");
  if (item.type === "speak") {
    await ex.getByRole("button", { name: /^(Continue without microphone|Продължи без микрофон)$/ }).click();
    await ex.getByRole("button", { name: mode === "right" ? /^(I said it clearly|Казах го ясно)$/ : /^(I need more practice|Трябва ми още практика)$/ }).click();
    return;
  }
  if (item.type === "listen") {
    if (mode !== "right") {
      const wrong = item.options!.findIndex((_, i) => i !== item.correct);
      await ex.locator(".choice").nth(wrong).click();
      await page.getByRole("button", { name: /^(Check|Провери)$/ }).click();
      await expect(page.locator(".feedback-wrong")).toBeVisible();
    }
    await ex.locator(".choice").nth(item.correct!).click();
    await page.getByRole("button", { name: /^(Check|Провери)$/ }).click();
    await page.getByRole("button", { name: /^(Continue|Продължи)$/ }).click();
    return;
  }
  // dialogue: answer each learner turn in order
  const turns = item.lines!.filter((l): l is Extract<typeof l, { learner: true }> => "learner" in l);
  for (const [n, turn] of turns.entries()) {
    const options = ex.locator(".dlg-turn .dlg-option");
    await options.first().waitFor();
    const right = turn.options.findIndex((o) => o.correct);
    if (mode !== "right" && n === 0) {
      await options.nth(turn.options.findIndex((o) => !o.correct)).click();
      await expect(ex.locator(".dlg-turn .feedback-wrong")).toBeVisible();
    }
    await options.nth(right).click();
  }
  await page.getByRole("button", { name: /^(Continue|Продължи)$/ }).click();
}

const dir = new URL("../src/content/packs/", import.meta.url);
export const items = new Map<string, AnyItem>(
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")).items as AnyItem[])
    .map((i) => [i.id, i]),
);

type Band = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
const BAND_ORDER = ["preA1", "A1", "A2", "B1", "B2", "C1", "C2"];
type DiagItem = { id: string; band: Band; type: "choice" | "cloze"; prompt?: string; sentence?: string; passage?: string; options?: string[]; correct?: number; accept?: string[] };
const bankFile = new URL("../src/content/diagnostic/bank.json", import.meta.url);
export const diag: DiagItem[] = JSON.parse(readFileSync(bankFile, "utf8")).items;

/** Pick explanation language, then the onboarding questions. Learners who can read go on to the level test. */
export async function onboard(page: Page, opts: { canRead: boolean; lang?: "en" | "bg"; minutes?: 10 | 20 | 30 | 45; self?: number }) {
  await page.goto("/");
  if (opts.lang === "bg") await page.getByRole("radio", { name: /Български/ }).check();
  else await page.getByRole("radio", { name: /English only/ }).check();
  await page.locator("form").getByRole("button").click();
  await page.waitForURL("**/start");
  const next = page.getByRole("button", { name: /^(Next|Напред)$/ });
  const pick = async (i: number) => {
    await expect(page.locator(".onb-option").first()).toBeVisible();
    await expect(async () => {
      await page.locator(".onb-option").nth(i).click();
      await expect(page.getByRole("radio").nth(i)).toBeChecked({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
  };
  await pick(opts.canRead ? 0 : 1);
  await next.click();
  await pick(0); // goal
  await next.click();
  await next.click(); // skills (optional)
  await next.click(); // interests (optional)
  const minutes = [10, 20, 30, 45].indexOf(opts.minutes ?? 10);
  await pick(minutes);
  if (!opts.canRead) {
    await page.getByRole("button", { name: /Start learning|Започни/ }).click();
    await page.waitForURL("**/today");
    return;
  }
  await next.click();
  await pick(opts.self ?? 5); // "I'm not sure"
  await page.getByRole("button", { name: /Continue to the level test|Към теста за ниво/ }).click();
  await page.waitForURL("**/placement");
}

/**
 * Take the level test as a learner whose real level is `level`: items at or below it are answered correctly,
 * harder ones with "I don't know". Returns the number of questions asked.
 */
export async function takeTest(page: Page, level: Band | "none") {
  await page.getByRole("button", { name: /^(Start the test|Започни теста)$/ }).click();
  let n = 0;
  for (; n < 50; n++) {
    if (page.url().includes("/placement/result")) break;
    const q = page.locator(".pl-q");
    try {
      await q.waitFor({ timeout: 4000 });
    } catch {
      if (page.url().includes("/placement/result")) break;
      throw new Error("no question shown");
    }
    const heading = await page.locator(".pl-count").innerText();
    const prompt = (await q.locator("legend, .cloze-sentence").first().innerText()).trim();
    const item = diag.find((i) => (i.prompt ?? "").trim() === prompt || (i.sentence ?? "").replace("___", "").replace(/\s+/g, " ").trim() === prompt.replace(/\s+/g, " ").trim());
    expect(item, `unknown placement item: ${prompt}`).toBeTruthy();
    const knows = level !== "none" && BAND_ORDER.indexOf(item!.band) <= BAND_ORDER.indexOf(level);
    if (!knows) await page.getByRole("button", { name: /^(I don't know|Не знам)$/ }).click();
    else {
      if (item!.type === "choice") await q.locator(".choice").nth(item!.correct!).click();
      else await q.getByRole("textbox").fill(item!.accept![0]);
      await page.getByRole("button", { name: /^(Next|Напред)$/ }).click();
    }
    await expect(page.locator(".pl-count")).not.toHaveText(heading, { timeout: 4000 }).catch(() => {});
  }
  await page.waitForURL("**/placement/result/**");
  return n;
}

/** On the results screen, start at a given level (recommended, one lower or one higher). */
export async function startAt(page: Page, band?: string) {
  const buttons = page.locator(".res-actions .btn");
  if (!band) await buttons.first().click();
  else await buttons.filter({ hasText: new RegExp(`\\b${band === "preA1" ? "Pre-A1" : band}\\b`) }).first().click();
  await page.waitForURL("**/today");
}

/** Shortcut used by lesson tests: onboard, take the test as an A1 learner, start at A1. */
export async function onboardA1(page: Page, opts: { lang?: "en" | "bg"; minutes?: 10 | 20 | 30 | 45 } = {}) {
  await onboard(page, { canRead: true, ...opts });
  await takeTest(page, "A1");
  await startAt(page, "A1");
}

/** Answer the exercise on screen. mode: right first time, wrong then right, or give up. */
export async function answerExercise(page: Page, mode: "right" | "wrong-then-right" | "give-up" = "right") {
  const ex = page.locator(".exercise");
  const id = await ex.getAttribute("data-item-id");
  const item = items.get(id!);
  expect(item, `unknown item ${id}`).toBeTruthy();
  if (item!.type === "speak" || item!.type === "listen" || item!.type === "dialogue") {
    await answerOral(page, item!, mode);
    return;
  }
  const check = page.getByRole("button", { name: /^(Check|Провери)$/ });

  const giveWrong = async () => {
    if (item!.type === "choice") {
      const wrong = item!.options!.findIndex((_, i) => i !== item!.correct);
      await ex.locator(".choice").nth(wrong).click();
    } else if (item!.type === "cloze" || item!.type === "fix") {
      await ex.getByRole("textbox").fill("zzz");
    } else {
      await ex.locator(".build-bank .tile").last().click();
    }
    await check.click();
  };
  const giveRight = async () => {
    if (item!.type === "choice") {
      await ex.locator(".choice", { hasText: item!.options![item!.correct!] }).first().click();
    } else if (item!.type === "cloze" || item!.type === "fix") {
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
