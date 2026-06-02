import type { ZodType } from "zod";
import { z } from "zod";

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
  handler: (input: z.infer<TInput>) => Promise<z.infer<TOutput>> | z.infer<TOutput>;
  /** Set when the procedure accepts no client input */
  __voidInput?: true;
}

export type RouterRecord = Record<string, Procedure | Router>;

export interface Router<T extends RouterRecord = RouterRecord> {
  [ROUTER_MARKER]: true;
  procedures: T;
}

export const ROUTER_MARKER = Symbol.for("ovenless.router");

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

type QueryNoInput<TOutput extends ZodType> = {
  input?: never;
  output: TOutput;
  handler: () => MaybePromise<z.infer<TOutput>>;
};

type QueryWithInput<TInput extends ZodType, TOutput extends ZodType> = {
  input: TInput;
  output: TOutput;
  handler: (input: z.infer<TInput>) => MaybePromise<z.infer<TOutput>>;
};

export function query<TOutput extends ZodType>(
  config: QueryNoInput<TOutput>,
): VoidInputProcedure<TOutput>;
export function query<TInput extends ZodType, TOutput extends ZodType>(
  config: QueryWithInput<TInput, TOutput>,
): Procedure<TInput, TOutput>;
export function query(
  config: QueryNoInput<ZodType> | QueryWithInput<ZodType, ZodType>,
): Procedure<ZodType, ZodType> | VoidInputProcedure {
  if ("input" in config && config.input != null) {
    const withInput = config as QueryWithInput<ZodType, ZodType>;
    return {
      [PROCEDURE_MARKER]: true,
      type: "query",
      input: withInput.input,
      output: withInput.output,
      handler: withInput.handler,
    };
  }

  const withoutInput = config as QueryNoInput<ZodType>;
  return {
    [PROCEDURE_MARKER]: true,
    type: "query",
    input: voidInput,
    output: withoutInput.output,
    handler: () => withoutInput.handler(),
    __voidInput: true,
  };
}

type MutationNoInput<TOutput extends ZodType> = QueryNoInput<TOutput>;
type MutationWithInput<TInput extends ZodType, TOutput extends ZodType> = QueryWithInput<TInput, TOutput>;

export function mutation<TOutput extends ZodType>(
  config: MutationNoInput<TOutput>,
): VoidInputProcedure<TOutput>;
export function mutation<TInput extends ZodType, TOutput extends ZodType>(
  config: MutationWithInput<TInput, TOutput>,
): Procedure<TInput, TOutput>;
export function mutation(
  config: MutationNoInput<ZodType> | MutationWithInput<ZodType, ZodType>,
): Procedure<ZodType, ZodType> | VoidInputProcedure {
  if ("input" in config && config.input != null) {
    const withInput = config as MutationWithInput<ZodType, ZodType>;
    return {
      [PROCEDURE_MARKER]: true,
      type: "mutation",
      input: withInput.input,
      output: withInput.output,
      handler: withInput.handler,
    };
  }

  const withoutInput = config as MutationNoInput<ZodType>;
  return {
    [PROCEDURE_MARKER]: true,
    type: "mutation",
    input: voidInput,
    output: withoutInput.output,
    handler: () => withoutInput.handler(),
    __voidInput: true,
  };
}

export function createRouter<T extends RouterRecord>(procedures: T): Router<T> {
  return {
    [ROUTER_MARKER]: true,
    procedures,
  };
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
