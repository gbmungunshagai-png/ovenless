import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  collectProcedures,
  createClient,
  createHandler,
  createRouter,
  mutation,
  query,
  resolveProcedure,
} from "../framework/index.ts";
import { testRouter } from "./fixtures/router.ts";

describe("core router", () => {
  test("resolves nested procedures", () => {
    const resolved = resolveProcedure(testRouter, ["users", "getById"]);
    expect(resolved?.path).toBe("users.getById");
    expect(resolved?.procedure.type).toBe("query");
  });

  test("collects all procedures", () => {
    const paths = collectProcedures(testRouter).map((p) => p.path);
    expect(paths).toContain("health");
    expect(paths).toContain("users.getById");
    expect(paths).toContain("users.create");
  });
});

describe("HTTP handler", () => {
  const handler = createHandler(testRouter, { title: "Test", version: "0.0.1" });

  test("GET / returns API metadata", async () => {
    const res = await handler({ method: "GET", path: "/" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? "{}");
    expect(body.procedures.length).toBeGreaterThan(0);
  });

  test("calls health query", async () => {
    const res = await handler({
      method: "POST",
      path: "/health",
      body: {},
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? "{}");
    expect(body.status).toBe("ok");
  });

  test("calls users.getById query", async () => {
    const res = await handler({
      method: "POST",
      path: "/users/getById",
      body: { id: "1" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? "{}");
    expect(body.name).toBe("Alice");
  });

  test("returns validation error for bad input", async () => {
    const res = await handler({
      method: "POST",
      path: "/users/create",
      body: { name: "Charlie", email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body ?? "{}");
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("creates user via mutation", async () => {
    const res = await handler({
      method: "POST",
      path: "/users/create",
      body: { name: "Charlie", email: "charlie@example.com" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? "{}");
    expect(body.email).toBe("charlie@example.com");
  });

  test("serves openapi.json", async () => {
    const res = await handler({ method: "GET", path: "/openapi.json" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? "{}");
    expect(body.openapi).toBe("3.0.3");
  });

  test("serves scalar docs html", async () => {
    const res = await handler({ method: "GET", path: "/docs" });
    expect(res.statusCode).toBe(200);
    expect(res.headers?.["Content-Type"]).toContain("text/html");
    expect(res.body).toContain("scalar");
  });
});

describe("type-safe client", () => {
  test("proxy client calls procedures", async () => {
    const handler = createHandler(testRouter);

    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        const body = await request.json().catch(() => ({}));
        const res = await handler({
          method: request.method,
          path: url.pathname,
          body,
        });
        return new Response(res.body, { status: res.statusCode, headers: res.headers });
      },
    });

    const client = createClient<typeof testRouter>({
      url: `http://localhost:${server.port}`,
    });

    const health = await client.health();
    expect(health.status).toBe("ok");

    const user = await client.users.getById({ id: "2" });
    expect(user.name).toBe("Bob");

    server.stop();
  });
});

describe("minimal router", () => {
  test("query and mutation work end-to-end", async () => {
    const router = createRouter({
      echo: query({
        input: z.object({ message: z.string() }),
        output: z.object({ message: z.string() }),
        handler: ({ message }) => ({ message }),
      }),
      ping: mutation({
        output: z.object({ pong: z.boolean() }),
        handler: () => ({ pong: true }),
      }),
    });

    const handler = createHandler(router);
    const echo = await handler({
      method: "POST",
      path: "/echo",
      body: { message: "hello" },
    });
    expect(JSON.parse(echo.body ?? "{}").message).toBe("hello");

    const ping = await handler({ method: "POST", path: "/ping", body: {} });
    expect(JSON.parse(ping.body ?? "{}").pong).toBe(true);
  });
});
