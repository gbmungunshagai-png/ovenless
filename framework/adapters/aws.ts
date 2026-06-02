import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import type { Router } from "../core.ts";
import { createHandler, type HttpResponse, type OvenlessHandlerOptions } from "../handler.ts";

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

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function buildPath(event: APIGatewayProxyEvent): string {
  const proxyPath = event.pathParameters?.proxy;
  if (proxyPath) return `/${proxyPath}`;

  const stagelessPath = event.path.replace(/^\/[^/]+/, "") || "/";
  return stagelessPath;
}

export function createAwsHandler(router: Router, options: OvenlessHandlerOptions = {}) {
  const handler = createHandler(router, options);

  return async (
    event: APIGatewayProxyEvent,
    _context: Context,
  ): Promise<APIGatewayProxyResult> => {
    const path = buildPath(event);
    const query = event.queryStringParameters
      ? `?${new URLSearchParams(event.queryStringParameters as Record<string, string>).toString()}`
      : "";

    const response = await handler({
      method: event.httpMethod,
      path: `${path}${query}`,
      body: parseBody(event),
      headers: event.headers as Record<string, string | undefined>,
    });

    return toApiGatewayResult(response);
  };
}
