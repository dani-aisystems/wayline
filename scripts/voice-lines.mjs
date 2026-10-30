/**
 * Lists every English line the app can speak, with the natural voice(s) each needs, and writes
 * voice/lines.json for scripts/render-voices.py. Loads the real content modules through Vite so the
 * lines match exactly what the components pass to speak().
 *
 *   node scripts/voice-lines.mjs
 */
import { createServer } from "vite";
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error", define: { __ARTIFACT__: "false" } });
const load = (p) => server.ssrLoadModule(p);
try {
  const { library } = await load("/src/content/library.ts");
  const diagnosticItems = [...(await load("/src/content/diagnosticBank.ts")).diagBank.values()];
  const { EXPRESSIONS } = await load("/src/content/expressions.ts");
  const { ALPHABET } = await load("/src/content/alphabet.ts");
  const { modelAnswer } = await load("/src/engine/check.ts");
  const { parseDialogue } = await load("/src/lib/speech.ts");
  const { NARRATORS, castNatural, clipKey, normalizeLine } = await load("/src/lib/clips.ts");

  const jobs = new Map(); // key → { voice, text }
  // Clips are bundled by group (one lesson pack, the library, the level test) so a lesson loads together.
  let group = "library";
  const add = (voice, text) => {
    if (!text || !/[A-Za-z]/.test(text)) return;
    const k = clipKey(voice, text);
    if (!jobs.has(k)) jobs.set(k, { key: k, voice, group, text: normalizeLine(text) });
  };
  const narrate = (text) => NARRATORS.forEach((v) => add(v.id, text));
  const scene = (text, wishes, accent = "US") => {
    const lines = parseDialogue(text);
    if (lines.length === 1 && !lines[0].speaker) return narrate(text);
    const speakers = [...new Set(lines.map((l) => l.speaker))];
    const order = [...wishes.map((w) => w.key).filter((k) => speakers.includes(k)), ...speakers.filter((s) => !wishes.some((w) => w.key === s))];
    const cast = castNatural(order.map((k) => wishes.find((w) => w.key === k) ?? { key: k }), accent);
    for (const l of lines) add(cast.get(l.speaker), l.text);
  };

  const packs = readdirSync("src/content/packs").filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(`src/content/packs/${f}`, "utf8")));
  const packOf = new Map(packs.flatMap((p) => p.competences.map((c) => [c.id, p.id])));
  for (const p of packs) {
    group = p.id;
    for (const e of p.glossary ?? []) { narrate(e.word); narrate(e.example); }
    for (const n of p.notes ?? []) n.examples.forEach(narrate);
    for (const t of p.texts ?? []) narrate(t.paragraphs.join(" "));
  }
  for (const item of library.item.values()) {
    group = packOf.get(item.competence) ?? "library";
    if (["cloze", "choice", "build", "fix"].includes(item.type)) narrate(modelAnswer(item));
    if (item.type === "speak") {
      const texts = [item.prompt, item.target, item.model].filter(Boolean);
      if (item.voice?.presents || item.voice?.accent) {
        const v = castNatural([{ key: "v", ...item.voice }]).get("v");
        texts.forEach((x) => add(v, x));
      }
      texts.forEach(narrate);
    }
    if (item.type === "listen") scene(item.audio, item.characters.map((c) => ({ key: c.name, presents: c.presents, accent: c.accent })));
    if (item.type === "dialogue") {
      const cast = castNatural(item.characters.map((c) => ({ key: c.id, presents: c.presents, accent: c.accent })));
      for (const l of item.lines) {
        if ("by" in l) add(cast.get(l.by), l.text);
        else for (const o of l.options) if (o.correct) add(cast.get(item.learnerAs), o.text);
      }
    }
  }
  group = "placement";
  for (const d of diagnosticItems) if (d.skill === "listening" && d.passage) scene(d.passage, []);
  group = "library";
  for (const x of EXPRESSIONS) { narrate(x.text); narrate(x.example); }
  for (const l of ALPHABET) {
    narrate(l.upper === "Z" ? "zee" : l.name);
    l.sounds.forEach((s) => narrate(s.word));
  }
  narrate("Hello! Nice to meet you.");

  const out = [...jobs.values()].sort((a, b) => a.voice.localeCompare(b.voice) || a.key.localeCompare(b.key));
  mkdirSync("voice", { recursive: true });
  writeFileSync("voice/lines.json", JSON.stringify(out, null, 0));
  const chars = out.reduce((s, j) => s + j.text.length, 0);
  const byVoice = Object.groupBy ? Object.fromEntries(Object.entries(Object.groupBy(out, (j) => j.voice)).map(([v, a]) => [v, a.length])) : {};
  console.log(`${out.length} clips, ${chars} characters`, byVoice);
} finally {
  await server.close();
}
