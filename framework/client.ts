import {
  collectProcedures,
  isVoidInput,
  parseProcedurePath,
  resolveProcedure,
  type InferClient,
  type Router,
} from "./core.ts";

export type ClientAuthMode = "bearer" | "cookie";

export interface ClientAuthOptions {
  mode: ClientAuthMode;
  /** Bearer token or async resolver */
  token?: string | (() => string | undefined);
}

export interface ClientOptions {
  url: string;
  fetch?: typeof fetch;
  headers?: Record<string, string> | (() => Record<string, string>);
  /** Validates paths at runtime and enables GET for void-input queries */
  router?: Router;
  auth?: ClientAuthOptions;
}

let globalBearerToken: string | undefined;

/** Set bearer token for subsequent client requests */
export function setClientBearerToken(token: string | undefined): void {
  globalBearerToken = token;
}

export class OvenlessClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "OvenlessClientError";
  }
}

function isEmptyClientInput(input: unknown): boolean {
  if (input === undefined || input === null) return true;
  if (typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0) {
    return true;
  }
  return false;
}

export function createClient<TRouter extends Router>(
  options: ClientOptions,
): InferClient<TRouter["procedures"]> {
  const baseUrl = options.url.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("createClient: url must be a non-empty base URL");
  }

  const httpFetch = options.fetch ?? fetch;

  const procedureMeta = new Map<string, { type: "query" | "mutation"; voidInput: boolean }>();
  if (options.router) {
    for (const { path, procedure } of collectProcedures(options.router)) {
      procedureMeta.set(path, {
        type: procedure.type,
        voidInput: isVoidInput(procedure.input, procedure),
      });
    }
  }

  const resolveBearerToken = (): string | undefined => {
    const auth = options.auth;
    if (!auth || auth.mode !== "bearer") return undefined;
    if (typeof auth.token === "function") return auth.token() ?? globalBearerToken;
    return auth.token ?? globalBearerToken;
  };

  const resolveHeaders = (jsonBody: boolean): Record<string, string> => {
    const base: Record<string, string> = jsonBody ? { "Content-Type": "application/json" } : {};
    const extra =
      typeof options.headers === "function" ? options.headers() : (options.headers ?? {});
    const headers = { ...base, ...extra };
    const token = resolveBearerToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchCredentials = (): "include" | undefined => {
    if (options.auth?.mode === "cookie") return "include";
    return undefined;
  };

  const callProcedure = async (path: string, input: unknown): Promise<unknown> => {
    if (options.router) {
      const segments = parseProcedurePath(path);
      const resolved = resolveProcedure(options.router, segments);
      if (!resolved) {
        throw new OvenlessClientError(`Unknown procedure: ${path}`, 0, null);
      }
    }

    const meta = procedureMeta.get(path);
    const useGet =
      meta?.type === "query" && meta.voidInput && isEmptyClientInput(input);

    const url = `${baseUrl}/${path}`;
    const credentials = fetchCredentials();
    const response = await httpFetch(
      url,
      useGet
        ? {
            method: "GET",
            headers: resolveHeaders(false),
            credentials,
          }
        : {
            method: "POST",
            headers: resolveHeaders(true),
            body: JSON.stringify(input ?? {}),
            credentials,
          },
    );

    const text = await response.text();
    let body: unknown;
    try {
      body = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      throw new OvenlessClientError(
        "Response was not valid JSON",
        response.status,
        text,
      );
    }

    if (!response.ok) {
      const message =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error?: { message?: string } }).error?.message === "string"
          ? (body as { error: { message: string } }).error.message
          : `Request failed with status ${response.status}`;
      throw new OvenlessClientError(message, response.status, body);
    }

    return body;
  };

  const createProxy = (path: string[] = []): unknown =>
    new Proxy(() => undefined, {
      get(_target, prop: string | symbol) {
        if (prop === "then") return undefined;
        if (typeof prop !== "string") return undefined;
        return createProxy([...path, prop]);
      },
      apply(_target, _thisArg, args: [unknown?]) {
        const procedurePath = path.join(".");
        if (!procedurePath) {
          throw new OvenlessClientError("Invalid client call: empty procedure path", 0, null);
        }
        return callProcedure(procedurePath, args[0]);
      },
    });

  return createProxy() as InferClient<TRouter["procedures"]>;
}
