import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { library } from "./library";
import { clipKey, DEFAULT_NARRATOR } from "../lib/clips";

/**
 * Every lesson line should have a natural recording in the default voice. If this fails after editing
 * content, re-render (see CLAUDE.md "Natural voices"); the app still works, using device speech.
 */
const file = new URL("../../public/voice/" + DEFAULT_NARRATOR + ".json", import.meta.url);

describe.skipIf(!existsSync(file))("natural voice coverage", () => {
  it("covers every lesson headword, example and text", () => {
    const m = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const lines = new Set<string>();
    for (const e of new Set(library.lens.values())) { lines.add(e.word); lines.add(e.example); }
    for (const n of library.note.values()) n.examples.forEach((x) => lines.add(x));
    for (const t of library.text.values()) lines.add(t.paragraphs.join(" "));
    const missing = [...lines].filter((l) => !m[clipKey(DEFAULT_NARRATOR, l)]);
    expect(missing.slice(0, 10), `${missing.length} lines have no recording`).toEqual([]);
  });
});
