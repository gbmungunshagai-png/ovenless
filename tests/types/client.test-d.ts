import type { InferClientProcedure } from "../../framework/index.ts";
import { testRouter } from "../fixtures/router.ts";

type Health = InferClientProcedure<(typeof testRouter.procedures.health)>;
type GetById = InferClientProcedure<(typeof testRouter.procedures.users.procedures.getById)>;

declare const health: Health;
declare const getById: GetById;

// no-input
health();

// required input
getById({ id: "1" });

// @ts-expect-error missing required id
getById();
