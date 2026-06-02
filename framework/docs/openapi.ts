import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { collectProcedures, isVoidInput, type Router } from "../core.ts";

extendZodWithOpenApi(z);

export interface OpenApiOptions {
  title: string;
  version: string;
}

export function generateOpenApiDocument(router: Router, options: OpenApiOptions) {
  const registry = new OpenAPIRegistry();
  const procedures = collectProcedures(router);

  for (const { procedure, path } of procedures) {
    const httpPath = `/${path.replace(/\./g, "/")}`;

    registry.registerPath({
      method: "post",
      path: httpPath,
      summary: `${procedure.type}: ${path}`,
      tags: [path.split(".")[0] ?? "default"],
      ...(isVoidInput(procedure.input, procedure)
        ? {}
        : {
            request: {
              body: {
                content: {
                  "application/json": {
                    schema: procedure.input,
                  },
                },
              },
            },
          }),
      responses: {
        200: {
          description: "Successful response",
          content: {
            "application/json": {
              schema: procedure.output,
            },
          },
        },
        400: {
          description: "Validation error",
        },
      },
    });
  }

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: options.title,
      version: options.version,
    },
    servers: [{ url: "/" }],
  });
}

export function renderScalarHtml(openApiUrl: string): string {
  const escapedUrl = openApiUrl.replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Documentation</title>
</head>
<body>
  <script id="api-reference" data-url="${escapedUrl}"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
}
