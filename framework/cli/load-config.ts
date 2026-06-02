import { existsSync } from "node:fs";
import { join } from "node:path";
import type { OvenlessConfig } from "../config.ts";

const CONFIG_FILES = ["ovenless.config.ts", "ovenless.config.js"] as const;

export async function loadConfig(root = process.cwd()): Promise<OvenlessConfig> {
  for (const file of CONFIG_FILES) {
    const path = join(root, file);
    if (!existsSync(path)) continue;

    const mod = await import(path);
    const config = mod.default ?? mod.config;

    if (!config?.router) {
      throw new Error(`${file} must default-export defineConfig({ router, service, ... })`);
    }

    if (!config.service) {
      throw new Error(`${file} is missing required "service" field`);
    }

    return config as OvenlessConfig;
  }

  throw new Error(
    "No ovenless.config.ts found. Create one with defineConfig({ router, service, ... }).",
  );
}
