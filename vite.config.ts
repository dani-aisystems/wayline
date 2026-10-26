/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "brand/apple-touch-icon.png", "brand/favicon-32.png"],
      manifest: {
        name: "Wayline",
        short_name: "Wayline",
        description: "A free path from your first English word to confident, independent English.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f3f6f5",
        theme_color: "#13233a",
        icons: [
          { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,json}"],
        // Precache only the font subsets English and Bulgarian learners need.
        globIgnores: ["**/*-greek-*.woff2", "**/*-vietnamese-*.woff2", "**/*-cyrillic-ext-*.woff2", "**/*-greek-ext-*.woff2"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
