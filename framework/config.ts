import type { Router } from "./core.ts";

export type OvenlessProfile = "development" | "staging" | "production";

export interface OvenlessAwsConfig {
  region?: string;
  runtime?: string;
  stage?: string;
}

export interface OvenlessConfig {
  router: Router;
  service: string;
  title?: string;
  version?: string;
  port?: number;
  aws?: OvenlessAwsConfig;
}

export function defineConfig<T extends OvenlessConfig>(config: T): T {
  return config;
}

export function resolveProfileStage(profile: OvenlessProfile): string {
  switch (profile) {
    case "production":
      return "prod";
    case "staging":
      return "staging";
    default:
      return "dev";
  }
}
