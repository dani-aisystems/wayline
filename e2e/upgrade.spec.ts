import { expect, test } from "@playwright/test";

/**
 * Journey 7 — existing-user upgrade. A learner from Wayline 0.1 (Dexie schema v1, IndexedDB version 10)
 * opens the upgraded app. Their profile, progress and mistakes must survive, they must not be sent back
 * through onboarding, and the new level test is offered rather than forced.
 */
test("a version 0.1 learner keeps all progress after the upgrade", async ({ page }) => {
  await page.goto("/favicon.ico"); // same origin, without starting the app
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("wayline", 10); // Dexie stores version n as n × 10
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore("profile", { keyPath: "id" });
          const cards = db.createObjectStore("cards", { keyPath: "id" });
          cards.createIndex("kind", "kind");
          cards.createIndex("ref", "ref");
          cards.createIndex("fsrs.due", "fsrs.due");
          db.createObjectStore("reviews", { keyPath: "id", autoIncrement: true }).createIndex("cardId", "cardId");
          db.createObjectStore("mastery", { keyPath: "competence" });
          const m = db.createObjectStore("mistakes", { keyPath: "id", autoIncrement: true });
          m.createIndex("itemId", "itemId");
          m.createIndex("competence", "competence");
          db.createObjectStore("activity", { keyPath: "day" });
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["profile", "cards", "mastery", "mistakes", "activity"], "readwrite");
          const at = new Date(Date.now() - 3 * 86_400_000);
          const card = (id: string) => ({
            id: `item:${id}`, kind: "item", ref: id, createdAt: at.toISOString(),
            fsrs: { due: new Date(Date.now() + 5 * 86_400_000), stability: 4, difficulty: 5, elapsed_days: 0, scheduled_days: 8, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: at },
          });
          tx.objectStore("profile").put({
            id: "me", createdAt: at.toISOString(), explanationLanguage: "en", theme: "system", interests: [],
            dailyMinutes: 20, placedBand: "A1", acceptedBand: "A1", onboardedAt: at.toISOString(),
          });
          for (const id of ["a1.hello.be-am", "a1.hello.my-name-is", "a1.hello.whats-your-name"]) tx.objectStore("cards").put(card(id));
          tx.objectStore("mastery").put({ competence: "a1.hello", correct: 2, attempts: 3, hintsUsed: 1, updatedAt: at.toISOString() });
          tx.objectStore("mistakes").put({ itemId: "a1.hello.my-name-is", competence: "a1.hello", tags: [], given: "My name are Ana", at: at.toISOString(), resolved: false });
          tx.objectStore("activity").put({ day: at.toISOString().slice(0, 10), minutes: 9, reviews: 0, newItems: 3 });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

  await page.goto("/");
  // Straight to the dashboard: no onboarding, no forced test.
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator(".journey-stats")).toContainText("3 of");
  await expect(page.getByRole("link", { name: /Take the level test|level test/i }).first()).toBeVisible();

  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.getByRole("link", { name: /Mistake notebook/ }).click();
  await expect(page.locator(".mis-card")).toContainText("My name are Ana");

  const stored = await page.evaluate(
    () =>
      new Promise<{ version: number; source: string; cards: number }>((resolve) => {
        const req = indexedDB.open("wayline");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["profile", "cards"], "readonly");
          const p = tx.objectStore("profile").get("me");
          const c = tx.objectStore("cards").count();
          tx.oncomplete = () => resolve({ version: db.version, source: p.result.placementSource, cards: c.result });
        };
      }),
  );
  expect(stored).toEqual({ version: 20, source: "reading-check", cards: 3 });
});
