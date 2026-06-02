import type { InferClient, Router } from "./core.ts";

export interface ClientOptions {
  url: string;
  fetch?: typeof fetch;
  headers?: Record<string, string> | (() => Record<string, string>);
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

export function createClient<TRouter extends Router>(
  options: ClientOptions,
): InferClient<TRouter["procedures"]> {
  const httpFetch = options.fetch ?? fetch;

  const resolveHeaders = (): Record<string, string> => {
    const base = { "Content-Type": "application/json" };
    const extra =
      typeof options.headers === "function" ? options.headers() : (options.headers ?? {});
    return { ...base, ...extra };
  };

  const callProcedure = async (path: string, input: unknown): Promise<unknown> => {
    const url = `${options.url.replace(/\/+$/, "")}/${path}`;
    const response = await httpFetch(url, {
      method: "POST",
      headers: resolveHeaders(),
      body: JSON.stringify(input ?? {}),
    });

    const body: unknown = await response.json().catch(() => null);

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
        return callProcedure(procedurePath, args[0] ?? {});
      },
    });

  return createProxy() as InferClient<TRouter["procedures"]>;
}
