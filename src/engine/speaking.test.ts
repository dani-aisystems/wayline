import { describe, expect, it } from "vitest";
import { checkKeywords, compareSpeech, words } from "./speaking";

describe("speech comparison", () => {
  it("normalises contractions, numbers and punctuation", () => {
    expect(words("I'm twenty-one!")).toEqual(["i", "am", "21"]);
    expect(words("It's 5 o'clock")).toEqual(["it", "is", "5", "o'clock"]);
    expect(words("I have two cats")).toEqual(["i", "have", "2", "cats"]);
  });
  it("marks every word heard when the transcript matches", () => {
    const c = compareSpeech("Nice to meet you.", "nice to meet you");
    expect(c.coverage).toBe(1);
    expect(c.complete).toBe(true);
  });
  it("finds missing and extra words", () => {
    const c = compareSpeech("Where are you from?", "where you from today");
    expect(c.target.map((w) => w.status)).toEqual(["heard", "missing", "heard", "heard"]);
    expect(c.extra).toEqual(["today"]);
    expect(c.complete).toBe(false);
  });
  it("treats I am and I'm as the same", () => {
    expect(compareSpeech("I'm from Sofia.", "I am from Sofia").complete).toBe(true);
  });
  it("checks keyword groups for open answers", () => {
    expect(checkKeywords([["from"], ["Bulgaria", "Sofia", "Plovdiv"]], "I'm from Plovdiv")).toEqual([
      { group: ["from"], found: true },
      { group: ["Bulgaria", "Sofia", "Plovdiv"], found: true },
    ]);
  });
});
