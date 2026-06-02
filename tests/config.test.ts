import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createRouter, defineConfig, query } from "../framework/index.ts";

describe("defineConfig", () => {
  test("requires router and service", () => {
    expect(() => defineConfig({} as never)).toThrow(/router/);
    expect(() =>
      defineConfig({
        router: createRouter({}),
        service: "   ",
      }),
    ).toThrow(/service/);
  });

  test("returns frozen config", () => {
    const config = defineConfig({
      router: createRouter({
        ping: query({
          output: z.object({ ok: z.boolean() }),
          handler: () => ({ ok: true }),
        }),
      }),
      service: "demo",
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(config.service).toBe("demo");
  });
});
