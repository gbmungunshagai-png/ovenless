import type { ZodType } from "zod";
import { z } from "zod";
import type { ResolvedAuthConfig, RouterAuthConfig } from "./auth/context.ts";
import { resolveAuthConfig } from "./auth/context.ts";
import type {
  ProcedureMeta,
  ProtectedHandler,
  ProtectedHandlerNoInput,
  PublicHandler,
  PublicHandlerNoInput,
  VoidPublicHandler,
} from "./auth/router-types.ts";

export type { ProcedureMeta } from "./auth/router-types.ts";

export const PROCEDURE_MARKER = Symbol.for("ovenless.procedure");

export type ProcedureType = "query" | "mutation";

export interface Procedure<
  TInput extends ZodType = ZodType,
  TOutput extends ZodType = ZodType,
> {
  [PROCEDURE_MARKER]: true;
  type: ProcedureType;
  input: TInput;
  output: TOutput;
  handler: (input: unknown) => Promise<z.infer<TOutput>> | z.infer<TOutput>;
  /** Set when the procedure accepts no client input */
  __voidInput?: true;
  meta?: ProcedureMeta;
  __public?: boolean;
}

export type RouterRecord = Record<string, Procedure | Router>;

export interface Router<T extends RouterRecord = RouterRecord> {
  [ROUTER_MARKER]: true;
  procedures: T;
  auth?: ResolvedAuthConfig;
}

export const ROUTER_MARKER = Symbol.for("ovenless.router");

export interface CreateRouterOptions {
  auth?: RouterAuthConfig;
  profile?: import("./config.ts").OvenlessProfile;
  certDir?: string;
}

/** Default schema for procedures with no input */
export const voidInput = z.object({});

export type MaybePromise<T> = T | Promise<T>;

/** Keys on the input object that are required at call time */
type RequiredInputKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

/** Whether the client may call a procedure with no arguments */
export type IsOptionalClientInput<T> = [T] extends [void]
  ? true
  : undefined extends T
  ? true
  : keyof T extends never
  ? true
  : RequiredInputKeys<T> extends never
  ? true
  : false;

export function isVoidInput(schema: ZodType, procedure?: Procedure): boolean {
  if (procedure?.__voidInput === true) return true;
  if (schema === voidInput) return true;
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    return Object.keys(shape).length === 0;
  }
  return false;
}

/** Parse URL query params; duplicate keys become string arrays */
export function queryInputFromSearchParams(
  params: URLSearchParams,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length === 1 ? all[0]! : all;
  }
  return out;
}

export type InferProcedureClient<I extends ZodType, O extends ZodType> =
  IsOptionalClientInput<z.infer<I>> extends true
  ? (input?: z.infer<I>) => Promise<z.infer<O>>
  : (input: z.infer<I>) => Promise<z.infer<O>>;

export type VoidInputProcedure<TOutput extends ZodType = ZodType> = Procedure<
  typeof voidInput,
  TOutput
> & { __voidInput: true };

export type InferClientProcedure<P> = P extends Procedure<infer I, infer O>
  ? P extends { __voidInput: true }
  ? () => Promise<z.infer<O>>
  : InferProcedureClient<I, O>
  : never;

export function isProcedure(value: unknown): value is Procedure {
  return (
    typeof value === "object" &&
    value !== null &&
    PROCEDURE_MARKER in value &&
    (value as Procedure)[PROCEDURE_MARKER] === true
  );
}

export function isRouter(value: unknown): value is Router {
  return (
    typeof value === "object" &&
    value !== null &&
    ROUTER_MARKER in value &&
    (value as Router)[ROUTER_MARKER] === true
  );
}

function buildProcedure(
  type: ProcedureType,
  config: {
    input?: ZodType;
    output: ZodType;
    handler: (...args: unknown[]) => unknown;
    meta?: ProcedureMeta;
    __voidInput?: boolean;
  },
): Procedure {
  const isPublic = config.meta?.public === true;
  const proc: Procedure = {
    [PROCEDURE_MARKER]: true,
    type,
    input: config.input ?? voidInput,
    output: config.output,
    handler: config.handler as Procedure["handler"],
    meta: config.meta,
    __public: isPublic,
    ...(config.__voidInput ? { __voidInput: true as const } : {}),
  };
  return proc;
}

type ProcedureConfigBase = {
  meta?: ProcedureMeta;
};

// --- Query overloads (no auth / public) ---

export type QueryNoInputPublic<TOutput extends ZodType> = ProcedureConfigBase & {
  meta: { public: true };
  input?: never;
  output: TOutput;
  handler: VoidPublicHandler<TOutput> | PublicHandlerNoInput<TOutput>;
};

export type QueryWithInputPublic<
  TInput extends ZodType,
  TOutput extends ZodType,
  TClaims extends ZodType | undefined = undefined,
> = ProcedureConfigBase & {
  meta: { public: true };
  input: TInput;
  output: TOutput;
  handler: PublicHandler<z.infer<TInput>, z.infer<TOutput>, TClaims>;
};

export type QueryNoInputProtected<TOutput extends ZodType, TClaims extends ZodType | undefined> = {
  meta?: { public?: false };
  input?: never;
  output: TOutput;
  handler: ProtectedHandlerNoInput<z.infer<TOutput>, TClaims>;
};

export type QueryWithInputProtected<
  TInput extends ZodType,
  TOutput extends ZodType,
  TClaims extends ZodType | undefined,
> = {
  meta?: { public?: false };
  input: TInput;
  output: TOutput;
  handler: ProtectedHandler<z.infer<TInput>, z.infer<TOutput>, TClaims>;
};

export type QueryNoInputPlain<TOutput extends ZodType> = ProcedureConfigBase & {
  input?: never;
  output: TOutput;
  handler: () => MaybePromise<z.infer<TOutput>>;
};

export type QueryWithInputPlain<TInput extends ZodType, TOutput extends ZodType> = ProcedureConfigBase & {
  input: TInput;
  output: TOutput;
  handler: (input: z.infer<TInput>) => MaybePromise<z.infer<TOutput>>;
};

/** Void output with auth context (protected) */
type QueryVoidAuth<
  TOutput extends ZodType,
  TClaims extends ZodType | undefined = undefined,
> = ProcedureConfigBase & {
  input?: never;
  output: TOutput;
  handler: ProtectedHandlerNoInput<z.infer<TOutput>, TClaims>;
};

/** Input + auth context (protected) */
type QueryWithInputAuth<
  TInput extends ZodType,
  TOutput extends ZodType,
  TClaims extends ZodType | undefined = undefined,
> = ProcedureConfigBase & {
  input: TInput;
  output: TOutput;
  handler: ProtectedHandler<z.infer<TInput>, z.infer<TOutput>, TClaims>;
};

export function query<TOutput extends ZodType>(config: QueryNoInputPublic<TOutput>): VoidInputProcedure<TOutput>;
export function query<
  TInput extends ZodType,
  TOutput extends ZodType,
  TClaims extends ZodType | undefined = undefined,
>(config: QueryWithInputPublic<TInput, TOutput, TClaims>): Procedure<TInput, TOutput>;
export function query<TOutput extends ZodType, TClaims extends ZodType | undefined = undefined>(
  config: QueryNoInputProtected<TOutput, TClaims>,
): VoidInputProcedure<TOutput>;
export function query<TInput extends ZodType, TOutput extends ZodType, TClaims extends ZodType | undefined = undefined>(
  config: QueryWithInputProtected<TInput, TOutput, TClaims>,
): Procedure<TInput, TOutput>;
export function query<TOutput extends ZodType>(config: QueryNoInputPlain<TOutput>): VoidInputProcedure<TOutput>;
export function query<TInput extends ZodType, TOutput extends ZodType>(
  config: QueryWithInputPlain<TInput, TOutput>,
): Procedure<TInput, TOutput>;
export function query(
  config:
    | QueryNoInputPlain<ZodType>
    | QueryWithInputPlain<ZodType, ZodType>
    | QueryVoidAuth<ZodType, ZodType | undefined>
    | QueryWithInputAuth<ZodType, ZodType, ZodType | undefined>
    | QueryNoInputPublic<ZodType>
    | QueryWithInputPublic<ZodType, ZodType>,
): Procedure<ZodType, ZodType> | VoidInputProcedure {
  if ("input" in config && config.input != null) {
    const withInput = config as QueryWithInputPlain<ZodType, ZodType>;
    return buildProcedure("query", {
      input: withInput.input,
      output: withInput.output,
      handler: withInput.handler as (...args: unknown[]) => unknown,
      meta: config.meta,
    });
  }

  const withoutInput = config as QueryNoInputPlain<ZodType>;

  return buildProcedure("query", {
    output: withoutInput.output,
    meta: config.meta,
    __voidInput: true,
    handler: withoutInput.handler as (...args: unknown[]) => unknown,
  }) as VoidInputProcedure;
}

export function mutation<TOutput extends ZodType>(config: QueryNoInputPublic<TOutput>): VoidInputProcedure<TOutput>;
export function mutation<
  TInput extends ZodType,
  TOutput extends ZodType,
  TClaims extends ZodType | undefined = undefined,
>(config: QueryWithInputPublic<TInput, TOutput, TClaims>): Procedure<TInput, TOutput>;
export function mutation<TOutput extends ZodType, TClaims extends ZodType | undefined = undefined>(
  config: QueryNoInputProtected<TOutput, TClaims>,
): VoidInputProcedure<TOutput>;
export function mutation<TInput extends ZodType, TOutput extends ZodType, TClaims extends ZodType | undefined = undefined>(
  config: QueryWithInputProtected<TInput, TOutput, TClaims>,
): Procedure<TInput, TOutput>;
export function mutation<TOutput extends ZodType>(config: QueryNoInputPlain<TOutput>): VoidInputProcedure<TOutput>;
export function mutation<TInput extends ZodType, TOutput extends ZodType>(
  config: QueryWithInputPlain<TInput, TOutput>,
): Procedure<TInput, TOutput>;
export function mutation(
  config:
    | QueryNoInputPlain<ZodType>
    | QueryWithInputPlain<ZodType, ZodType>
    | QueryVoidAuth<ZodType, ZodType | undefined>
    | QueryWithInputAuth<ZodType, ZodType, ZodType | undefined>
    | QueryNoInputPublic<ZodType>
    | QueryWithInputPublic<ZodType, ZodType>,
): Procedure<ZodType, ZodType> | VoidInputProcedure {
  if ("input" in config && config.input != null) {
    const withInput = config as QueryWithInputPlain<ZodType, ZodType>;
    return buildProcedure("mutation", {
      input: withInput.input,
      output: withInput.output,
      handler: withInput.handler as (...args: unknown[]) => unknown,
      meta: config.meta,
    });
  }

  const withoutInput = config as QueryNoInputPlain<ZodType>;

  return buildProcedure("mutation", {
    output: withoutInput.output,
    meta: config.meta,
    __voidInput: true,
    handler: withoutInput.handler as (...args: unknown[]) => unknown,
  }) as VoidInputProcedure;
}

function inheritAuthOnTree(node: RouterRecord, auth: ResolvedAuthConfig): void {
  for (const value of Object.values(node)) {
    if (isRouter(value)) {
      if (!value.auth) value.auth = auth;
      inheritAuthOnTree(value.procedures, auth);
    }
  }
}

export function createRouter<T extends RouterRecord>(
  procedures: T,
  options?: CreateRouterOptions,
): Router<T> {
  const router: Router<T> = {
    [ROUTER_MARKER]: true,
    procedures,
  };

  if (options?.auth) {
    router.auth = resolveAuthConfig(options.auth, {
      profile: options.profile,
      certDir: options.certDir,
    });
    inheritAuthOnTree(procedures, router.auth);
  }

  return router;
}

export function getRouterAuth(router: Router): ResolvedAuthConfig | undefined {
  return router.auth;
}

/** query/mutation bound to a claims schema, so handler `claims` and `auth.sign()` are checked against it */
export interface ClaimsScopedProcedures<TClaims extends ZodType> {
  query: {
    <TOutput extends ZodType>(config: QueryNoInputPublic<TOutput>): VoidInputProcedure<TOutput>;
    <TInput extends ZodType, TOutput extends ZodType>(
      config: QueryWithInputPublic<TInput, TOutput, TClaims>,
    ): Procedure<TInput, TOutput>;
    <TOutput extends ZodType>(config: QueryNoInputProtected<TOutput, TClaims>): VoidInputProcedure<TOutput>;
    <TInput extends ZodType, TOutput extends ZodType>(
      config: QueryWithInputProtected<TInput, TOutput, TClaims>,
    ): Procedure<TInput, TOutput>;
    <TOutput extends ZodType>(config: QueryNoInputPlain<TOutput>): VoidInputProcedure<TOutput>;
    <TInput extends ZodType, TOutput extends ZodType>(
      config: QueryWithInputPlain<TInput, TOutput>,
    ): Procedure<TInput, TOutput>;
  };
  mutation: {
    <TOutput extends ZodType>(config: QueryNoInputPublic<TOutput>): VoidInputProcedure<TOutput>;
    <TInput extends ZodType, TOutput extends ZodType>(
      config: QueryWithInputPublic<TInput, TOutput, TClaims>,
    ): Procedure<TInput, TOutput>;
    <TOutput extends ZodType>(config: QueryNoInputProtected<TOutput, TClaims>): VoidInputProcedure<TOutput>;
    <TInput extends ZodType, TOutput extends ZodType>(
      config: QueryWithInputProtected<TInput, TOutput, TClaims>,
    ): Procedure<TInput, TOutput>;
    <TOutput extends ZodType>(config: QueryNoInputPlain<TOutput>): VoidInputProcedure<TOutput>;
    <TInput extends ZodType, TOutput extends ZodType>(
      config: QueryWithInputPlain<TInput, TOutput>,
    ): Procedure<TInput, TOutput>;
  };
}

/** Bind query/mutation to a claims schema: handler `claims` fields and `auth.sign()` calls are typechecked against it */
export function withClaims<TClaims extends ZodType>(claimsSchema: TClaims): ClaimsScopedProcedures<TClaims> {
  void claimsSchema;
  return { query, mutation } as unknown as ClaimsScopedProcedures<TClaims>;
}

export type InferProcedureInput<T> = T extends Procedure<infer I, ZodType>
  ? z.infer<I>
  : never;

export type InferProcedureOutput<T> = T extends Procedure<ZodType, infer O>
  ? z.infer<O>
  : never;

export type InferClient<T> = {
  [K in keyof T]: T[K] extends Router<infer R>
  ? InferClient<R>
  : T[K] extends Procedure<infer I, infer O>
  ? InferClientProcedure<T[K]>
  : never;
};

export type AppClient<TRouter extends Router> = InferClient<TRouter["procedures"]>;

export interface ResolvedProcedure {
  procedure: Procedure;
  path: string;
}

export function resolveProcedure(
  router: Router,
  pathSegments: string[],
): ResolvedProcedure | null {
  let current: RouterRecord = router.procedures;
  let rootAuth = router.auth;

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i];
    if (!segment) return null;

    const node = current[segment];
    if (!node) return null;

    const isLast = i === pathSegments.length - 1;

    if (isProcedure(node)) {
      return isLast ? { procedure: node, path: pathSegments.join(".") } : null;
    }

    if (isRouter(node)) {
      if (isLast) return null;
      current = node.procedures;
      if (node.auth) rootAuth = node.auth;
      continue;
    }

    return null;
  }

  return null;
}

export function collectProcedures(
  router: Router,
  prefix: string[] = [],
): ResolvedProcedure[] {
  const results: ResolvedProcedure[] = [];

  for (const [key, node] of Object.entries(router.procedures)) {
    const path = [...prefix, key];

    if (isProcedure(node)) {
      results.push({ procedure: node, path: path.join(".") });
    } else if (isRouter(node)) {
      results.push(...collectProcedures(node, path));
    }
  }

  return results;
}

export function parseProcedurePath(rawPath: string): string[] {
  const trimmed = rawPath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) return [];

  if (trimmed.includes(".")) {
    return trimmed.split(".").filter(Boolean);
  }

  return trimmed.split("/").filter(Boolean);
}
