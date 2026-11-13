import { describe, expect, it } from "vitest";
import { errorKey, normalizeJoinCode, validClassName, validDisplayName } from "./rules";

describe("class codes", () => {
  it("accept what people actually type", () => {
    expect(normalizeJoinCode(" k7m2qx ")).toBe("K7M2QX");
    expect(normalizeJoinCode("K7M-2QX")).toBe("K7M2QX");
  });
  it("refuse anything the database could never have generated", () => {
    expect(normalizeJoinCode("K7M2Q")).toBeNull(); // too short
    expect(normalizeJoinCode("K7M2QXA")).toBeNull(); // too long
    expect(normalizeJoinCode("O0I1AB")).toBeNull(); // look-alike symbols are never used
    expect(normalizeJoinCode("К7М2QХ")).toBeNull(); // Cyrillic look-alikes typed by mistake
  });
});

describe("names", () => {
  it("match the database limits", () => {
    expect(validDisplayName("  ")).toBe(false);
    expect(validDisplayName("Мария П.")).toBe(true);
    expect(validDisplayName("x".repeat(41))).toBe(false);
    expect(validClassName("x".repeat(60))).toBe(true);
    expect(validClassName("x".repeat(61))).toBe(false);
  });
});

describe("error messages", () => {
  it("explain network trouble instead of a generic failure", () => {
    expect(errorKey({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toBe("class.err.network");
    expect(errorKey({ message: "TypeError: Failed to fetch" })).toBe("class.err.network");
    expect(errorKey({ message: "Load failed" })).toBe("class.err.network"); // Safari's wording
  });
  it("map Supabase Auth codes", () => {
    expect(errorKey({ code: "invalid_credentials", status: 400 })).toBe("class.err.credentials");
    expect(errorKey({ code: "user_already_exists" })).toBe("class.err.exists");
    expect(errorKey({ code: "email_not_confirmed" })).toBe("class.err.notConfirmed");
    expect(errorKey({ code: "over_request_rate_limit", status: 429 })).toBe("class.err.rateLimited");
  });
  it("map the codes our database functions raise", () => {
    expect(errorKey({ code: "P0002", message: "no class with this code" })).toBe("class.err.noClass");
    expect(errorKey({ code: "42501" })).toBe("class.err.denied");
  });
  it("fall back to a generic message", () => {
    expect(errorKey({ code: "something_new" })).toBe("class.err.generic");
    expect(errorKey(null)).toBe("class.err.generic");
  });
});
