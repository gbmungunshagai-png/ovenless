import { existsSync } from "node:fs";
import { join } from "node:path";
import type { OvenlessConfig } from "../config.ts";
import { assertRouterShape } from "../handler.ts";

export const CONFIG_FILES = ["ovenless.config.ts", "ovenless.config.js"] as const;

export type ConfigFileName = (typeof CONFIG_FILES)[number];

export function findConfigFile(root = process.cwd()): ConfigFileName | null {
  for (const file of CONFIG_FILES) {
    if (existsSync(join(root, file))) return file;
  }
  return null;
}

export async function loadConfig(root = process.cwd()): Promise<OvenlessConfig> {
  for (const file of CONFIG_FILES) {
    const path = join(root, file);
    if (!existsSync(path)) continue;

    const mod = await import(path);
    const config = mod.default ?? mod.config;

    if (!config?.router) {
      throw new Error(`${file} must default-export defineConfig({ router, service, ... })`);
    }

    if (typeof config.service !== "string" || config.service.trim() === "") {
      throw new Error(`${file} is missing required "service" field`);
    }

    assertRouterShape(config.router);

    return {
      ...config,
      service: config.service.trim(),
    } as OvenlessConfig;
  }

  throw new Error(
    "No ovenless.config.ts found. Create one with defineConfig({ router, service, ... }).",
  );
}
