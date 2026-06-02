Context: Project Ovenless

Ovenless is a lightweight, end-to-end type-safe RPC framework designed specifically for the AWS Serverless Framework (v3) ecosystem. It provides the seamless developer experience (DX) of tRPC—sharing type definitions directly from backend to frontend without any build-time code generation (no "preheating" or "baking" required)—while automatically publishing fully-interactive API documentation via Scalar using standard OpenAPI specifications generated from runtime Zod validation schemas.

🎯 The Vision

Modern web development demands rapid iteration, reliable contracts, and painless integration.
While existing tools solve parts of this puzzle, they introduce friction in a serverless AWS environment:

tRPC is fantastic for internal TypeScript-only contracts but lacks out-of-the-box support for generating public-facing OpenAPI specifications without heavy plugins.

Traditional OpenAPI/Swagger frameworks require manual definition of JSON/YAML schemas or complex decorator patterns, creating a disconnect between execution logic and documentation.

Serverless v3 APIs are typically deployed as separate HTTP routes mapped directly to individual Lambda functions, which scatters type-checking across disconnected boundaries.

Ovenless merges these concepts into a single cohesive SDK. Developers define a unified router schema on the backend. This single source of truth yields:

Fully type-inferred frontend clients with autocomplete and validation errors caught at compile-time.

Runtime input validation powered by Zod before lambda invocation reaches business logic.

Beautiful, interactive API playgrounds served via Scalar at /docs.

Zero-configuration deployment to AWS Lambda and API Gateway via Serverless Framework v3.

🏗️ Architectural Overview

Ovenless operates as a single-entry HTTP multiplexer deployed inside a Lambda function. It acts as an internal router that catches incoming requests, validates payloads, and translates TypeScript types for the frontend proxy.

┌────────────────────────────────────────────────────────┐
│ Frontend Client │
└───────────────────────────┬────────────────────────────┘
│ (TypeScript Types & Proxy)
▼
┌────────────────────────────────────────────────────────┐
│ AWS API Gateway (HTTP/REST) │
└───────────────────────────┬────────────────────────────┘
│ (Proxy Route /{proxy+})
▼
┌────────────────────────────────────────────────────────┐
│ AWS Lambda (Ovenless Adapter) │
├────────────────────────────────────────────────────────┤
│ ┌───────────────────┐ ┌─────────────┐ ┌───────────┐ │
│ │ /docs │ │ API Routes │ │ Validator │ │
│ │ (Scalar Engine) │ │ (Router) │ │ (Zod) │ │
│ └───────────────────┘ └─────────────┘ └───────────┘ │
└────────────────────────────────────────────────────────┘

1. The Core Routing Protocol

At runtime, standard requests are handled through a unified JSON-RPC-like interface over HTTP. Instead of mapping one Lambda to one route, a single core router Lambda handles matching routes dynamically. This prevents cold start penalties across multiple lambdas and consolidates type boundaries.

Query Operations: Handled via GET (or POST) with query parameter parsing.

Mutation Operations: Handled via POST with JSON payload verification.

2. Auto-Doc Engine (Zod ⇄ OpenAPI ⇄ Scalar)

To generate documentation without duplicate effort, Ovenless relies on runtime schema inspection:

Procedures are defined with Zod input/output schemas.

The framework uses @asteasolutions/zod-to-openapi (or a lightweight equivalent) to build an OpenAPI v3 JSON tree in memory.

When a request hits GET /docs, the serverless adapter converts the JSON tree into a base64 payload and serves Scalar's CDN-powered web dashboard directly as a raw HTML response.

3. The Pure Type-Inference Client

The frontend client requires zero build steps or code generation. By importing only the TypeScript type representation of the backend router:

The client creates a JavaScript Proxy instance.

Property chaining (e.g., client.users.getById(...)) is intercepted at runtime and translated into network fetches (POST /users.getById).

TypeScript maps the procedure's input/output schemas directly onto the proxy, enabling perfect autocomplete and type validation inside modern editors (VS Code, Cursor, etc.).

📦 Project Directory Structure

We will organize the repository to allow clean publishing of our core adapters and client library, while providing an easy setup for Serverless v3 deployments.

/
├── serverless.yml # Serverless Framework v3 configuration
├── tsconfig.json # Shared compiler options for TypeScript
├── package.json # Monorepo dependencies and workspaces
│
├── src/ # Example application using the framework
│ ├── index.ts # Lambda entry point (exports handler)
│ ├── router.ts # API router holding procedure definitions
│ └── services/ # Domain logic (DB queries, third-party APIs)
│
└── framework/ # The Ovenless Core SDK
├── index.ts # Main framework exports (router builders)
├── core.ts # TypeScript definition schemas & builders
├── client.ts # Proxy client builder (utilized by frontend)
├── adapters/
│ └── aws.ts # AWS Lambda APIGateway proxy event adapter
└── docs/
└── openapi.ts # Zod schemas compiler to OpenAPI standard

🚀 Key Milestones & Roadmap

Phase 1: Core Type-System & Router Builders

Implement type-safe router structures supporting mutations, queries, and contextual middleware.

Set up runtime validation bindings using zod.

Phase 2: AWS Lambda Adapter

Build the catch-all event parser handling pathing, HTTP methods, headers, and CORS configurations.

Wire validation errors back as structural JSON errors.

Phase 3: The JS Proxy Client

Build createClient<TRouter>(config) utilizing JavaScript proxies.

Ensure type mappings allow recursive nesting of routers (client.nested.procedure.query()).

Phase 4: Schema Translation and Scalar Docs

Integrate Zod-to-OpenAPI schema generation.

Create HTML serialization containing the embedded Scalar script block.

Phase 5: Performance Tuning & Security

Implement response caching, custom context injection (e.g., decoded JWT user properties), and rate-limiting headers.

eof

I have successfully updated the project context to reflect **Ovenless**!

Would you like to start building out **Phase 1** next by writing the core type-system and router builders in `framework/core.ts`?
