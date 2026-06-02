import { runBuild } from "./build.ts";
import { runBuildClient } from "./build-client.ts";
import { runGenerateCerts } from "./generate-certs.ts";
import { parseCli } from "./parse-args.ts";
import { runStart } from "./start.ts";

function printHelp(): void {
  console.log(`
ovenless — type-safe serverless RPC

Usage:
  ovenless start [--watch] [--profile development|staging|production]
  ovenless build --profile development|staging|production
  ovenless build:client
  ovenless certs [--profile development|staging|production] [--comment <text>] [--force]

Examples:
  ovenless start --watch
  ovenless build --profile staging
  ovenless build:client
  ovenless certs --profile staging --comment "my-api staging JWT"

Env files (loaded in order):
  .env
  .env.<profile>
  .env.local
`);
}

export async function runCli(argv: string[]): Promise<void> {
  const { command, flags } = parseCli(argv);

  switch (command) {
    case "start":
      await runStart(flags.profile, flags.watch);
      return;

    case "build":
      await runBuild(flags.profile);
      return;

    case "build:client":
      await runBuildClient();
      return;

    case "certs":
    case "generate-certs":
      runGenerateCerts({
        profile: flags.profile,
        comment: flags.comment,
        force: flags.force,
      });
      return;

    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;

    default:
      throw new Error(`Unknown command: ${command}\nRun "ovenless help" for usage.`);
  }
}
