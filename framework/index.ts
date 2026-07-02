export {
  createRouter,
  query,
  mutation,
  withClaims,
  type ClaimsScopedProcedures,
  isProcedure,
  isRouter,
  collectProcedures,
  resolveProcedure,
  parseProcedurePath,
  queryInputFromSearchParams,
  voidInput,
  isVoidInput,
  getRouterAuth,
  PROCEDURE_MARKER,
  ROUTER_MARKER,
  type InferProcedureClient,
  type InferClientProcedure,
  type VoidInputProcedure,
  type Procedure,
  type Router,
  type RouterRecord,
  type InferClient,
  type InferProcedureInput,
  type InferProcedureOutput,
  type AppClient,
  type IsOptionalClientInput,
  type MaybePromise,
  type CreateRouterOptions,
  type ProcedureMeta,
} from "./core.ts";

export {
  createHandler,
  getHeader,
  BodyValidationError,
  normalizeRawInput,
  INVALID_JSON_BODY,
  type HttpMethod,
  type HttpRequest,
  type HttpResponse,
  type OvenlessHandlerOptions,
} from "./handler.ts";

export {
  createClient,
  OvenlessClientError,
  setClientBearerToken,
  type ClientOptions,
  type ClientAuthOptions,
  type ClientAuthMode,
} from "./client.ts";

export { createAwsHandler } from "./adapters/aws.ts";

export { generateOpenApiDocument, renderScalarHtml } from "./docs/openapi.ts";

export { defineConfig, resolveProfileStage, type OvenlessConfig, type OvenlessProfile } from "./config.ts";

export { runCli } from "./cli/index.ts";

export {
  parseTtl,
  loadJwtKeys,
  assertJwtKeysExist,
  createJwtAuthorizer,
  resolveAuthConfig,
  type RouterAuthConfig,
  type ResolvedAuthConfig,
  type AuthContext,
  type PublicAuthContext,
  type ProcedureContext,
  type PublicProcedureContext,
  type JwtRuntime,
  type AuthMode,
  type SignTokenInput,
} from "./auth/index.ts";

export type {
  ProtectedHandler,
  PublicHandler,
  ProcedureContext as ProcedureHandlerContext,
  PublicProcedureContext as PublicProcedureHandlerContext,
} from "./auth/router-types.ts";
