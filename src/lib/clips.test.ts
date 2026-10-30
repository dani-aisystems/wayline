import { describe, expect, it } from "vitest";
import { castNatural, clipKey, fallbackOrder, NATURAL_VOICES, narratorFor, normalizeLine } from "./clips";
import { naturalVoiceFor } from "./speech";

describe("natural voice clips", () => {
  it("key the same line the same way despite quotes and spacing", () => {
    expect(clipKey("af_heart", "I’m  fine,\nthanks.")).toBe(clipKey("af_heart", "I'm fine, thanks."));
    expect(clipKey("af_heart", "Hello")).not.toBe(clipKey("am_michael", "Hello"));
    expect(clipKey("af_heart", "Hello")).not.toBe(clipKey("af_heart", "Hello!"));
    expect(normalizeLine("  “Hi”  ")).toBe('"Hi"');
  });

  it("only use voices whose gender and accent come from the model's own list", () => {
    for (const v of NATURAL_VOICES) {
      // Kokoro ids encode accent (a = American, b = British) and gender (f/m).
      expect(v.id[0]).toBe(v.accent === "US" ? "a" : "b");
      expect(v.id[1]).toBe(v.presents === "female" ? "f" : "m");
    }
  });

  it("cast characters by authored identity, distinct when two share one", () => {
    const cast = castNatural([
      { key: "waiter", presents: "male", accent: "GB" },
      { key: "ana", presents: "female", accent: "US" },
      { key: "ben", presents: "male", accent: "GB" },
    ]);
    expect(cast.get("waiter")).toBe("bm_george");
    expect(cast.get("ana")).toBe("af_heart");
    expect(cast.get("ben")).toBe("bm_fable");
  });

  it("alternate unspecified speakers so they sound different", () => {
    const cast = castNatural([{ key: "A" }, { key: "B" }]);
    expect(cast.get("A")).toBe("af_heart");
    expect(cast.get("B")).toBe("am_michael");
  });

  it("fall back to a similar voice before a different one", () => {
    expect(fallbackOrder("bm_fable").slice(0, 2)).toEqual(["bm_fable", "bm_george"]);
    expect(fallbackOrder("bm_fable")[2]).toMatch(/^am_/);
    expect(new Set(fallbackOrder("af_heart")).size).toBe(NATURAL_VOICES.length);
  });

  it("pick the narrator from the learner's setting", () => {
    expect(narratorFor("natural:bm_george")).toBe("bm_george");
    expect(narratorFor(undefined, "GB")).toBe("bf_emma");
    expect(narratorFor("com.apple.voice.Samantha")).toBe("af_heart"); // older device setting → natural default
    expect(naturalVoiceFor({ voiceId: "device:Samantha" })).toBeNull(); // chose a device voice on purpose
    expect(naturalVoiceFor({ presents: "male", accent: "GB" })).toBe("bm_george");
    expect(naturalVoiceFor({ natural: "af_bella", voiceId: "natural:bm_george" })).toBe("af_bella");
  });
});
