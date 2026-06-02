import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type OvenlessProfile, resolveProfileStage } from "../config.ts";
import { loadProfileEnv } from "./env.ts";
import { loadConfig } from "./load-config.ts";
import { writeServerlessYaml } from "./serverless.ts";

const HANDLER_ENTRY = `import { createAwsHandler } from "ovenless";
import config from "../ovenless.config.ts";

export const awsHandler = createAwsHandler(config.router, {
  title: config.title ?? config.service,
  version: config.version ?? "0.1.0",
});
`;

export async function runBuild(profile: OvenlessProfile, root = process.cwd()): Promise<void> {
  const env = loadProfileEnv(profile, root);
  const config = await loadConfig(root);

  const ovenlessDir = join(root, ".ovenless");
  mkdirSync(ovenlessDir, { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });

  const entryPath = join(ovenlessDir, "handler.entry.ts");
  writeFileSync(entryPath, HANDLER_ENTRY, "utf8");

  const build = await Bun.build({
    entrypoints: [entryPath],
    outdir: join(root, "dist"),
    target: "node",
    format: "cjs",
    sourcemap: profile === "production" ? "none" : "linked",
    minify: profile === "production",
    naming: "handler.[ext]",
    conditions: ["default"],
  });

  if (!build.success) {
    for (const log of build.logs) console.error(log.message ?? log);
    throw new Error("Build failed");
  }

  const serverlessPath = writeServerlessYaml(config, profile, env, root);

  console.log(`\n  Ovenless build complete (${profile})\n`);
  console.log(`  Lambda    dist/handler.js`);
  console.log(`  Deploy    ${serverlessPath}`);
  console.log(`  Stage     ${config.aws?.stage ?? resolveProfileStage(profile)}\n`);
}
