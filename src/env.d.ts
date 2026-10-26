/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;

/** True in the single-file artifact build (no service worker, memory routing). */
declare const __ARTIFACT__: boolean;
