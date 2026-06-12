import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { runGenerateCerts } from "../framework/cli/generate-certs.ts";
import { createHandler, createRouter, mutation, query } from "../framework/index.ts";
import { parseTtl } from "../framework/auth/ttl.ts";
import { JwtService } from "../framework/auth/jwt.ts";
import { loadJwtKeys } from "../framework/auth/keys.ts";
import { resolveAuthConfig } from "../framework/auth/context.ts";

function createAuthFixture(root: string) {
  runGenerateCerts({ profile: "development", root, force: true });

  const claimsSchema = z.object({ role: z.enum(["user", "admin"]) });

  const router = createRouter(
    {
      health: query({
        meta: { public: true },
        output: z.object({ ok: z.boolean() }),
        handler: () => ({ ok: true }),
      }),

      login: mutation({
        meta: { public: true },
        input: z.object({ userId: z.string() }),
        output: z.object({ ok: z.literal(true) }),
        handler: async ({ userId, auth }) => {
          await auth.sign({
            principalId: userId,
            claims: { role: "user" as const },
          });
          return { ok: true as const };
        },
      }),

      me: query({
        output: z.object({ principalId: z.string(), role: z.string() }),
        handler: ({ principalId, claims }) => ({
          principalId,
          role: (claims as { role: "user" | "admin" }).role,
        }),
      }),
    },
    {
      auth: {
        mode: "bearer",
        ttl: "10m",
        claims: claimsSchema,
        public: ["health"],
      },
      profile: "development",
    },
  );

  const handler = createHandler(router, { root });
  return { router, handler };
}

describe("auth ttl", () => {
  test("parses duration strings", () => {
    expect(parseTtl("10m")).toBe(600);
    expect(parseTtl("7d")).toBe(604800);
    expect(parseTtl(3600)).toBe(3600);
  });
});

describe("JWT service", () => {
  test("sign and verify round-trip", async () => {
    const root = mkdtempSync(join(tmpdir(), "ovenless-jwt-"));
    try {
      runGenerateCerts({ profile: "development", root, force: true });
      const keys = loadJwtKeys("development", root);
      const auth = resolveAuthConfig({ mode: "bearer", ttl: "1h" }, { profile: "development" });
      const jwt = new JwtService(keys, auth);

      const token = await jwt.sign({
        principalId: "user-42",
        claims: { role: "admin" },
      });

      const verified = await jwt.verify(token);
      expect(verified.principalId).toBe("user-42");
      expect(verified.claims.role).toBe("admin");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("HTTP handler auth", () => {
  test("public route works without token", async () => {
    const root = mkdtempSync(join(tmpdir(), "ovenless-auth-public-"));
    try {
      const { handler } = createAuthFixture(root);
      const res = await handler({ method: "POST", path: "/health", body: {} });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body ?? "{}").ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("protected route returns 401 without token", async () => {
    const root = mkdtempSync(join(tmpdir(), "ovenless-auth-401-"));
    try {
      const { handler } = createAuthFixture(root);
      const res = await handler({ method: "POST", path: "/me", body: {} });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body ?? "{}").error.code).toBe("UNAUTHORIZED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("protected route accepts bearer token after login", async () => {
    const root = mkdtempSync(join(tmpdir(), "ovenless-auth-bearer-"));
    try {
      const { handler } = createAuthFixture(root);

      const login = await handler({
        method: "POST",
        path: "/login",
        body: { userId: "alice" },
      });
      expect(login.statusCode).toBe(200);

      const keys = loadJwtKeys("development", root);
      const auth = resolveAuthConfig({ mode: "bearer", ttl: "10m" }, { profile: "development" });
      const jwt = new JwtService(keys, auth);
      const token = await jwt.sign({
        principalId: "alice",
        claims: { role: "user" },
      });

      const me = await handler({
        method: "POST",
        path: "/me",
        body: {},
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(me.statusCode).toBe(200);
      const body = JSON.parse(me.body ?? "{}");
      expect(body.principalId).toBe("alice");
      expect(body.role).toBe("user");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("cookie mode sets Set-Cookie on login", async () => {
    const root = mkdtempSync(join(tmpdir(), "ovenless-auth-cookie-"));
    try {
      runGenerateCerts({ profile: "development", root, force: true });

      const router = createRouter(
        {
          login: mutation({
            meta: { public: true },
            input: z.object({ userId: z.string() }),
            output: z.object({ ok: z.boolean() }),
            handler: async ({ userId, auth }) => {
              await auth.sign({
                principalId: userId,
                claims: {},
              });
              return { ok: true };
            },
          }),
        },
        {
          auth: { mode: "cookie", ttl: "1h", authorizer: false },
          profile: "development",
        },
      );

      const handler = createHandler(router, { root });
      const res = await handler({
        method: "POST",
        path: "/login",
        body: { userId: "bob" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers?.["Set-Cookie"]).toContain("ovenless_token=");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
