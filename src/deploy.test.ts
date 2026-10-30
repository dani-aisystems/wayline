import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The production headers in vercel.json must allow what the speaking exercises need. */
const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const all = config.headers.find((h) => h.source === "/(.*)")!.headers;
const header = (k: string) => all.find((h) => h.key === k)?.value ?? "";

describe("deployment headers", () => {
  it("let the app itself use the microphone", () => {
    expect(header("Permissions-Policy")).toMatch(/microphone=\(self\)/);
  });
  it("allow playback of in-memory recordings", () => {
    expect(header("Content-Security-Policy")).toMatch(/media-src [^;]*blob:/);
  });
  it("keep third-party scripts and connections blocked", () => {
    const csp = header("Content-Security-Policy");
    expect(csp).toMatch(/script-src 'self';/);
    expect(csp).toMatch(/connect-src 'self';/);
  });
});

describe("natural voice files", () => {
  it("are served as files, not rewritten to the app", () => {
    const rewrite = (config as unknown as { rewrites: { source: string }[] }).rewrites[0].source;
    expect(new RegExp(`^${rewrite}$`).test("/voice/af_heart.json")).toBe(false);
    expect(new RegExp(`^${rewrite}$`).test("/today")).toBe(true);
  });
});
