// Vercel Function: GET /api/health. Thin wrapper; the logic and its tests live in server/health.ts.
// Relative imports in api/ and server/ end in ".js": Vercel compiles each .ts file to .js and Node's
// ES modules need the real file name. TypeScript and Vite map "./x.js" back to "./x.ts".
import { checkHealth } from "../server/health.js";

export default {
  fetch(): Promise<Response> {
    return checkHealth({ supabaseUrl: process.env.VITE_SUPABASE_URL, publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY });
  },
};
