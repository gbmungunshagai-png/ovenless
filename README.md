# Ovenless

Type-safe RPC for AWS Serverless Framework v3. One Lambda, one router, Zod validation, OpenAPI docs, and a proxy client with full TypeScript inference—no code generation.

[![npm version](https://img.shields.io/npm/v/ovenless)](https://www.npmjs.com/package/ovenless)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1)](https://bun.sh)

## Why Ovenless

| Need                             | Ovenless                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------- |
| End-to-end types without codegen | `createClient<typeof router>()` infers inputs/outputs from your Zod schemas      |
| Single Lambda, many routes       | Catch-all HTTP API (`/{proxy+}`) routes to one handler—fewer cold starts         |
| Public API docs                  | `GET /docs` (Scalar) and `GET /openapi.json` generated from the same Zod schemas |
| Serverless v3 deploy             | `ovenless build` emits `dist/handler.js` + `serverless.yml`                      |

**Requirements:** [Bun](https://bun.sh) for CLI and local dev · Node.js 20+ Lambda runtime (default) · TypeScript 5+ · [Zod](https://zod.dev) 4+

---

## Quick start

### 1. Create a project

```bash
mkdir my-api && cd my-api
bun init -y
bun add ovenless zod
bun add -d typescript @types/bun
```

### 2. Define the router

`src/router.ts`:

```typescript
import { z } from "zod";
import { createRouter, mutation, query } from "ovenless";

const users = [
  { id: "1", name: "Alice", email: "alice@example.com" },
  { id: "2", name: "Bob", email: "bob@example.com" },
];

export const appRouter = createRouter({
  health: query({
    output: z.object({
      status: z.literal("ok"),
      timestamp: z.string(),
    }),
    handler: () => ({
      status: "ok" as const,
      timestamp: new Date().toISOString(),
    }),
  }),

  users: createRouter({
    getById: query({
      input: z.object({ id: z.string().min(1) }),
      output: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
      }),
      handler: ({ id }) => {
        const user = users.find((u) => u.id === id);
        if (!user) throw new Error(`User not found: ${id}`);
        return user;
      },
    }),

    create: mutation({
      input: z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
      output: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
      }),
      handler: (input) => {
        const user = { id: String(users.length + 1), ...input };
        users.push(user);
        return user;
      },
    }),
  }),
});

export type AppRouter = typeof appRouter;
```

### 3. Add config

`ovenless.config.ts`:

```typescript
import { defineConfig } from "ovenless";
import { appRouter } from "./src/router.ts";

export default defineConfig({
  router: appRouter,
  service: "my-api",
  title: "My API",
  version: "1.0.0",
  port: 3000,
  aws: {
    region: "us-east-1",
    runtime: "nodejs20.x",
    stage: "dev",
  },
});
```

### 4. Run locally

```bash
bunx ovenless start
# or with file watching:
bunx ovenless start --watch
```

Example startup output:

```text
  ▲ Ovenless start  ·  development
  - Environments: .env, .env.development, .env.local
  - Variables: 4 from env files (+ OVENLESS_PROFILE)

  Ovenless development  →  http://localhost:3000

  API       http://localhost:3000/
  Docs      http://localhost:3000/docs
  OpenAPI   http://localhost:3000/openapi.json
```

### 5. Call procedures over HTTP

```bash
# Health (no input)
curl -s -X POST http://localhost:3000/health | jq

# Query with JSON body
curl -s -X POST http://localhost:3000/users/getById \
  -H "Content-Type: application/json" \
  -d '{"id":"1"}' | jq

# Query via GET + query string (values are strings — use z.coerce in schemas)
curl -s "http://localhost:3000/users/getById?id=2" | jq

# Mutation
curl -s -X POST http://localhost:3000/users/create \
  -H "Content-Type: application/json" \
  -d '{"name":"Charlie","email":"charlie@example.com"}' | jq
```

Paths accept **slashes** (`/users/getById`) or **dots** (`/users.getById`).

---

## Type-safe client

Install the client entry (same package, separate export):

```bash
bun add ovenless
```

`src/client.ts` (frontend or monorepo app):

```typescript
import { createClient, OvenlessClientError } from "ovenless/client";
import type { AppRouter } from "./router.ts";
import { appRouter } from "./router.ts";

export const api = createClient<AppRouter>({
  url: process.env.API_URL ?? "http://localhost:3000",
  router: appRouter, // optional: runtime path checks + GET for void-input queries
  headers: () => ({
    Authorization: `Bearer ${getToken()}`,
  }),
});

function getToken(): string {
  return "";
}

// Usage
async function main() {
  const health = await api.health();
  console.log(health.status); // "ok"

  const user = await api.users.getById({ id: "1" });
  console.log(user.name); // "Alice"

  const created = await api.users.create({
    name: "Dana",
    email: "dana@example.com",
  });
  console.log(created.id);

  try {
    await api.users.getById({ id: "missing" });
  } catch (err) {
    if (err instanceof OvenlessClientError) {
      console.error(err.status, err.message, err.body);
    }
  }
}
```

Import **only types** on the frontend to avoid bundling server code:

```typescript
import type { AppRouter } from "../api/src/router.ts";
import { createClient } from "ovenless/client";

const api = createClient<AppRouter>({
  url: import.meta.env.VITE_API_URL,
});
```

Optional: emit client types for publishing (`tsconfig.client.json` in your app):

```bash
bunx ovenless build:client
```

---

## Procedures

### Queries

Read-only operations. Allowed methods: **GET** or **POST**.

```typescript
// No input
health: query({
  output: z.object({ ok: z.boolean() }),
  handler: () => ({ ok: true }),
}),

// With input
list: query({
  input: z.object({
    limit: z.coerce.number().optional().default(10),
  }),
  output: z.object({ items: z.array(z.string()) }),
  handler: ({ limit }) => ({ items: fetchItems(limit) }),
}),
```

For **GET** requests, input comes from the query string. All values are strings until Zod coerces them—use `z.coerce.number()`, `z.coerce.boolean()`, etc.

### Mutations

Write operations. Allowed method: **POST** only.

```typescript
create: mutation({
  input: z.object({ title: z.string() }),
  output: z.object({ id: z.string() }),
  handler: async (input) => {
    const id = await db.insert(input);
    return { id };
  },
}),
```

### Nested routers

Group related procedures (maps to `client.users.getById`):

```typescript
export const appRouter = createRouter({
  users: createRouter({
    getById: query({
      /* ... */
    }),
    create: mutation({
      /* ... */
    }),
  }),
});
```

---

## Configuration

`ovenless.config.ts` must default-export the result of `defineConfig()`:

| Field         | Required | Description                                                     |
| ------------- | -------- | --------------------------------------------------------------- |
| `router`      | yes      | Router from `createRouter()`                                    |
| `service`     | yes      | Serverless service name                                         |
| `title`       | no       | OpenAPI title (defaults to `service`)                           |
| `version`     | no       | OpenAPI version (default `0.1.0` in dev)                        |
| `port`        | no       | Local dev port (default `3000`, overridden by `PORT`)           |
| `aws.region`  | no       | AWS region (default `us-east-1` or `AWS_REGION`)                |
| `aws.runtime` | no       | Lambda runtime (default `nodejs20.x`)                           |
| `aws.stage`   | no       | Deploy stage (default from profile: `dev` / `staging` / `prod`) |

---

## Environment files

Loaded in order (later overrides earlier), Next.js-style logging on `start` and `build`:

| File                                                    | When                      |
| ------------------------------------------------------- | ------------------------- |
| `.env`                                                  | Always                    |
| `.env.development` / `.env.staging` / `.env.production` | Matching `--profile`      |
| `.env.local`                                            | Always (highest priority) |

```bash
# .env
LOG_LEVEL=info

# .env.development
API_URL=http://localhost:3000

# .env.local (gitignored)
DATABASE_URL=postgres://localhost:5432/dev
```

`ovenless start` defaults to profile **development**.  
`ovenless build` defaults to profile **production** unless you pass `--profile`.

```bash
bunx ovenless start --profile staging
bunx ovenless build --profile staging
```

---

## CLI

| Command                        | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `ovenless start`               | Local Bun HTTP server                              |
| `ovenless start --watch`       | Restart on file changes                            |
| `ovenless start --profile <p>` | Load `.env.<p>`                                    |
| `ovenless build --profile <p>` | Bundle Lambda + write `serverless.yml`             |
| `ovenless build:client`        | Emit client `.d.ts` (needs `tsconfig.client.json`) |
| `ovenless certs`               | Generate RSA PEM keys for JWT signing (RS256)      |
| `ovenless help`                | Show usage                                         |

### JWT signing keys (`ovenless certs`)

Cross-platform (no `ssh-keygen` / `openssl` required). Writes keys under `cert/<profile>/`:

```bash
bunx ovenless certs --profile development
bunx ovenless certs --profile staging --comment "my-api staging"
bunx ovenless certs --profile production --force   # overwrite existing keys
```

Output layout:

```text
cert/
├── development/
│   ├── id_rsa       # private key (PEM PKCS#1, mode 600)
│   └── id_rsa.pub   # public key (PEM)
├── staging/
└── production/
```

Use in your app (example with `jose` or `jsonwebtoken`):

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";

const profile = process.env.OVENLESS_PROFILE ?? "development";
const privateKey = readFileSync(join("cert", profile, "id_rsa"), "utf8");
const publicKey = readFileSync(join("cert", profile, "id_rsa.pub"), "utf8");
```

Add `cert/` to `.gitignore`.

---

## Deploy to AWS

### 1. Build for the target profile

```bash
bunx ovenless build --profile production
```

Outputs:

- `dist/handler.js` — CommonJS bundle, export `awsHandler`
- `serverless.yml` — generated Serverless Framework v3 config

Generated `serverless.yml` (excerpt):

```yaml
service: my-api
frameworkVersion: "3"
provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  stage: prod
functions:
  api:
    handler: dist/handler.awsHandler
    events:
      - httpApi:
          path: /{proxy+}
          method: ANY
      - httpApi:
          path: /
          method: ANY
```

### 2. Deploy with Serverless

```bash
npm i -g serverless
serverless deploy --stage prod
```

### 3. Custom Lambda entry (advanced)

If you hand-roll the handler instead of `ovenless build`:

```typescript
import { createAwsHandler } from "ovenless";
import config from "./ovenless.config.ts";

export const handler = createAwsHandler(config.router, {
  title: config.title ?? config.service,
  version: config.version ?? "1.0.0",
});
```

---

## HTTP API

### Built-in routes

| Method    | Path            | Description                      |
| --------- | --------------- | -------------------------------- |
| `GET`     | `/`             | API metadata + procedure list    |
| `GET`     | `/docs`         | Scalar interactive documentation |
| `GET`     | `/openapi.json` | OpenAPI 3.0 document             |
| `OPTIONS` | `*`             | CORS preflight                   |

### Procedure routes

| Type     | Methods       | Body                                  |
| -------- | ------------- | ------------------------------------- |
| Query    | `GET`, `POST` | GET: query string · POST: JSON object |
| Mutation | `POST`        | JSON object                           |

### Success response

JSON body = validated procedure **output** schema.

### Error response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "details": []
  }
}
```

| Code                 | HTTP | Meaning                                   |
| -------------------- | ---- | ----------------------------------------- |
| `NOT_FOUND`          | 404  | Unknown procedure path                    |
| `METHOD_NOT_ALLOWED` | 405  | Wrong HTTP method                         |
| `INVALID_BODY`       | 400  | Body not a JSON object                    |
| `INVALID_JSON`       | 400  | Malformed JSON (dev server)               |
| `VALIDATION_ERROR`   | 400  | Zod input/output validation failed        |
| `INTERNAL_ERROR`     | 500  | Handler threw (message hidden by default) |

Production 500 responses use a generic message. Enable details only in development:

```typescript
createHandler(router, {
  exposeErrorDetails: process.env.NODE_ENV !== "production",
});
```

---

## Architecture

```text
┌──────────────┐     types only      ┌─────────────────┐
│   Frontend   │ ◄────────────────── │  appRouter      │
│ createClient │      fetch/POST     │  (Zod + TS)     │
└──────┬───────┘                     └────────┬────────┘
       │                                        │
       │  POST /users.getById                   │ createHandler
       ▼                                        ▼
┌──────────────────────────────────────────────────────────┐
│  Bun dev server  ·  or  AWS API Gateway HTTP API         │
│                     └─► Lambda (awsHandler)              │
│                           ├─ Zod input parse             │
│                           ├─ procedure.handler()         │
│                           ├─ Zod output parse            │
│                           └─ /docs · /openapi.json       │
└──────────────────────────────────────────────────────────┘
```

---

## Package exports

| Import            | Use                                                          |
| ----------------- | ------------------------------------------------------------ |
| `ovenless`        | Router, handler, AWS adapter, config, CLI                    |
| `ovenless/client` | `createClient`, client types (`InferClient`, `AppClient`, …) |

---

## Programmatic usage

Standalone HTTP handler (tests, custom servers):

```typescript
import { createHandler } from "ovenless";
import { appRouter } from "./src/router.ts";

const handle = createHandler(appRouter, {
  title: "My API",
  version: "1.0.0",
  cors: true,
});

const res = await handle({
  method: "POST",
  path: "/health",
  body: {},
});

console.log(res.statusCode, res.body);
```

---

## Project layout (reference app)

```text
my-api/
├── ovenless.config.ts    # defineConfig({ router, service, ... })
├── serverless.yml        # generated by ovenless build
├── package.json
├── .env
├── .env.development
├── .env.local
├── src/
│   └── router.ts         # appRouter + export type AppRouter
└── dist/
    └── handler.js        # Lambda bundle (after build)
```

---

## Scripts (developing Ovenless itself)

```bash
bun run build      # bundle dist/
bun test           # run test suite
bun run typecheck  # tsc --noEmit
```

---

## Roadmap

- [ ] Middleware and request context (auth, logging)
- [ ] Subscription / streaming procedures
- [ ] First-party project scaffold (`create-ovenless`)

---

## License

MIT © [G.B.Mungunshagai](https://github.com/gbmungunshagai-png/ovenless)
