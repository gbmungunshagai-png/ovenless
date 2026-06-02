import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { OvenlessProfile } from "../config.ts";

export interface LoadedEnvFile {
  /** File name relative to project root, e.g. `.env.development` */
  file: string;
  /** Number of variables defined in this file (excluding comments/blanks) */
  keys: number;
}

export interface ProfileEnvResult {
  profile: OvenlessProfile;
  /** Merged variables (later files override earlier) */
  env: Record<string, string>;
  /** Files that existed and were loaded, in load order */
  loaded: LoadedEnvFile[];
  root: string;
}

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

function parseEnvFileIfExists(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseEnvFile(readFileSync(path, "utf8"));
}

function tryLoadEnvFile(root: string, fileName: string): LoadedEnvFile | null {
  const path = join(root, fileName);
  if (!existsSync(path)) return null;
  const parsed = parseEnvFileIfExists(path);
  return { file: fileName, keys: Object.keys(parsed).length };
}

export function loadEnvFile(path: string, override = false): Record<string, string> {
  const parsed = parseEnvFileIfExists(path);
  applyEnv(parsed, override);
  return parsed;
}

/** Apply env vars to process.env (opt-in; used by dev server and child processes) */
export function applyEnv(env: Record<string, string>, override = false): void {
  for (const [key, value] of Object.entries(env)) {
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Merge profile env files without mutating process.env */
export function loadProfileEnv(profile: OvenlessProfile, root = process.cwd()): ProfileEnvResult {
  const loaded: LoadedEnvFile[] = [];
  const merged: Record<string, string> = {};

  const base = tryLoadEnvFile(root, ".env");
  if (base) {
    loaded.push(base);
    Object.assign(merged, parseEnvFileIfExists(join(root, ".env")));
  }

  const profileFile = `.env.${profile}`;
  const profileEntry = tryLoadEnvFile(root, profileFile);
  if (profileEntry) {
    loaded.push(profileEntry);
    Object.assign(merged, parseEnvFileIfExists(join(root, profileFile)));
  }

  const local = tryLoadEnvFile(root, ".env.local");
  if (local) {
    loaded.push(local);
    Object.assign(merged, parseEnvFileIfExists(join(root, ".env.local")));
  }

  merged.OVENLESS_PROFILE = profile;

  return { profile, env: merged, loaded, root };
}

/** Next.js-style console output for which env files were loaded */
export function logLoadedEnvironments(result: ProfileEnvResult, command: string): void {
  const cwd = result.root;
  const rel = (file: string) => {
    const path = join(cwd, file);
    const r = relative(process.cwd(), path);
    return r && !r.startsWith("..") ? r : file;
  };

  const profileLabel = result.profile;
  const envList =
    result.loaded.length > 0
      ? result.loaded.map((f) => rel(f.file)).join(", ")
      : "(none)";

  const varCount = Object.keys(result.env).filter((k) => k !== "OVENLESS_PROFILE").length;

  console.log("");
  console.log(`  ▲ Ovenless ${command}  ·  ${profileLabel}`);
  console.log(`  - Environments: ${envList}`);
  if (varCount > 0) {
    console.log(`  - Variables: ${varCount} from env files (+ OVENLESS_PROFILE)`);
  }
  console.log("");
}
