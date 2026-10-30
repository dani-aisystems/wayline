/**
 * Validate exam pack files against the official specs: node scripts/check-exam-pack.mjs <file.json>…
 * (Completeness of mock sets is only checked across all packs, in the unit test.)
 */
import { createServer } from "vite";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { validateExamPacks } = await server.ssrLoadModule("/src/content/exams/validate.ts");
  const { issues, tasks } = validateExamPacks(files.map((f) => JSON.parse(readFileSync(f, "utf8"))));
  const shown = issues.filter((i) => !/^(b2-first|c1-advanced) mock-/.test(i.where));
  for (const i of shown) console.log(`${i.level.toUpperCase()} ${i.where}: ${i.message}`);
  console.log(`${tasks.length} tasks, ${shown.filter((i) => i.level === "error").length} errors, ${shown.filter((i) => i.level === "warning").length} warnings`);
  process.exitCode = shown.some((i) => i.level === "error") ? 1 : 0;
} finally {
  await server.close();
}
