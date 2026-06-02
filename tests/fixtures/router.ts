import { z } from "zod";
import { createRouter, mutation, query } from "../../framework/index.ts";

const users = [
  { id: "1", name: "Alice", email: "alice@example.com" },
  { id: "2", name: "Bob", email: "bob@example.com" },
];

export const testRouter = createRouter({
  health: query({
    output: z.object({ status: z.literal("ok"), timestamp: z.string() }),
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
        const user = users.find((entry) => entry.id === id);
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
