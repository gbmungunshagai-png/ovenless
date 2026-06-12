import type { ZodType } from "zod";
import { z } from "zod";
import type { MaybePromise } from "../core.ts";
import type { RouterAuthConfig } from "./context.ts";
import type {
  ProcedureContext,
  PublicProcedureContext,
  JwtRuntime,
} from "./context.ts";

export type ProcedureMeta = {
  public?: boolean;
};

export type AuthClaimsSchema<T> = T extends RouterAuthConfig<infer C> ? C : undefined;

export type InferAuthClaims<TAuth> = TAuth extends RouterAuthConfig<infer C>
  ? C extends ZodType
    ? z.infer<C>
    : Record<string, unknown>
  : Record<string, unknown>;

/** Protected procedure — one merged context argument */
export type ProtectedHandler<TIn, TOut, TClaims extends ZodType | undefined> = (
  ctx: ProcedureContext<TIn, TClaims>,
) => MaybePromise<TOut>;

/** Public procedure with input (e.g. login) */
export type PublicHandler<TIn, TOut> = (
  ctx: PublicProcedureContext<TIn>,
) => MaybePromise<TOut>;

/** Public void-input procedure */
export type PublicHandlerNoInput<TOut> = () => MaybePromise<TOut>;

/** Protected void-input procedure */
export type ProtectedHandlerNoInput<TOut, TClaims extends ZodType | undefined> = (
  ctx: ProcedureContext<object, TClaims>,
) => MaybePromise<TOut>;

export type VoidPublicHandler<TOut> = () => MaybePromise<TOut>;

export type HasAuth<TAuth> = TAuth extends RouterAuthConfig ? true : false;

export type { ProcedureContext, PublicProcedureContext, JwtRuntime };
