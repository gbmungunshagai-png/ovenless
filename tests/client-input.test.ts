import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  createClient,
  createHandler,
  createRouter,
  query,
  type InferClientProcedure,
} from "../framework/index.ts";

describe("optional client input", () => {
  test("no-input procedure is callable without arguments", async () => {
    const router = createRouter({
      health: query({
        output: z.object({ ok: z.literal(true) }),
        handler: () => ({ ok: true as const }),
      }),
    });

    type HealthClient = InferClientProcedure<(typeof router.procedures.health)>;

    const _typeCheck: HealthClient = async () => ({ ok: true });
    void _typeCheck;

    const handler = createHandler(router);
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        const body = await request.json().catch(() => ({}));
        const res = await handler({ method: request.method, path: url.pathname, body });
        return new Response(res.body, { status: res.statusCode, headers: res.headers });
      },
    });

    const client = createClient<typeof router>({ url: `http://localhost:${server.port}` });
    await expect(client.health()).resolves.toEqual({ ok: true });

    server.stop();
  });

  test("all-optional input procedure is callable without arguments", async () => {
    const router = createRouter({
      list: query({
        input: z.object({ limit: z.number().optional().default(10) }),
        output: z.object({ count: z.number() }),
        handler: ({ limit }) => ({ count: limit }),
      }),
    });

    const handler = createHandler(router);
    const res = await handler({ method: "POST", path: "/list", body: {} });
    expect(JSON.parse(res.body ?? "{}").count).toBe(10);
  });
});
