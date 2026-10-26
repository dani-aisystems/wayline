import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** WCAG 2.2 relative luminance + contrast ratio. */
function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function block(selectorStart: string): Record<string, string> {
  const start = css.indexOf(selectorStart);
  if (start < 0) throw new Error(`Missing block ${selectorStart}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--(c-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}

const themes = {
  light: block(":root {"),
  dark: block(':root[data-theme="dark"]'),
};

/** [foreground, background, minimum ratio, why] */
const pairs: Array<[string, string, number, string]> = [
  ["c-ink", "c-paper", 4.5, "body text"],
  ["c-ink-soft", "c-paper", 4.5, "secondary text"],
  ["c-ink", "c-paper-raised", 4.5, "text on sheets"],
  ["c-ink-soft", "c-paper-raised", 4.5, "secondary text on sheets"],
  ["c-ink", "c-shallow", 4.5, "text on tinted fills"],
  ["c-ink-soft", "c-shallow", 4.5, "secondary text on tinted fills"],
  ["c-route-ink", "c-route", 4.5, "primary button label"],
  ["c-route", "c-paper", 4.5, "route-coloured links"],
  ["c-route", "c-paper-raised", 4.5, "route-coloured links on sheets"],
  ["c-mastered", "c-paper", 4.5, "correct feedback text"],
  ["c-mastered", "c-mastered-tint", 4.5, "correct feedback on tint"],
  ["c-due", "c-paper", 4.5, "due label"],
  ["c-due", "c-due-tint", 4.5, "due label on tint"],
  ["c-error", "c-paper", 4.5, "error text"],
  ["c-error", "c-error-tint", 4.5, "error text on tint"],
  ["c-focus", "c-paper", 3, "focus ring (non-text)"],
  ["c-contour", "c-paper", 1.3, "decorative rules stay visible"],
];

describe("design tokens meet WCAG 2.2 AA", () => {
  for (const [theme, vars] of Object.entries(themes)) {
    for (const [fg, bg, min, why] of pairs) {
      it(`${theme}: ${fg} on ${bg} (${why}) ≥ ${min}`, () => {
        expect(vars[fg], `${theme} missing ${fg}`).toBeDefined();
        expect(vars[bg], `${theme} missing ${bg}`).toBeDefined();
        expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(min);
      });
    }
  }

  it("dark media-query block matches the explicit dark theme", () => {
    const media = block(':root:not([data-theme="light"])');
    expect(media).toEqual(themes.dark);
  });
});
