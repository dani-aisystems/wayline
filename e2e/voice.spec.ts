import { expect, test, type Page } from "@playwright/test";
import { onboardA1 } from "./helpers";

/**
 * Natural voices. Headless browsers have no audio output, so `play()` is replaced with a recorder that
 * logs what would be played and ends at once. The clips themselves are the real bundled files.
 */
async function recordPlayback(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __played: { src: string; rate: number; bytes: number }[]; __spoken: string[] };
    w.__played = [];
    w.__spoken = [];
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const src = this.src, rate = this.playbackRate;
      void fetch(src).then((r) => r.arrayBuffer()).then((b) => {
        w.__played.push({ src, rate, bytes: b.byteLength });
        this.dispatchEvent(new Event("ended"));
      });
      return Promise.resolve();
    };
    if ("speechSynthesis" in window) {
      window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
        w.__spoken.push(u.text);
        setTimeout(() => u.onend?.(new Event("end") as SpeechSynthesisEvent), 10);
      };
    }
  });
}
const played = (page: Page) => page.evaluate(() => (window as unknown as { __played: { src: string; rate: number; bytes: number }[] }).__played);
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

test("settings: natural voices are offered and the test phrase plays a real clip", async ({ page }) => {
  await recordPlayback(page);
  await onboardA1(page);
  await page.goto("/settings");
  const select = page.getByLabel("English voice");
  await expect(select.locator("optgroup[label='Natural voices'] option")).toHaveCount(4);
  await select.selectOption({ label: "George · male · British" });
  const manifest = page.waitForResponse((r) => r.url().endsWith("/voice/bm_george.json") && r.ok());
  await page.getByRole("button", { name: "Test voice" }).click();
  await manifest;
  await expect.poll(async () => (await played(page)).length).toBe(1);
  const [clip] = await played(page);
  expect(clip.src).toMatch(/^blob:/);
  expect(clip.bytes).toBeGreaterThan(2000); // a real MP3, not an empty slice
  expect(await spoken(page)).toEqual([]); // no robotic device voice
});

test("dialogue: each character speaks in their own natural voice", async ({ page }) => {
  await recordPlayback(page);
  const manifests = new Set<string>();
  page.on("request", (r) => { const m = r.url().match(/\/voice\/([a-z_]+)\.json$/); if (m) manifests.add(m[1]); });
  await onboardA1(page);
  await page.goto("/practice?ids=a1.talk-cafe.dlg-coffee");
  await expect.poll(async () => (await played(page)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  expect(await spoken(page)).toEqual([]);
  expect(manifests.size).toBeGreaterThanOrEqual(1);
});

test("slow speed stretches the natural clip instead of switching voice", async ({ page }) => {
  await recordPlayback(page);
  await onboardA1(page);
  await page.goto("/practice?ids=a1.talk-cafe.say-glass-of-water");
  await page.getByRole("button", { name: "Slow" }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(async () => (await played(page)).length).toBe(1);
  expect((await played(page))[0].rate).toBe(0.75);
});

test("if clips can't load, the device voice takes over", async ({ page }) => {
  await recordPlayback(page);
  await page.goto("/favicon.ico");
  test.skip(!(await page.evaluate(() => "speechSynthesis" in window)), "This browser build has no device speech");
  await page.route("**/voice/**", (r) => r.abort());
  await onboardA1(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Test voice" }).click();
  await expect.poll(() => spoken(page)).toContain("Hello!");
  expect(await played(page)).toEqual([]);
});
