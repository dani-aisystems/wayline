import { expect, test, type Page } from "@playwright/test";
import { onboardA1 } from "./helpers";

test.beforeEach(({ browserName, isMobile }) => {
  test.skip(!isMobile && browserName !== "chromium", "exam journeys run on chromium + phones");
});

async function chooseExam(page: Page, exam: RegExp) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Exam preparation (B2–C1)" }).click();
  await page.locator(".ex-exam-card", { hasText: exam }).click();
  await page.getByLabel("Exam date (if booked)").fill("2027-03-20");
  await page.getByRole("button", { name: "Start preparing" }).click();
  await expect(page.getByRole("link", { name: "Exam", exact: true })).toBeVisible();
}

test("general learners see no exam tab; switching to C1 adds the exam plan and keeps progress", async ({ page }) => {
  await onboardA1(page);
  await expect(page.getByRole("link", { name: "Exam", exact: true })).toHaveCount(0);
  await chooseExam(page, /C1 Advanced/);
  await page.getByRole("link", { name: "Exam", exact: true }).click();
  await expect(page.getByRole("heading", { name: /C1 Advanced/ })).toBeVisible();
  await expect(page.getByText(/days to the exam/)).toBeVisible();
  await expect(page.getByText("Diagnostic assessment")).toBeVisible();
  await expect(page.getByText("Not enough practice yet").first()).toBeVisible();
  // Back to general English: the exam tab goes, the goal is remembered.
  await page.goto("/settings");
  await page.getByRole("button", { name: "General English" }).click();
  await expect(page.getByRole("link", { name: "Exam", exact: true })).toHaveCount(0);
  await expect(page.getByText(/C1 Advanced · 2027-03-20/)).toBeVisible();
});

test("writing practice: word count, honest indicators, self-marking, stored result", async ({ page }) => {
  await onboardA1(page);
  await chooseExam(page, /B2 First/);
  await page.goto("/exam/run?mode=section&tasks=b2.write.d1.p1");
  await expect(page.getByText(/140–190/).first()).toBeVisible();
  const essay = "Many people believe that learning online is better than learning in a classroom. In my opinion, both have advantages.\n\nFirstly, online courses are flexible, so students can study whenever they want. However, it is easy to lose motivation at home.\n\nSecondly, classrooms let students ask questions and work with others, which helps them to learn faster.\n\nIn conclusion, I believe that a mix of both is the best option for most learners.";
  await page.getByLabel("Your answer").fill(essay);
  await expect(page.getByText(/words \(task: 140–190\)/)).toBeVisible();
  await page.getByRole("button", { name: "Finish and see results" }).click();
  await expect(page.getByText(/can't judge your writing the way a trained examiner does/)).toBeVisible();
  await page.getByRole("radiogroup", { name: "Language" }).getByText("3", { exact: true }).click();
  await page.getByRole("button", { name: "See results" }).click();
  await expect(page.getByRole("heading", { name: "Your results" })).toBeVisible();
  await expect(page.getByText("Practice estimate")).toBeVisible();
  await expect(page.getByText(/Language 3\/5/)).toBeVisible();
  await expect(page.getByText("self-assessed")).toBeVisible();
});

test("listening practice: recordings play in the speakers' voices, answers are marked, transcript afterwards", async ({ page }) => {
  await page.addInitScript(() => {
    // Headless browsers have no audio output: end each clip at once, and record what played.
    const w = window as unknown as { __played: number };
    w.__played = 0;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { w.__played++; setTimeout(() => this.dispatchEvent(new Event("ended")), 5); return Promise.resolve(); };
    if ("speechSynthesis" in window) window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { w.__played++; setTimeout(() => u.onend?.(new Event("end") as SpeechSynthesisEvent), 5); };
  });
  await onboardA1(page);
  await chooseExam(page, /B2 First/);
  await page.goto("/exam/run?mode=section&tasks=b2.listen.m1.p1");
  await page.getByRole("button", { name: "Play recording" }).first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __played: number }).__played)).toBeGreaterThan(0);
  // Keys: q1 = B, q2 = A; answer q1 right and q2 wrong.
  await page.getByRole("radiogroup", { name: "Question 1" }).locator("label").nth(1).click();
  await page.getByRole("radiogroup", { name: "Question 2" }).locator("label").nth(2).click();
  await page.getByRole("button", { name: "Finish and see results" }).click();
  await expect(page.getByRole("heading", { name: "Your results" })).toBeVisible();
  await expect(page.locator("tr", { hasText: "Listening" })).toContainText("1 / 8");
  await expect(page.locator("tr", { hasText: "Listening" })).toContainText("projected from part of a paper");
  await expect(page.getByText("Transcript").first()).toBeVisible();
  await expect(page.locator(".ex-fb-wrong").first()).toContainText("Answer");
});

test("speaking practice without a microphone: examiner prompts, timer, self-assessment", async ({ page }) => {
  await page.addInitScript(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { setTimeout(() => u.onend?.(new Event("end") as SpeechSynthesisEvent), 5); };
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { setTimeout(() => this.dispatchEvent(new Event("ended")), 5); return Promise.resolve(); };
  });
  await onboardA1(page);
  await chooseExam(page, /B2 First/);
  await page.goto("/exam/run?mode=section&tasks=b2.speak.d1.p2");
  await expect(page.locator(".ex-picture")).toHaveCount(2);
  await page.getByRole("button", { name: "Examiner: ask" }).click();
  await expect(page.getByRole("timer").last()).toBeVisible();
  for (let i = 0; i < 6; i++) {
    const next = page.getByRole("button", { name: /^(Next question|Done with this part)$/ });
    const label = await next.innerText();
    await next.click();
    if (label === "Done with this part") break;
  }
  await page.getByRole("button", { name: "Finish and see results" }).click();
  await expect(page.getByText(/self-assessment, not an examiner's mark/)).toBeVisible();
  for (const c of ["Grammar and Vocabulary", "Discourse Management", "Pronunciation", "Interactive Communication", "Global Achievement"]) {
    await page.getByRole("radiogroup", { name: c }).getByText("3", { exact: true }).click();
  }
  await page.getByRole("button", { name: "See results" }).click();
  await expect(page.locator("tr", { hasText: "Speaking" })).toContainText("3 / 5");
});

test("C1 Advanced journey: choose the exam, diagnostic, weakness → theory → fresh retest, timed paper resumes", async ({ page }) => {
  const { onboard, takeTest, startAt } = await import("./helpers");
  const { answerExamTask } = await import("./exam-helpers");
  await onboard(page, { canRead: true, minutes: 30, cert: "c1-advanced", examDate: "2027-06-12" });
  await takeTest(page, "C1");
  await startAt(page);
  await expect(page.getByRole("heading", { name: /Preparing for C1 Advanced/ })).toBeVisible();
  await page.getByRole("link", { name: "Open exam plan" }).click();

  // Phase 1: the diagnostic is today's first step.
  await expect(page.locator(".ex-phase").first()).toHaveAttribute("data-current", "true");
  await page.getByRole("link", { name: /exam diagnostic/ }).click();
  const tabs = page.locator(".ex-tabs .chip");
  await expect(tabs.first()).toBeVisible();
  const n = await tabs.count();
  expect(n).toBe(5); // Use of English Parts 1–4 + a reading text
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    const id = await page.locator("[data-task-id]").getAttribute("data-task-id");
    // Struggle with key word transformations; do well elsewhere.
    await answerExamTask(page, id!, () => id!.includes("p4"));
  }
  await page.getByRole("button", { name: "Finish and see results" }).click();
  await expect(page.getByRole("heading", { name: "Your results" })).toBeVisible();
  await expect(page.locator("tr", { hasText: "Use of English" })).toBeVisible();
  await expect(page.getByText("What went wrong most")).toBeVisible();

  // The weakest point leads to its theory lesson, then to NEW questions on the same point.
  await page.getByRole("link", { name: "Study the weakest point" }).click();
  await expect(page.locator(".gram-body")).not.toBeEmpty();
  const retest = page.getByRole("link", { name: "Retest with new questions" });
  const href = await retest.getAttribute("href");
  await retest.click();
  const retestId = await page.locator("[data-task-id]").getAttribute("data-task-id");
  expect(href).toContain(retestId!);
  await answerExamTask(page, retestId!);
  await page.getByRole("button", { name: "Finish and see results" }).click();
  await expect(page.getByRole("heading", { name: "Your results" })).toBeVisible();

  // Dashboard: diagnostic done, readiness shows an estimate range for measured skills only.
  await page.getByRole("link", { name: "Back to exam preparation" }).click();
  await expect(page.locator(".ex-phase").first()).toHaveAttribute("data-done", "true");
  await expect(page.locator(".ex-skill", { hasText: "Use of English" }).locator(".ex-skill-val")).toBeVisible();
  await expect(page.locator(".ex-skill", { hasText: "Listening" })).toContainText("Not enough practice yet");

  // A timed paper uses the official time and resumes after leaving.
  await page.getByRole("link", { name: /Timed full paper \(90 min\)/ }).first().click();
  await expect(page.getByRole("timer")).toHaveText(/^(90:00|89:5\d)$/);
  await page.locator(".ex-gap").first().selectOption("1");
  await page.getByRole("button", { name: "Save and exit" }).click();
  await page.getByRole("link", { name: /Timed full paper \(90 min\)/ }).first().click();
  await expect(page.getByText("Welcome back")).toBeVisible();
  await expect(page.locator(".ex-gap").first()).toHaveValue("1");
});
