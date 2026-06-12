import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { ZodType } from "zod";
import { ZodError } from "zod";
import type { JwtKeyPair } from "./keys.ts";
import type { AuthMode, ResolvedAuthConfig, SignTokenInput, VerifiedToken } from "./context.ts";
import { getHeader } from "../handler.ts";

const JWT_ALG = "RS256";

let cachedPrivateKey: KeyObject | null = null;
let cachedPublicKey: KeyObject | null = null;
let cachedKeysSource: string | null = null;

function getPrivateKey(pem: string): KeyObject {
  if (cachedPrivateKey && cachedKeysSource === pem) return cachedPrivateKey;
  cachedPrivateKey = createPrivateKey(pem);
  cachedKeysSource = pem;
  return cachedPrivateKey;
}

function getPublicKey(pem: string): KeyObject {
  if (cachedPublicKey && cachedKeysSource === pem) return cachedPublicKey;
  cachedPublicKey = createPublicKey(pem);
  return cachedPublicKey;
}

export function extractToken(
  headers: Record<string, string | undefined> | undefined,
  cookieHeader: string | undefined,
  mode: AuthMode,
  cookieName: string,
): string | undefined {
  if (mode === "bearer") {
    const auth = getHeader(headers, "Authorization");
    if (!auth) return undefined;
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    return match?.[1]?.trim();
  }

  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === cookieName) return rest.join("=").trim();
  }
  return undefined;
}

export class JwtService {
  constructor(
    private readonly keys: JwtKeyPair,
    private readonly auth: ResolvedAuthConfig,
  ) {}

  async sign(input: SignTokenInput): Promise<string> {
    const privateKey = getPrivateKey(this.keys.privateKeyPem);
    const payload: Record<string, unknown> = {
      ...(input.claims ?? {}),
    };

    return new SignJWT(payload)
      .setProtectedHeader({ alg: JWT_ALG })
      .setSubject(input.principalId)
      .setIssuedAt()
      .setExpirationTime(`${this.auth.ttlSeconds}s`)
      .sign(privateKey);
  }

  async verify(token: string): Promise<VerifiedToken> {
    const publicKey = getPublicKey(this.keys.publicKeyPem);
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      algorithms: [JWT_ALG],
    });

    if (protectedHeader.alg !== JWT_ALG) {
      throw new Error("Invalid JWT algorithm");
    }

    const principalId = payload.sub;
    if (!principalId || typeof principalId !== "string") {
      throw new Error("JWT missing sub claim");
    }

    const { sub, iat, exp, ...rest } = payload;
    void sub;
    void iat;
    void exp;

    let claims = rest as Record<string, unknown>;
    if (this.auth.claimsSchema) {
      try {
        claims = this.auth.claimsSchema.parse(rest) as Record<string, unknown>;
      } catch (err) {
        if (err instanceof ZodError) {
          throw new Error("JWT claims validation failed");
        }
        throw err;
      }
    }

    return {
      principalId,
      claims,
      expiresAt: payload.exp ?? 0,
      issuedAt: payload.iat ?? 0,
      raw: token,
    };
  }
}

export function formatSetCookie(
  token: string,
  auth: ResolvedAuthConfig,
  maxAgeSeconds: number,
): string {
  const parts = [
    `${auth.cookieName}=${token}`,
    `Path=${auth.cookiePath}`,
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${capitalizeSameSite(auth.cookieSameSite)}`,
  ];
  if (auth.cookieHttpOnly) parts.push("HttpOnly");
  if (auth.cookieSecure) parts.push("Secure");
  return parts.join("; ");
}

function capitalizeSameSite(value: "strict" | "lax" | "none"): string {
  if (value === "lax") return "Lax";
  if (value === "strict") return "Strict";
  return "None";
}

export function formatClearCookie(auth: ResolvedAuthConfig): string {
  const parts = [
    `${auth.cookieName}=`,
    `Path=${auth.cookiePath}`,
    "Max-Age=0",
    `SameSite=${capitalizeSameSite(auth.cookieSameSite)}`,
  ];
  if (auth.cookieHttpOnly) parts.push("HttpOnly");
  if (auth.cookieSecure) parts.push("Secure");
  return parts.join("; ");
}

export function shouldRotateToken(
  verified: VerifiedToken,
  ttlSeconds: number,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const remaining = verified.expiresAt - now;
  return remaining > 0 && remaining < ttlSeconds * 0.25;
}
