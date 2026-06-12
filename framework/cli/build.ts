import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertJwtKeysExist } from "../auth/keys.ts";
import { type OvenlessProfile, resolveProfileStage } from "../config.ts";
import { getRouterAuth } from "../core.ts";
import { applyEnv, loadProfileEnv, logLoadedEnvironments } from "./env.ts";
import { findConfigFile, loadConfig } from "./load-config.ts";
import { writeServerlessYaml } from "./serverless.ts";

function buildHandlerEntry(configFile: string): string {
  const configImport = `../${configFile}`;
  return `import { createAwsHandler } from "ovenless";
import config from "${configImport}";

export const awsHandler = createAwsHandler(config.router, {
  title: config.title ?? config.service,
  version: config.version ?? "0.1.0",
});
`;
}

function buildAuthorizerEntry(configFile: string): string {
  const configImport = `../${configFile}`;
  return `import { createJwtAuthorizer } from "ovenless";
import config from "${configImport}";

const auth = config.router.auth;
if (!auth) {
  throw new Error("Router auth config is required for JWT authorizer");
}

export const jwtAuthorizer = createJwtAuthorizer({ auth });
`;
}

export async function runBuild(profile: OvenlessProfile, root = process.cwd()): Promise<void> {
  const loaded = loadProfileEnv(profile, root);
  logLoadedEnvironments(loaded, "build");
  applyEnv(loaded.env, true);
  const config = await loadConfig(root);

  const routerAuth = getRouterAuth(config.router);
  if (routerAuth) {
    assertJwtKeysExist(routerAuth.profile, root, routerAuth.certDir);
  }

  const configFile = findConfigFile(root);
  if (!configFile) {
    throw new Error("No ovenless.config.ts or ovenless.config.js found");
  }

  const ovenlessDir = join(root, ".ovenless");
  mkdirSync(ovenlessDir, { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });

  const entryPath = join(ovenlessDir, "handler.ts");
  writeFileSync(entryPath, buildHandlerEntry(configFile), "utf8");

  const entrypoints = [entryPath];
  const naming: Record<string, string> = {
    [entryPath]: "handler.[ext]",
  };

  if (routerAuth?.authorizer) {
    const authorizerPath = join(ovenlessDir, "authorizer.ts");
    writeFileSync(authorizerPath, buildAuthorizerEntry(configFile), "utf8");
    entrypoints.push(authorizerPath);
    naming[authorizerPath] = "authorizer.[ext]";
  }

  const build = await Bun.build({
    entrypoints,
    outdir: join(root, "dist"),
    target: "node",
    format: "cjs",
    sourcemap: profile === "production" ? "none" : "linked",
    minify: profile === "production",
    naming,
    conditions: ["default"],
  });

  if (!build.success) {
    for (const log of build.logs) console.error(log.message ?? log);
    throw new Error("Build failed");
  }

  const serverlessPath = writeServerlessYaml(config, profile, loaded.env, root);

  console.log(`\n  Ovenless build complete (${profile})\n`);
  console.log(`  Lambda    dist/handler.js (Node ${config.aws?.runtime ?? "nodejs20.x"})`);
  if (routerAuth?.authorizer) {
    console.log(`  Auth      dist/authorizer.js (JWT authorizer)`);
  }
  console.log(`  Deploy    ${serverlessPath}`);
  console.log(`  Stage     ${config.aws?.stage ?? resolveProfileStage(profile)}\n`);
}
