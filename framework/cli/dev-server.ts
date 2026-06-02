import { createHandler } from "../handler.ts";
import type { OvenlessProfile } from "../config.ts";
import { applyEnv, loadProfileEnv, logLoadedEnvironments } from "./env.ts";
import { loadConfig } from "./load-config.ts";

export function parseOvenlessProfile(raw: string | undefined): OvenlessProfile {
  const profile = raw ?? "development";
  if (profile !== "development" && profile !== "staging" && profile !== "production") {
    throw new Error(
      `Invalid OVENLESS_PROFILE: ${profile} (expected development, staging, or production)`,
    );
  }
  return profile;
}

export function resolvePort(raw: string | number | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid port: ${String(raw)} (expected integer 1–65535)`);
  }
  return n;
}

export async function runDevServer(profile: OvenlessProfile): Promise<void> {
  const loaded = loadProfileEnv(profile);
  logLoadedEnvironments(loaded, "start");
  applyEnv(loaded.env, true);
  const config = await loadConfig();

  const handler = createHandler(config.router, {
    title: config.title ?? config.service,
    version: config.version ?? "0.1.0",
    exposeErrorDetails: profile === "development",
  });

  const port = resolvePort(process.env.PORT ?? config.port, 3000);

  Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      let body: unknown;

      if (request.method !== "GET" && request.method !== "HEAD") {
        const text = await request.text();
        if (text.length === 0) {
          body = undefined;
        } else {
          try {
            body = JSON.parse(text) as unknown;
          } catch {
            return new Response(
              JSON.stringify({
                error: { code: "INVALID_JSON", message: "Malformed JSON body" },
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
        }
      }

      const response = await handler({
        method: request.method,
        path: url.pathname + url.search,
        body,
        headers: Object.fromEntries(request.headers.entries()),
      });

      return new Response(response.body ?? null, {
        status: response.statusCode,
        headers: response.headers,
      });
    },
  });

  console.log(`\n  Ovenless ${profile}  →  http://localhost:${port}\n`);
  console.log(`  API       http://localhost:${port}/`);
  console.log(`  Docs      http://localhost:${port}/docs`);
  console.log(`  OpenAPI   http://localhost:${port}/openapi.json\n`);
}

if (import.meta.main) {
  const profile = parseOvenlessProfile(process.env.OVENLESS_PROFILE);
  runDevServer(profile).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
