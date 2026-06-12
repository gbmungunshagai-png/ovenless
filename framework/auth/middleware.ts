import type { ZodType } from "zod";
import type { HttpRequest } from "../handler.ts";
import { getHeader } from "../handler.ts";
import { loadJwtKeys } from "./keys.ts";
import {
  type AuthContext,
  type JwtRuntime,
  type PublicAuthContext,
  type RequestAuthState,
  type ResolvedAuthConfig,
  type SignTokenInput,
  isPublicProcedurePath,
} from "./context.ts";
import {
  extractToken,
  formatClearCookie,
  formatSetCookie,
  JwtService,
  shouldRotateToken,
} from "./jwt.ts";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface AuthMiddlewareState {
  pendingCookies: string[];
}

export function createAuthMiddlewareState(): AuthMiddlewareState {
  return { pendingCookies: [] };
}

export function createJwtRuntime(
  jwt: JwtService,
  auth: ResolvedAuthConfig,
  state: AuthMiddlewareState,
): JwtRuntime {
  return {
    async sign(input: SignTokenInput) {
      const token = await jwt.sign(input);
      if (auth.mode === "cookie") {
        state.pendingCookies.push(formatSetCookie(token, auth, auth.ttlSeconds));
      }
      return token;
    },
    setCookie(token: string) {
      if (auth.mode === "cookie") {
        state.pendingCookies.push(formatSetCookie(token, auth, auth.ttlSeconds));
      }
    },
    clearCookie() {
      if (auth.mode === "cookie") {
        state.pendingCookies.push(formatClearCookie(auth));
      }
    },
  };
}

export async function resolveRequestAuth(
  request: HttpRequest,
  auth: ResolvedAuthConfig,
  root: string,
  gatewayAuth?: { principalId?: string; claims?: Record<string, unknown> },
): Promise<RequestAuthState> {
  if (gatewayAuth?.principalId) {
    return {
      principalId: gatewayAuth.principalId,
      claims: gatewayAuth.claims ?? {},
    };
  }

  const keys = loadJwtKeys(auth.profile, root, auth.certDir);
  const jwt = new JwtService(keys, auth);
  const cookieHeader = getHeader(request.headers, "Cookie");
  const token = extractToken(request.headers, cookieHeader, auth.mode, auth.cookieName);

  if (!token) {
    throw new UnauthorizedError("Missing authentication token");
  }

  const verified = await jwt.verify(token);
  return {
    principalId: verified.principalId,
    claims: verified.claims,
    token: verified.raw,
    expiresAt: verified.expiresAt,
  };
}

export async function buildHandlerContext<TClaims extends ZodType | undefined>(
  auth: ResolvedAuthConfig | undefined,
  root: string,
  state: AuthMiddlewareState,
  requestAuth?: RequestAuthState,
): Promise<PublicAuthContext | AuthContext<TClaims>> {
  if (!auth) {
    throw new Error("Auth context requested but router has no auth config");
  }

  const keys = loadJwtKeys(auth.profile, root, auth.certDir);
  const jwt = new JwtService(keys, auth);
  const jwtRuntime = createJwtRuntime(jwt, auth, state);

  if (requestAuth?.principalId) {
    return {
      principalId: requestAuth.principalId,
      claims: (requestAuth.claims ?? {}) as AuthContext<TClaims>["claims"],
      auth: jwtRuntime,
    };
  }

  return { auth: jwtRuntime };
}

export async function maybeRotateCookie(
  auth: ResolvedAuthConfig,
  state: AuthMiddlewareState,
  requestAuth: RequestAuthState,
  root: string,
): Promise<void> {
  if (!auth.autoRotate || auth.mode !== "cookie" || !requestAuth.token || !requestAuth.principalId) {
    return;
  }

  const keys = loadJwtKeys(auth.profile, root, auth.certDir);
  const jwt = new JwtService(keys, auth);
  const verified = await jwt.verify(requestAuth.token);

  if (!shouldRotateToken(verified, auth.ttlSeconds)) return;

  const token = await jwt.sign({
    principalId: verified.principalId,
    claims: verified.claims,
  });
  state.pendingCookies.push(formatSetCookie(token, auth, auth.ttlSeconds));
}

export function mergeResponseAuthHeaders(
  headers: Record<string, string>,
  state: AuthMiddlewareState,
): Record<string, string> {
  if (state.pendingCookies.length === 0) return headers;
  const existing = headers["Set-Cookie"];
  const cookies = state.pendingCookies;
  if (existing) {
    return { ...headers, "Set-Cookie": [existing, ...cookies].join(", ") };
  }
  return { ...headers, "Set-Cookie": cookies.join(", ") };
}

export function parseGatewayAuthorizer(
  lambda?: Record<string, string | number | boolean | undefined>,
): { principalId?: string; claims?: Record<string, unknown> } | undefined {
  if (!lambda) return undefined;
  const principalId = lambda.principalId;
  if (typeof principalId !== "string" || !principalId) return undefined;

  let claims: Record<string, unknown> = {};
  const raw = lambda.claims;
  if (typeof raw === "string") {
    try {
      claims = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      claims = {};
    }
  }

  return { principalId, claims };
}

export { isPublicProcedurePath };
