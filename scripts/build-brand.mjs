// Generates every brand asset from one source of truth.
// Usage: node scripts/build-brand.mjs   (needs Playwright's Chromium for PNGs)
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const logoSrc = readFileSync(new URL("../src/components/Logo.tsx", import.meta.url), "utf8");
const ROUTE = logoSrc.match(/ROUTE_PATH =\s*"([^"]+)"/)[1];
const ARROW = logoSrc.match(/ARROW_PATH = "([^"]+)"/)[1];

const C = {
  paper: "#f3f6f5",
  ink: "#13233a",
  contour: "#c3cfd4",
  route: "#a3125f",
  nightPaper: "#0e1828",
  nightInk: "#e7eef3",
  nightContour: "#2e4060",
  nightRoute: "#f26aae",
};

const markBody = ({ route, contour, contourOpacity = 1 }) => `
  <g fill="none" stroke="${contour}" stroke-width="2" opacity="${contourOpacity}">
    <ellipse cx="32" cy="38" rx="27" ry="19"/>
    <ellipse cx="32" cy="38" rx="15" ry="10"/>
  </g>
  <path d="${ROUTE}" fill="none" stroke="${route}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${ARROW}" fill="none" stroke="${route}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="12" cy="17" r="5" fill="${route}"/>`;

const mark = (o) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${markBody(o)}\n</svg>\n`;

// App icon: mark on a filled square, inset for maskable safe zone when asked.
const icon = ({ bg, route, contour, inset = 0.14 }) => {
  const s = 64 * (1 - inset * 2);
  const t = 64 * inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${bg}"/>
  <g transform="translate(${t} ${t}) scale(${s / 64})">${markBody({ route, contour })}</g>
</svg>\n`;
};

// Wordmark: mark + lowercase name set in Golos Text (outlined at runtime by browsers;
// SVG embeds the font-family, PNG previews are rendered with the font loaded).
const wordmark = ({ ink, route, contour }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 64">
  <g>${markBody({ route, contour })}</g>
  <text x="74" y="44" font-family="'Golos Text', system-ui, sans-serif" font-size="38" font-weight="600" letter-spacing="-0.5" fill="${ink}">wayline</text>
</svg>\n`;

const out = new URL("../public/brand/", import.meta.url);
mkdirSync(out, { recursive: true });
const files = {
  "mark.svg": mark({ route: C.route, contour: C.contour }),
  "mark-dark.svg": mark({ route: C.nightRoute, contour: C.nightContour }),
  "mark-mono.svg": mark({ route: "#000000", contour: "#000000", contourOpacity: 0.35 }),
  "wordmark.svg": wordmark({ ink: C.ink, route: C.route, contour: C.contour }),
  "wordmark-dark.svg": wordmark({ ink: C.nightInk, route: C.nightRoute, contour: C.nightContour }),
  "wordmark-mono.svg": wordmark({ ink: "#000000", route: "#000000", contour: "#999999" }),
  "icon.svg": icon({ bg: C.paper, route: C.route, contour: C.contour, inset: 0.08 }),
  "icon-dark.svg": icon({ bg: C.nightPaper, route: C.nightRoute, contour: C.nightContour, inset: 0.08 }),
  "icon-maskable.svg": icon({ bg: C.paper, route: C.route, contour: C.contour, inset: 0.2 }),
};
for (const [name, svg] of Object.entries(files)) writeFileSync(new URL(name, out), svg);

// Favicon: simplified (thicker route, no inner ring) so it reads at 16px.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <style>.r{stroke:${C.route}}.d{fill:${C.route}}.c{stroke:${C.contour}}@media (prefers-color-scheme:dark){.r{stroke:${C.nightRoute}}.d{fill:${C.nightRoute}}.c{stroke:${C.nightContour}}}</style>
  <ellipse class="c" cx="32" cy="38" rx="27" ry="19" fill="none" stroke-width="3"/>
  <path class="r" d="${ROUTE}" fill="none" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path class="r" d="${ARROW}" fill="none" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle class="d" cx="12" cy="17" r="6"/>
</svg>\n`;
writeFileSync(new URL("../public/favicon.svg", import.meta.url), favicon);

// Rasterise PWA icons.
const browser = await chromium.launch();
const page = await browser.newPage();
const raster = async (svg, size, file) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: new URL(file, out).pathname, omitBackground: false });
};
await raster(files["icon.svg"], 192, "icon-192.png");
await raster(files["icon.svg"], 512, "icon-512.png");
await raster(files["icon-maskable.svg"], 512, "icon-maskable-512.png");
await raster(files["icon.svg"], 180, "apple-touch-icon.png");
await raster(files["icon.svg"], 32, "favicon-32.png");
await browser.close();
console.log("Brand assets written to public/brand/");
