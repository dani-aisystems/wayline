import { expect, test } from "@playwright/test";
import { onboardA1 } from "./helpers";

/** Speaking without a working microphone. Both failures are SIMULATED in the page; no hardware is involved. */
const REPEAT = "a1.talk-cafe.say-glass-of-water";

// The native recogniser stays in place here: the page must not probe it until the learner opts in
// (probing crashes headless Chromium 156).
test("blocked microphone: honest message and a way to continue", async ({ page }) => {
  await page.addInitScript(() => {
    // SIMULATED denial of microphone permission.
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await onboardA1(page);
  const canRecord = await page.evaluate(() => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
  // Headless WebKit on Linux has no recording APIs; the "can't record" test below covers that path.
  test.skip(!canRecord, "This browser build cannot record audio");
  await page.goto(`/practice?ids=${REPEAT}`);
  await page.getByRole("button", { name: "Turn on microphone" }).click();
  await expect(page.getByText(/Microphone access was blocked/)).toBeVisible();
  await expect(page.getByText("Recording…")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue without microphone" }).first().click();
  await page.getByRole("button", { name: "I need more practice" }).click();
  await expect(page.getByText(/0 of 1 right first time/)).toBeVisible();
});

test("no recording support at all: the exercise still works without a microphone", async ({ page }) => {
  await page.addInitScript(() => {
    // SIMULATED browser without getUserMedia or speech recognition.
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined });
  });
  await onboardA1(page);
  await page.goto(`/practice?ids=${REPEAT}`);
  await expect(page.getByText(/can't record audio/)).toBeVisible();
  await page.getByRole("button", { name: "Continue without microphone" }).first().click();
  await page.getByRole("button", { name: "I said it clearly" }).click();
  await expect(page.getByText(/1 of 1 right first time/)).toBeVisible();
});
