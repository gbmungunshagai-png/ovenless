import { describe, expect, test } from "bun:test";
import { getHeader, normalizeRawInput, INVALID_JSON_BODY } from "../framework/handler.ts";
import { queryInputFromSearchParams } from "../framework/core.ts";
import { parseOvenlessProfile, resolvePort } from "../framework/cli/dev-server.ts";

describe("getHeader", () => {
  test("matches case-insensitively", () => {
    expect(getHeader({ origin: "https://a.com" }, "Origin")).toBe("https://a.com");
    expect(getHeader({ Origin: "https://b.com" }, "origin")).toBe("https://b.com");
  });
});

describe("normalizeRawInput", () => {
  test("rejects invalid JSON sentinel", () => {
    expect(() => normalizeRawInput("POST", "/x", INVALID_JSON_BODY)).toThrow();
  });

  test("parses GET query strings", () => {
    const input = normalizeRawInput("GET", "/x?limit=10", undefined);
    expect(input).toEqual({ limit: "10" });
  });
});

describe("queryInputFromSearchParams", () => {
  test("collects duplicate keys as arrays", () => {
    const params = new URLSearchParams("tag=a&tag=b");
    expect(queryInputFromSearchParams(params)).toEqual({ tag: ["a", "b"] });
  });
});

describe("dev-server utilities", () => {
  test("resolvePort validates range", () => {
    expect(resolvePort(3000, 3000)).toBe(3000);
    expect(() => resolvePort("abc", 3000)).toThrow();
  });

  test("parseOvenlessProfile rejects unknown values", () => {
    expect(() => parseOvenlessProfile("invalid")).toThrow();
  });
});
