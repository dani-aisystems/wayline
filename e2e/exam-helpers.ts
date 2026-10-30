import { readdirSync, readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

/** Exam tasks from the packs, for answering in tests from their own answer keys. */
type Q = { n: number; options?: string[]; correct?: number; accept?: string[]; answer?: string };
type Task = { id: string; kind: string; questions?: Q[]; extracts?: { questions: Q[] }[]; tasks?: { questions: Q[] }[] };
const dir = new URL("../src/content/exams/packs/", import.meta.url);
export const examTasks = new Map<string, Task>(
  readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => (JSON.parse(readFileSync(new URL(f, dir), "utf8")).tasks as Task[]).map((t) => [t.id, t] as const)),
);
const qs = (t: Task): Q[] => t.questions ?? t.extracts?.flatMap((e) => e.questions) ?? t.tasks?.flatMap((x) => x.questions) ?? [];

/** Answer every question of the task on screen: right, or wrong for questions where `wrong(n)` is true. */
export async function answerExamTask(page: Page, id: string, wrong: (n: number) => boolean = () => false) {
  const t = examTasks.get(id)!;
  const root = page.locator(`[data-task-id="${id}"]`);
  await expect(root).toBeVisible();
  for (const q of qs(t)) {
    const bad = wrong(q.n);
    const label = `Question ${q.n}`;
    switch (t.kind) {
      case "mc-cloze":
        await root.getByLabel(label, { exact: true }).selectOption(String(bad ? (q.correct! + 1) % 4 : q.correct));
        break;
      case "gapped-text":
        await root.getByLabel(label, { exact: true }).selectOption(bad ? (q.answer === "A" ? "B" : "A") : q.answer!);
        break;
      case "open-cloze": case "word-formation": case "kwt": case "listen-sentence":
        await root.getByLabel(label, { exact: true }).fill(bad ? "zzz" : q.accept![0]);
        break;
      case "reading-mc": case "listen-mc":
        await root.getByRole("radiogroup", { name: label, exact: true }).locator("label").nth(bad ? (q.correct! + 1) % q.options!.length : q.correct!).click();
        break;
      default: {
        const group = root.getByRole("radiogroup", { name: label, exact: true });
        const letter = bad ? (q.answer === "A" ? "B" : "A") : q.answer!;
        await group.locator("label").filter({ hasText: new RegExp(`^${letter}$`) }).click();
      }
    }
  }
}
