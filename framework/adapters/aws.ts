import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import type { Router } from "../core.ts";
import {
  createHandler,
  getHeader,
  INVALID_JSON_BODY,
  type HttpResponse,
  type OvenlessHandlerOptions,
} from "../handler.ts";

function toApiGatewayResult(response: HttpResponse): APIGatewayProxyResult {
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.body ?? "",
  };
}

function parseBody(event: APIGatewayProxyEvent): unknown {
  if (!event.body) return undefined;

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  const contentType = getHeader(event.headers as Record<string, string | undefined>, "content-type") ?? "";
  const trimmed = raw.trimStart();
  const likelyJson =
    contentType.includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!likelyJson) return raw;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return INVALID_JSON_BODY;
  }
}

function buildPath(event: APIGatewayProxyEvent): string {
  if (event.pathParameters?.proxy != null) {
    return `/${event.pathParameters.proxy}`;
  }

  const ctx = event.requestContext as { http?: { path?: string } } | undefined;
  if (ctx?.http?.path) return ctx.http.path;

  return event.path || "/";
}

function buildQueryString(
  params: APIGatewayProxyEvent["queryStringParameters"],
): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] != null,
  );
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

export function createAwsHandler(router: Router, options: OvenlessHandlerOptions = {}) {
  const handler = createHandler(router, options);

  return async (
    event: APIGatewayProxyEvent,
    _context: Context,
  ): Promise<APIGatewayProxyResult> => {
    const path = buildPath(event);
    const query = buildQueryString(event.queryStringParameters);

    const response = await handler({
      method: event.httpMethod,
      path: `${path}${query}`,
      body: parseBody(event),
      headers: event.headers as Record<string, string | undefined>,
    });

    return toApiGatewayResult(response);
  };
}
