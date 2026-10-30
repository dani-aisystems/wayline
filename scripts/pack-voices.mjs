/**
 * Packs rendered clips (voice-cache/<voice>/<key>.mp3) into small bundles under public/voice/, grouped
 * by lesson pack so a lesson's audio arrives together, plus one manifest per voice:
 *   public/voice/<voice>.json = { "<key>": [bundleIndex, byteOffset, byteLength], … , "_files": [names] }
 * Each slice is a complete MP3 file. Bundles stay under ~400 KB.
 *
 *   node scripts/pack-voices.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";

const MAX = 400_000;
const lines = JSON.parse(readFileSync("voice/lines.json", "utf8"));
rmSync("public/voice", { recursive: true, force: true });
mkdirSync("public/voice", { recursive: true });

const byVoice = new Map();
for (const j of lines) {
  const f = `voice-cache/${j.voice}/${j.key}.mp3`;
  if (!existsSync(f)) continue;
  if (!byVoice.has(j.voice)) byVoice.set(j.voice, new Map());
  const groups = byVoice.get(j.voice);
  if (!groups.has(j.group)) groups.set(j.group, []);
  groups.get(j.group).push({ key: j.key, file: f });
}

let total = 0, clips = 0, missing = lines.length;
for (const [voice, groups] of byVoice) {
  const manifest = { _files: [] };
  for (const [group, items] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    let part = 0, chunks = [], size = 0;
    const flush = () => {
      if (!chunks.length) return;
      const body = Buffer.concat(chunks.map((c) => c.buf));
      // Content hash in the name: bundles can be cached forever, and a changed bundle gets a new URL.
      const name = `${voice}-${group}-${part++}-${createHash("sha256").update(body).digest("hex").slice(0, 8)}.mp3`;
      const idx = manifest._files.push(name) - 1;
      let off = 0;
      for (const c of chunks) { manifest[c.key] = [idx, off, c.buf.length]; off += c.buf.length; }
      writeFileSync(`public/voice/${name}`, body);
      total += size; chunks = []; size = 0;
    };
    for (const it of items.sort((a, b) => a.key.localeCompare(b.key))) {
      const buf = readFileSync(it.file);
      if (size + buf.length > MAX) flush();
      chunks.push({ key: it.key, buf }); size += buf.length; clips++; missing--;
    }
    flush();
  }
  writeFileSync(`public/voice/${voice}.json`, JSON.stringify(manifest));
}
console.log(`${clips} clips in ${(total / 1e6).toFixed(1)} MB; ${missing} lines without a clip (device voice fallback)`);
