/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/**
 * Dev only: serve /api/<name> from api/<name>.ts through Vite's module loader, so `npm run dev`
 * runs the exact handlers Vercel runs, with no second server and no `vercel dev`.
 * Vercel ignores this; in production the platform routes /api itself.
 */
function devApi(): Plugin {
  const readBody = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  };
  return {
    name: "wayline-dev-api",
    apply: "serve",
    configureServer(server) {
      // Handlers read process.env like on Vercel; Vite would otherwise expose .env values only to the browser bundle.
      for (const [k, v] of Object.entries(loadEnv(server.config.mode, process.cwd(), ""))) process.env[k] ??= v;
      server.middlewares.use("/api", async (req, res, next) => {
        // Mounted at /api, so req.url is the rest: "/health?x=1".
        const url = new URL(req.url ?? "/", "http://localhost");
        const name = url.pathname.replace(/^\/+|\/+$/g, "");
        // Only plain names like "health" or "admin/delete-student", so a crafted path can't load other files.
        // Unknown routes get a 404, as on Vercel, never the app's index.html.
        const file = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(name) ? fileURLToPath(new URL(`./api/${name}.ts`, import.meta.url)) : null;
        if (!file || !existsSync(file)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: "not_found" }));
        }
        try {
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const hasBody = req.method !== "GET" && req.method !== "HEAD";
          const request = new Request(`http://${req.headers.host}/api/${name}${url.search}`, {
            method: req.method,
            headers,
            body: hasBody ? await readBody(req) : undefined,
          });
          const mod = (await server.ssrLoadModule(file)) as { default: { fetch(r: Request): Promise<Response> } };
          const response = await mod.default.fetch(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const artifact = mode === "artifact";
  return {
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __ARTIFACT__: JSON.stringify(artifact) },
  ...(artifact
    ? {
        base: "./",
        resolve: { alias: { "virtual:pwa-register/react": fileURLToPath(new URL("./src/app/stubs/pwa-register-react.ts", import.meta.url)) } },
        build: { outDir: "dist-artifact", assetsInlineLimit: 100_000_000, cssCodeSplit: false },
        publicDir: false as const,
      }
    : {}),
  plugins: artifact ? [react(), viteSingleFile()] : [
    react(),
    devApi(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.ico", "brand/apple-touch-icon.png", "brand/favicon-32.png"],
      manifest: {
        name: "Wayline",
        short_name: "Wayline",
        description: "A free path from your first English word to confident, independent English.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0a0f1a",
        theme_color: "#0a0f1a",
        icons: [
          { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,json}"],
        // Large master logo files are for marketing, not the app shell.
        // Precache only the font subsets English and Bulgarian learners need.
        // Natural voice clips (~50 MB) are cached as they're played, not precached.
        globIgnores: ["voice/**", "**/brand/logo-*.png", "**/brand/mark.png", "**/brand/mark-mono.png", "**/*-greek-*.woff2", "**/*-vietnamese-*.woff2", "**/*-cyrillic-ext-*.woff2", "**/*-greek-ext-*.woff2"],
        navigateFallback: "/index.html",
        // The service worker must never answer API calls with the cached app shell.
        navigateFallbackDenylist: [/^\/voice\//, /^\/api\//],
        runtimeCaching: [
          { urlPattern: /\/voice\/.+\.mp3$/, handler: "CacheFirst", options: { cacheName: "voice-clips", expiration: { maxEntries: 400 } } },
          { urlPattern: /\/voice\/.+\.json$/, handler: "StaleWhileRevalidate", options: { cacheName: "voice-manifests" } },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    environment: "node",
  },
};
});
