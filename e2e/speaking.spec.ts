import { expect, test, type Page } from "@playwright/test";
import { onboardA1 } from "./helpers";

/**
 * Speaking journeys. CI has no real microphone, so these tests run in Chromium with its built-in
 * fake audio device (a generated tone) and, where recognition is needed, a SIMULATED recogniser that
 * returns a fixed transcript. They prove the UI pipeline (permission → record → playback → word check),
 * not that any hardware or speech engine works. Real-device checks are listed in docs/UPGRADE.md.
 */
test.skip(({ browserName }) => browserName !== "chromium", "Uses Chromium's fake media device flags");
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

const REPEAT = "a1.talk-cafe.say-glass-of-water";
const ANSWER = "a1.talk-cafe.answer-drink";

/** A simulated on-device recogniser that "hears" the given transcript when stopped. */
async function simulateRecognition(page: Page, transcript: string, local = true) {
  await page.addInitScript(
    ({ transcript, local }) => {
      class SimulatedRecognition {
        lang = "en-US"; interimResults = false; maxAlternatives = 1; continuous = false; processLocally = false;
        onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
        static available = async () => (local ? "available" : "unavailable");
        start() {}
        abort() {}
        stop() {
          (window as unknown as { __recognitionLocal: boolean }).__recognitionLocal = this.processLocally;
          setTimeout(() => {
            this.onresult?.({ results: [Object.assign([{ transcript, confidence: 0.9 }], { isFinal: true })] });
            this.onend?.();
          }, 50);
        }
      }
      Object.assign(window, { SpeechRecognition: SimulatedRecognition, webkitSpeechRecognition: undefined });
    },
    { transcript, local },
  );
}

async function micOn(page: Page) {
  await page.getByRole("button", { name: "Turn on microphone" }).click();
  await expect(page.getByText("Microphone on")).toBeVisible();
  await expect(page.getByText(/stays on this device/)).toBeVisible();
  // The word check is opt-in; ticking it is what lets the app ask the browser for a recogniser.
  const check = page.getByRole("checkbox", { name: "Check my words" });
  await expect(check).not.toBeChecked();
  await check.check();
}

async function record(page: Page) {
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("Recording…")).toBeVisible();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Stop" }).click();
}

test("repeat: record with the (fake) microphone, play it back, and see which words were recognised", async ({ page }) => {
  await simulateRecognition(page, "can I have a glass of water please");
  await onboardA1(page);
  await page.goto(`/practice?ids=${REPEAT}`);
  await micOn(page);
  await expect(page.getByText(/Your voice doesn't leave this device/)).toBeVisible();
  await record(page);
  await expect(page.getByText("Your recording", { exact: true })).toBeVisible();
  await expect(page.locator("audio").first()).toHaveAttribute("src", /^blob:/);
  await expect(page.getByText("Every word was recognised.")).toBeVisible();
  await expect(page.getByText(/isn't a pronunciation score/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __recognitionLocal: boolean }).__recognitionLocal)).toBe(true);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/1 of 1 right first time/)).toBeVisible();
});

test("answer: missing key words are reported, not marked correct", async ({ page }) => {
  await simulateRecognition(page, "I would like something");
  await onboardA1(page);
  await page.goto(`/practice?ids=${ANSWER}`);
  await micOn(page);
  await record(page);
  await expect(page.getByText("Your answer is missing some key words.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/0 of 1 right first time/)).toBeVisible();
});

test("cloud-only recognition is never used without explicit consent", async ({ page }) => {
  await simulateRecognition(page, "can I have a glass of water please", false);
  await onboardA1(page);
  await page.goto(`/practice?ids=${REPEAT}`);
  await micOn(page);
  await expect(page.getByText(/on its maker's servers/)).toBeVisible();
  const consent = page.getByRole("checkbox", { name: "Allow sending my voice for speech-to-text" });
  await expect(consent).not.toBeChecked();
  // Recording without consent gives a recording but no transcript.
  await record(page);
  await expect(page.getByText("Your recording", { exact: true })).toBeVisible();
  await expect(page.getByText("Every word was recognised.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "I said it clearly" })).toBeVisible();
});
