#!/usr/bin/env bun
import { runCli } from "../framework/cli/index.ts";

try {
  await runCli(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n  Error: ${message}\n`);
  process.exit(1);
}
