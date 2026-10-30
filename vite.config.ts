/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

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
        navigateFallbackDenylist: [/^\/voice\//],
        runtimeCaching: [
          { urlPattern: /\/voice\/.+\.mp3$/, handler: "CacheFirst", options: { cacheName: "voice-clips", expiration: { maxEntries: 400 } } },
          { urlPattern: /\/voice\/.+\.json$/, handler: "StaleWhileRevalidate", options: { cacheName: "voice-manifests" } },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
};
});
