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

describe("API routes", () => {
  it("reach the functions instead of being rewritten to the app", () => {
    const rewrite = (config as unknown as { rewrites: { source: string }[] }).rewrites[0].source;
    expect(new RegExp(`^${rewrite}$`).test("/api/health")).toBe(false);
    expect(new RegExp(`^${rewrite}$`).test("/api/sync")).toBe(false);
    // A page whose name merely starts with "api" is still the app.
    expect(new RegExp(`^${rewrite}$`).test("/apiary")).toBe(true);
  });
  it("run in Frankfurt, next to the EU database, so learner data is processed in the EU", () => {
    expect((config as unknown as { regions?: string[] }).regions).toEqual(["fra1"]);
  });
  it("keep the database awake with a daily health check", () => {
    const crons = (config as unknown as { crons?: { path: string; schedule: string }[] }).crons ?? [];
    // Free Supabase projects pause after a quiet week; once a day leaves six days of margin.
    expect(crons).toContainEqual({ path: "/api/health", schedule: "0 6 * * *" });
  });
});

describe("embedded videos", () => {
  it("allow only privacy-enhanced YouTube frames", () => {
    expect(header("Content-Security-Policy")).toMatch(/frame-src https:\/\/www\.youtube-nocookie\.com;/);
  });
});
