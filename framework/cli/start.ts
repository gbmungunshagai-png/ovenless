import { join } from "node:path";
import type { OvenlessProfile } from "../config.ts";
import { runDevServer } from "./dev-server.ts";

export async function runStart(profile: OvenlessProfile, watch: boolean): Promise<void> {
  if (watch) {
    const runner = join(import.meta.dir, "dev-server.ts");
    const child = Bun.spawn({
      cmd: [process.execPath, "--watch", runner],
      cwd: process.cwd(),
      env: { ...process.env, OVENLESS_PROFILE: profile },
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });

    await child.exited;
    process.exit(child.exitCode ?? 0);
  }

  await runDevServer(profile);
}
