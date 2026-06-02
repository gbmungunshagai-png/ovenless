import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function resolveOvenlessRoot(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve("ovenless/package.json"));
}

export function runBuildOvenlessTypes(): void {
  const root = resolveOvenlessRoot();
  const publishedTypes = join(root, "dist/client.d.ts");

  if (existsSync(publishedTypes)) {
    return;
  }

  const result = spawnSync(process.execPath, ["run", "build:types"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error("Failed to build ovenless client types");
  }
}

export async function runBuildClient(root = process.cwd()): Promise<void> {
  if (!existsSync(join(root, "tsconfig.client.json"))) {
    throw new Error("No tsconfig.client.json found. Run create-ovenless to scaffold a project.");
  }

  runBuildOvenlessTypes();

  const result = spawnSync(process.execPath, ["x", "tsc", "-p", "tsconfig.client.json"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error("Client type build failed");
  }

  console.log("\n  Client types ready at dist/client/\n");
}
