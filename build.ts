import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = import.meta.dir;
const dist = join(root, "dist");

const external = ["zod", "@asteasolutions/zod-to-openapi", "typescript", "jose"];

async function bundle(): Promise<void> {
  const staging = join(dist, ".bundle");
  await mkdir(staging, { recursive: true });

  const result = await Bun.build({
    entrypoints: [
      join(root, "framework/index.ts"),
      join(root, "framework/client-entry.ts"),
      join(root, "bin/ovenless.ts"),
    ],
    outdir: staging,
    minify: true,
    target: "bun",
    sourcemap: "none",
    external,
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Bundle failed");
  }

  await rename(join(staging, "framework/index.js"), join(dist, "index.js"));
  await rename(
    join(staging, "framework/client-entry.js"),
    join(dist, "client.js"),
  );

  const cliSource = join(staging, "bin/ovenless.js");
  const cliTarget = join(dist, "cli.js");
  await rename(cliSource, cliTarget);

  const code = await Bun.file(cliTarget).text();
  if (!code.startsWith("#!")) {
    await writeFile(cliTarget, `#!/usr/bin/env bun\n${code}`);
  }

  await rm(staging, { recursive: true, force: true });
}

function emitTypes(): void {
  const result = spawnSync(
    process.execPath,
    ["x", "tsc", "-p", "tsconfig.types.json"],
    {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    throw new Error("Type declaration emit failed");
  }
}

async function normalizeTypeOutputs(): Promise<void> {
  const clientEntryTypes = join(dist, "client-entry.d.ts");
  const clientTypes = join(dist, "client.d.ts");

  try {
    await rename(clientEntryTypes, clientTypes);
  } catch {
    // already renamed or missing
  }

  for (const file of ["client-entry.d.ts.map", "index.d.ts.map"]) {
    await rm(join(dist, file), { force: true });
  }
}

async function main(): Promise<void> {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  console.log("  Bundling minified outputs...");
  await bundle();

  console.log("  Emitting TypeScript declarations...");
  emitTypes();
  await normalizeTypeOutputs();

  console.log("\n  Build complete → dist/\n");
}

await main();
