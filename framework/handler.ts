import { ZodError } from "zod";
import {
  collectProcedures,
  getRouterAuth,
  isProcedure,
  isRouter,
  parseProcedurePath,
  queryInputFromSearchParams,
  resolveProcedure,
  type Router,
} from "./core.ts";
import type { AuthContext, PublicAuthContext } from "./auth/context.ts";
import {
  mergeProtectedContext,
  mergePublicContext,
} from "./auth/context.ts";
import {
  buildHandlerContext,
  createAuthMiddlewareState,
  isPublicProcedurePath,
  maybeRotateCookie,
  mergeResponseAuthHeaders,
  resolveRequestAuth,
  UnauthorizedError,
} from "./auth/middleware.ts";
import { generateOpenApiDocument, renderScalarHtml } from "./docs/openapi.ts";
import type { HttpRequestAuth } from "./auth/context.ts";

export type HttpMethod = "GET" | "POST" | "OPTIONS" | "HEAD";

export interface HttpRequest {
  method: HttpMethod | string;
  path: string;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  /** Populated by AWS adapter from API Gateway authorizer context */
  auth?: HttpRequestAuth;
}

export interface HttpResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

export interface OvenlessHandlerOptions {
  title?: string;
  version?: string;
  cors?: boolean;
  /** When false (default), 500 responses omit handler error text */
  exposeErrorDetails?: boolean;
  /** Project root for cert/<profile> resolution */
  root?: string;
}

const ALLOWED_METHODS = new Set<HttpMethod>(["GET", "POST", "OPTIONS", "HEAD"]);

/** Sentinel set by AWS adapter when JSON body parsing fails */
export const INVALID_JSON_BODY = Symbol("ovenless.invalidJsonBody");

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
};

export function getHeader(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const direct = headers[name];
  if (direct !== undefined) return direct;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

function corsHeaders(
  origin: string | undefined,
  authMode?: "bearer" | "cookie",
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (authMode === "cookie" && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = origin ?? "*";
  }

  return headers;
}

export class BodyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BodyValidationError";
  }
}

function safeJsonBody(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    throw new Error("Response is not JSON-serializable");
  }
}

function jsonResponse(
  statusCode: number,
  data: unknown,
  extraHeaders: Record<string, string> = {},
): HttpResponse {
  return {
    statusCode,
    headers: { ...DEFAULT_HEADERS, ...extraHeaders },
    body: safeJsonBody(data),
  };
}

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
  extraHeaders: Record<string, string> = {},
): HttpResponse {
  return jsonResponse(
    statusCode,
    {
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    extraHeaders,
  );
}

function htmlResponse(
  statusCode: number,
  html: string,
  extraHeaders: Record<string, string> = {},
): HttpResponse {
  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8", ...extraHeaders },
    body: html,
  };
}

function normalizePath(path: string): string {
  const withoutQuery = path.split("?")[0] ?? path;
  return withoutQuery.replace(/\/+$/, "") || "/";
}

function mapHandlerError(
  err: unknown,
  exposeDetails: boolean,
): { message: string; details?: unknown } {
  if (err instanceof ZodError) {
    return {
      message: "Response validation failed",
      details: exposeDetails ? err.issues : undefined,
    };
  }
  if (err instanceof Error) {
    return {
      message: exposeDetails ? err.message : "An unexpected error occurred",
    };
  }
  return { message: "An unexpected error occurred" };
}

export function normalizeRawInput(method: string, path: string, body: unknown): unknown {
  if (body === INVALID_JSON_BODY) {
    throw new BodyValidationError("Request body must be valid JSON");
  }

  if (method === "GET") {
    const queryString = path.split("?")[1];
    return queryString ? queryInputFromSearchParams(new URLSearchParams(queryString)) : {};
  }

  if (body === undefined) return {};
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new BodyValidationError("Request body must be a JSON object");
  }
  return body;
}

function parseGatewayClaims(request: HttpRequest): {
  principalId?: string;
  claims?: Record<string, unknown>;
} | undefined {
  const auth = request.auth;
  if (!auth?.principalId) return undefined;

  let claims: Record<string, unknown> = {};
  if (auth.claims) {
    try {
      claims = JSON.parse(auth.claims) as Record<string, unknown>;
    } catch {
      claims = {};
    }
  }

  return { principalId: auth.principalId, claims };
}

export function createHandler(router: Router, options: OvenlessHandlerOptions = {}) {
  const {
    title = "Ovenless API",
    version = "1.0.0",
    cors = true,
    exposeErrorDetails = false,
    root = process.cwd(),
  } = options;

  const auth = getRouterAuth(router);

  return async (request: HttpRequest): Promise<HttpResponse> => {
    const authState = createAuthMiddlewareState();
    const origin = getHeader(request.headers, "Origin");
    const corsHdrs = cors ? corsHeaders(origin, auth?.mode) : {};
    const method = (request.method ?? "").trim().toUpperCase();

    if (!ALLOWED_METHODS.has(method as HttpMethod)) {
      return errorResponse(
        405,
        "METHOD_NOT_ALLOWED",
        `Unsupported method: ${request.method}`,
        undefined,
        corsHdrs,
      );
    }

    const path = normalizePath(request.path);

    if (method === "OPTIONS") {
      return { statusCode: 204, headers: corsHdrs };
    }

    if (path === "/docs" && method === "GET") {
      return htmlResponse(200, renderScalarHtml("/openapi.json"), corsHdrs);
    }

    if (path === "/openapi.json" && method === "GET") {
      const doc = generateOpenApiDocument(router, { title, version });
      return jsonResponse(200, doc, corsHdrs);
    }

    if (path === "/" && method === "GET") {
      const procedures = collectProcedures(router);
      return jsonResponse(
        200,
        {
          name: title,
          version,
          docs: "/docs",
          openapi: "/openapi.json",
          procedures: procedures.map((p) => ({
            path: p.path,
            type: p.procedure.type,
            public: p.procedure.__public === true,
          })),
        },
        corsHdrs,
      );
    }

    if (method === "HEAD") {
      return { statusCode: 200, headers: corsHdrs };
    }

    const pathSegments = parseProcedurePath(path);
    const resolved = resolveProcedure(router, pathSegments);

    if (!resolved) {
      return errorResponse(404, "NOT_FOUND", `Procedure not found: ${path}`, undefined, corsHdrs);
    }

    const { procedure } = resolved;
    const isPublic = isPublicProcedurePath(auth, resolved.path, procedure.__public);

    if (procedure.type === "mutation" && method !== "POST") {
      return errorResponse(
        405,
        "METHOD_NOT_ALLOWED",
        `Mutation ${resolved.path} requires POST`,
        undefined,
        corsHdrs,
      );
    }

    if (procedure.type === "query" && method !== "GET" && method !== "POST") {
      return errorResponse(
        405,
        "METHOD_NOT_ALLOWED",
        `Query ${resolved.path} requires GET or POST`,
        undefined,
        corsHdrs,
      );
    }

    let requestAuth: Awaited<ReturnType<typeof resolveRequestAuth>> | undefined;

    if (auth && !isPublic) {
      try {
        const gateway = parseGatewayClaims(request);
        requestAuth = await resolveRequestAuth(request, auth, root, gateway);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          return errorResponse(401, "UNAUTHORIZED", err.message, undefined, corsHdrs);
        }
        throw err;
      }
    }

    let rawInput: unknown;
    try {
      rawInput = normalizeRawInput(method, request.path, request.body);
    } catch (err) {
      if (err instanceof BodyValidationError) {
        return errorResponse(400, "INVALID_BODY", err.message, undefined, corsHdrs);
      }
      throw err;
    }

    let input: unknown;
    try {
      input = procedure.input.parse(rawInput);
    } catch (err) {
      if (err instanceof ZodError) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Input validation failed",
          err.issues,
          corsHdrs,
        );
      }
      throw err;
    }

    try {
      let result: unknown;

      if (auth) {
        const authCtx = await buildHandlerContext(auth, root, authState, requestAuth);
        const inputObj =
          typeof input === "object" && input !== null && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {};

        if (isPublic) {
          const merged = mergePublicContext(
            inputObj,
            authCtx as PublicAuthContext,
          );
          result = await procedure.handler(merged);
        } else {
          const merged = mergeProtectedContext(
            inputObj,
            authCtx as AuthContext,
          );
          result = await procedure.handler(merged);
        }
      } else {
        result = await procedure.handler(input);
      }

      const output = procedure.output.parse(result);

      if (auth && requestAuth) {
        await maybeRotateCookie(auth, authState, requestAuth, root);
      }

      const response = jsonResponse(200, output, corsHdrs);
      if (response.headers) {
        response.headers = mergeResponseAuthHeaders(response.headers, authState);
      }
      return response;
    } catch (err) {
      if (err instanceof Error && err.message === "Response is not JSON-serializable") {
        const { message, details } = mapHandlerError(err, exposeErrorDetails);
        return errorResponse(500, "INTERNAL_ERROR", message, details, corsHdrs);
      }
      const { message, details } = mapHandlerError(err, exposeErrorDetails);
      return errorResponse(500, "INTERNAL_ERROR", message, details, corsHdrs);
    }
  };
}

export function assertRouterShape(value: unknown): asserts value is Router {
  if (!isRouter(value)) {
    throw new Error("Expected an Ovenless router created with createRouter()");
  }
}

export function assertProcedureShape(value: unknown): asserts value is import("./core.ts").Procedure {
  if (!isProcedure(value)) {
    throw new Error("Expected an Ovenless procedure");
  }
}
