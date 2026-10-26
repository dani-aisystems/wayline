import { describe, expect, it } from "vitest";
import { castVoices, chooseVoice, parseDialogue, presentationOf } from "./speech";

const v = (name: string, lang: string, local = true) => ({ name, lang, voiceURI: name, localService: local, default: false }) as SpeechSynthesisVoice;
const device = [v("Samantha", "en-US"), v("Daniel", "en-GB"), v("Karen", "en-AU"), v("Microsoft Guy Online (Natural) - English (United States)", "en-US", false), v("Unknown Voice", "en-US")];

describe("voice presentation labels", () => {
  it("labels only voices we know", () => {
    expect(presentationOf("Samantha")).toBe("female");
    expect(presentationOf("Google UK English Male")).toBe("male");
    expect(presentationOf("Google US English")).toBe("female");
    expect(presentationOf("Microsoft Aria Online (Natural) - English (United States)")).toBe("female");
    expect(presentationOf("Unknown Voice")).toBeNull();
    expect(presentationOf("eSpeak English")).toBeNull();
  });
});

describe("choosing voices", () => {
  it("honours presentation and accent, preferring offline voices", () => {
    expect(chooseVoice(device, { presents: "male", accent: "GB" })!.name).toBe("Daniel");
    expect(chooseVoice(device, { presents: "male", accent: "US" })!.name).toMatch(/Guy/);
    expect(chooseVoice(device, { presents: "female", accent: "US" })!.name).toBe("Samantha");
  });
  it("falls back when the wish can't be met", () => {
    expect(chooseVoice([v("Unknown Voice", "en-US")], { presents: "male" })!.name).toBe("Unknown Voice");
    expect(chooseVoice([], { presents: "male" })).toBeUndefined();
  });
  it("gives two speakers different voices, female then male by default", () => {
    const cast = castVoices(device, ["A", "B"]);
    expect(presentationOf(cast.get("A")!.name)).toBe("female");
    expect(presentationOf(cast.get("B")!.name)).toBe("male");
  });
  it("respects authored character wishes", () => {
    const cast = castVoices(device, ["Waiter", "Anna"], { Waiter: { presents: "male", accent: "GB" }, Anna: { presents: "female", accent: "US" } });
    expect(cast.get("Waiter")!.name).toBe("Daniel");
    expect(cast.get("Anna")!.name).toBe("Samantha");
  });
  it("with one voice on the device, every speaker uses it", () => {
    const one = [v("Unknown Voice", "en-US")];
    const cast = castVoices(one, ["A", "B"]);
    expect(cast.get("A")!.name).toBe("Unknown Voice");
    expect(cast.get("B")!.name).toBe("Unknown Voice");
  });
});

describe("dialogue parsing", () => {
  it("splits speaker lines", () => {
    expect(parseDialogue("A: Hi, I'm Tom. B: Nice to meet you, Tom.")).toEqual([
      { speaker: "A", text: "Hi, I'm Tom." },
      { speaker: "B", text: "Nice to meet you, Tom." },
    ]);
  });
  it("keeps monologues whole", () => {
    expect(parseDialogue("The train to Leeds leaves at 9:15.")).toEqual([{ speaker: null, text: "The train to Leeds leaves at 9:15." }]);
  });
});
