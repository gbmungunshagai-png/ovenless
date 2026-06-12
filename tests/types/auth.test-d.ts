import { z } from "zod";
import { createRouter, query } from "../../framework/index.ts";
import type { ProcedureContext } from "../../framework/auth/context.ts";

const claimsSchema = z.object({ role: z.enum(["user", "admin"]) });

type ExpectedClaims = { role: "user" | "admin" };

const router = createRouter(
  {
    secret: query({
      output: z.object({ id: z.string() }),
      handler: (ctx: ProcedureContext<object, typeof claimsSchema>) => {
        const _principalId: string = ctx.principalId;
        const _role: ExpectedClaims["role"] = ctx.claims.role as ExpectedClaims["role"];
        return { id: ctx.principalId };
      },
    }),
  },
  {
    auth: {
      mode: "bearer",
      ttl: "10m",
      claims: claimsSchema,
    },
  },
);

void router;
