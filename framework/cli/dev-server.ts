import { createHandler } from "../handler.ts";
import { loadConfig } from "./load-config.ts";
import { loadProfileEnv } from "./env.ts";
import type { OvenlessProfile } from "../config.ts";

export async function runDevServer(profile: OvenlessProfile): Promise<void> {
  loadProfileEnv(profile);
  const config = await loadConfig();

  const handler = createHandler(config.router, {
    title: config.title ?? config.service,
    version: config.version ?? "0.1.0",
  });

  const port = Number(process.env.PORT ?? config.port ?? 3000);

  Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      let body: unknown;

      if (request.method !== "GET" && request.method !== "HEAD") {
        try {
          body = await request.json();
        } catch {
          body = undefined;
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
  void (async () => {
    const profile = (process.env.OVENLESS_PROFILE ?? "development") as OvenlessProfile;
    await runDevServer(profile);
  })();
}
