import { z } from "zod";
import { createRouter, query } from "ovenless";

export default createRouter({
  ping: query({
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    handler: () => ({ ok: true }),
  }),
});
