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

export function defineConfig<T extends OvenlessConfig>(config: T): Readonly<T> {
  if (!config?.router) {
    throw new Error('defineConfig: "router" is required');
  }
  if (typeof config.service !== "string" || config.service.trim() === "") {
    throw new Error('defineConfig: "service" must be a non-empty string');
  }
  return Object.freeze({
    ...config,
    service: config.service.trim(),
  }) as Readonly<T>;
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
