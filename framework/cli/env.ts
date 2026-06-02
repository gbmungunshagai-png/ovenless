import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OvenlessProfile } from "../config.ts";

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export function loadEnvFile(path: string, override = false): Record<string, string> {
  if (!existsSync(path)) return {};

  const parsed = parseEnvFile(readFileSync(path, "utf8"));

  for (const [key, value] of Object.entries(parsed)) {
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return parsed;
}

export function loadProfileEnv(profile: OvenlessProfile, root = process.cwd()): Record<string, string> {
  const merged: Record<string, string> = {};

  Object.assign(merged, loadEnvFile(join(root, ".env")));
  Object.assign(merged, loadEnvFile(join(root, `.env.${profile}`), true));

  const localFile = join(root, ".env.local");
  if (existsSync(localFile)) {
    Object.assign(merged, loadEnvFile(localFile, true));
  }

  process.env.OVENLESS_PROFILE = profile;
  return merged;
}
