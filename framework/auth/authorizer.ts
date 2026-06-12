import type {
  APIGatewayAuthorizerResult,
  APIGatewayRequestAuthorizerEvent,
  Context,
} from "aws-lambda";
import type { OvenlessProfile } from "../config.ts";
import { loadJwtKeys } from "./keys.ts";
import type { AuthMode, ResolvedAuthConfig } from "./context.ts";
import { parseProfileFromEnv, resolveAuthConfig } from "./context.ts";
import type { RouterAuthConfig } from "./context.ts";
import { extractToken, JwtService } from "./jwt.ts";

export interface JwtAuthorizerOptions {
  profile?: OvenlessProfile;
  mode?: AuthMode;
  cookieName?: string;
  certDir?: string;
  root?: string;
  /** Resolved router auth (from createRouter) */
  auth: ResolvedAuthConfig | RouterAuthConfig;
}

function buildAuthorizerResult(
  principalId: string,
  claims: Record<string, unknown>,
  methodArn: string,
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: methodArn,
        },
      ],
    },
    context: {
      principalId,
      claims: JSON.stringify(claims),
    },
  };
}

function deny(methodArn: string): APIGatewayAuthorizerResult {
  return {
    principalId: "unauthorized",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Deny",
          Resource: methodArn,
        },
      ],
    },
  };
}

function isResolvedAuth(auth: ResolvedAuthConfig | RouterAuthConfig): auth is ResolvedAuthConfig {
  return "ttlSeconds" in auth;
}

export function createJwtAuthorizer(options: JwtAuthorizerOptions) {
  const resolved = isResolvedAuth(options.auth)
    ? options.auth
    : resolveAuthConfig(options.auth, {
        profile: options.profile,
        certDir: options.certDir,
      });

  const root = options.root ?? process.cwd();

  return async (
    event: APIGatewayRequestAuthorizerEvent,
    _context: Context,
  ): Promise<APIGatewayAuthorizerResult> => {
    const methodArn = event.methodArn ?? "*";

    try {
      const keys = loadJwtKeys(resolved.profile, root, resolved.certDir);
      const jwt = new JwtService(keys, resolved);

      const headers: Record<string, string | undefined> = {};
      if (event.headers) {
        for (const [key, value] of Object.entries(event.headers)) {
          headers[key] = value ?? undefined;
        }
      }

      const token = extractToken(
        headers,
        headers.cookie ?? headers.Cookie,
        resolved.mode,
        resolved.cookieName,
      );

      if (!token) return deny(methodArn);

      const verified = await jwt.verify(token);
      return buildAuthorizerResult(verified.principalId, verified.claims, methodArn);
    } catch {
      return deny(methodArn);
    }
  };
}
