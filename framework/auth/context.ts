import type { ZodType } from "zod";
import { z } from "zod";
import type { OvenlessProfile } from "../config.ts";
import { parseTtl } from "./ttl.ts";

export type AuthMode = "bearer" | "cookie";

export interface AuthCookieOptions {
  name?: string;
  path?: string;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  httpOnly?: boolean;
}

export interface RouterAuthConfig<TClaims extends ZodType | undefined = ZodType | undefined> {
  mode: AuthMode;
  ttl: string | number;
  autoRotate?: boolean;
  claims?: TClaims;
  /** Procedure paths that skip JWT (e.g. health, login) */
  public?: string[];
  cookie?: AuthCookieOptions;
  /** Deploy separate Lambda REQUEST authorizer (Serverless codegen) */
  authorizer?: boolean;
}

export interface ResolvedAuthConfig {
  mode: AuthMode;
  ttlSeconds: number;
  autoRotate: boolean;
  claimsSchema?: ZodType;
  publicPaths: Set<string>;
  cookieName: string;
  cookiePath: string;
  cookieSecure: boolean;
  cookieSameSite: "strict" | "lax" | "none";
  cookieHttpOnly: boolean;
  authorizer: boolean;
  profile: OvenlessProfile;
  certDir: string;
}

export interface SignTokenInput<TClaims = Record<string, unknown>> {
  principalId: string;
  claims?: TClaims;
}

export interface VerifiedToken {
  principalId: string;
  claims: Record<string, unknown>;
  expiresAt: number;
  issuedAt: number;
  raw: string;
}

export interface JwtRuntime<TClaims = Record<string, unknown>> {
  sign(input: SignTokenInput<TClaims>): Promise<string>;
  setCookie(token: string): void;
  clearCookie(): void;
}

export type AuthClaims<TClaims extends ZodType | undefined> = TClaims extends ZodType
  ? z.infer<TClaims>
  : Record<string, unknown>;

/** Handler context for protected procedures (internal; use ProcedureContext in handlers) */
export interface AuthContext<TClaims extends ZodType | undefined = undefined> {
  principalId: string;
  claims: AuthClaims<TClaims>;
  auth: JwtRuntime<AuthClaims<TClaims>>;
}

/** Handler context for public procedures (login, health) */
export interface PublicAuthContext<TClaims extends ZodType | undefined = undefined> {
  auth: JwtRuntime<AuthClaims<TClaims>>;
}

/**
 * Single handler argument: validated procedure input (spread) + auth fields.
 * Use `({ limit, principalId, claims })` or `({ input, principalId })` — `input` is the full parsed body.
 */
export type ProcedureContext<
  TInput,
  TClaims extends ZodType | undefined = undefined,
> = TInput & {
  input: TInput;
  principalId: string;
  claims: AuthClaims<TClaims>;
  auth: JwtRuntime<AuthClaims<TClaims>>;
};

/** Public procedure handler context (no principalId until signed in) */
export type PublicProcedureContext<
  TInput,
  TClaims extends ZodType | undefined = undefined,
> = TInput & {
  input: TInput;
  auth: JwtRuntime<AuthClaims<TClaims>>;
};

export function mergeProtectedContext<TInput extends object>(
  input: TInput,
  ctx: AuthContext,
): ProcedureContext<TInput> {
  return {
    ...input,
    input,
    principalId: ctx.principalId,
    claims: ctx.claims,
    auth: ctx.auth,
  };
}

export function mergePublicContext<TInput extends object>(
  input: TInput,
  ctx: PublicAuthContext,
): PublicProcedureContext<TInput> {
  return {
    ...input,
    input,
    auth: ctx.auth,
  };
}

export interface RequestAuthState {
  principalId?: string;
  claims?: Record<string, unknown>;
  token?: string;
  expiresAt?: number;
}

export interface HttpRequestAuth {
  principalId?: string;
  claims?: string;
  lambda?: Record<string, string | number | boolean | undefined>;
}

const DEFAULT_COOKIE_NAME = "ovenless_token";

export function resolveAuthConfig(
  config: RouterAuthConfig,
  options?: { profile?: OvenlessProfile; certDir?: string },
): ResolvedAuthConfig {
  const profile = options?.profile ?? parseProfileFromEnv();
  const publicPaths = new Set(config.public ?? []);
  const cookie = config.cookie ?? {};

  return {
    mode: config.mode,
    ttlSeconds: parseTtl(config.ttl),
    autoRotate: config.autoRotate ?? false,
    claimsSchema: config.claims,
    publicPaths,
    cookieName: cookie.name ?? DEFAULT_COOKIE_NAME,
    cookiePath: cookie.path ?? "/",
    cookieSecure: cookie.secure ?? profile === "production",
    cookieSameSite: cookie.sameSite ?? "lax",
    cookieHttpOnly: cookie.httpOnly ?? true,
    authorizer: config.authorizer ?? true,
    profile,
    certDir: options?.certDir ?? "cert",
  };
}

export function parseProfileFromEnv(): OvenlessProfile {
  const raw = process.env.OVENLESS_PROFILE ?? "development";
  if (raw === "development" || raw === "staging" || raw === "production") {
    return raw;
  }
  return "development";
}

export function isPublicProcedurePath(
  auth: ResolvedAuthConfig | undefined,
  path: string,
  procedurePublic?: boolean,
): boolean {
  if (procedurePublic) return true;
  if (!auth) return true;
  return auth.publicPaths.has(path);
}
