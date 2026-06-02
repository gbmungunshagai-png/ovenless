import type { OvenlessProfile } from "../config.ts";

const PROFILES = new Set<OvenlessProfile>(["development", "staging", "production"]);

export interface CliFlags {
  watch: boolean;
  profile: OvenlessProfile;
}

export interface ParsedCli {
  command?: string;
  flags: CliFlags;
}

export function parseCli(argv: string[]): ParsedCli {
  const args = argv.slice(2);
  const flags: CliFlags = { watch: false, profile: "development" };
  let profileExplicit = false;

  let command: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--watch") {
      flags.watch = true;
      continue;
    }

    if (arg === "--profile") {
      const value = args[++i];
      if (!value || !PROFILES.has(value as OvenlessProfile)) {
        throw new Error(`--profile requires one of: ${[...PROFILES].join(", ")}`);
      }
      flags.profile = value as OvenlessProfile;
      profileExplicit = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    positional.push(arg);
  }

  command = positional[0];

  if (command === "build" && !profileExplicit) {
    flags.profile = "production";
  }

  return { command, flags };
}
