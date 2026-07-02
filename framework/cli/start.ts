import type { OvenlessProfile } from "../config.ts";
import { runDevServer } from "./dev-server.ts";

export async function runStart(
  profile: OvenlessProfile,
  watch: boolean,
): Promise<void> {
  // ponytail: re-exec the bundled CLI under `bun --watch` instead of a separate
  // dev-server.ts, which doesn't exist once the build bundles everything into cli.js.
  if (watch && !process.env.OVENLESS_WATCH_CHILD) {
    const entry = process.argv[1];
    if (!entry)
      throw new Error("Cannot determine CLI entry point for watch mode");
    const child = Bun.spawn({
      cmd: [
        process.execPath,
        "--watch",
        entry,
        "start",
        "--watch",
        "--profile",
        profile,
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        OVENLESS_PROFILE: profile,
        OVENLESS_WATCH_CHILD: "1",
      },
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });

    await child.exited;
    process.exit(child.exitCode ?? 0);
  }

  await runDevServer(profile);
}
