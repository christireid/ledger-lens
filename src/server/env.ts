import "server-only";

import { z } from "zod";

/**
 * Typed env module — spec §07.9 / §23.4.
 *
 * Parses process.env through Zod at boot; missing/invalid vars fail the
 * build/deploy, not the first request. In production every required var is
 * mandatory; in local/test, external-service credentials may be absent —
 * features that need them gate on presence and fail loudly when invoked
 * (DECISIONS.md 2026-07-30: operator config placeholders unfilled).
 *
 * DEMO_E2E_SECRET is asserted absent in prod at boot (§23.4).
 */
const serverSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().url().optional(),
    DIRECT_URL: z.string().url().optional(),
    CLERK_SECRET_KEY: z.string().min(1).optional(),
    CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    CRON_SECRET: z.string().min(1).optional(),
    DEMO_WORKSPACE_ID: z.string().uuid().optional(),
    DEMO_E2E_SECRET: z.string().min(1).optional(),
    SENTRY_DSN: z.string().url().optional(),
    AXIOM_TOKEN: z.string().min(1).optional(),
    OPENAI_SMOKE: z.enum(["1", "true"]).optional(),
  })
  .superRefine((vars, ctx) => {
    if (vars.NODE_ENV === "production") {
      // §23.4: the typed env module fails the build on any missing required
      // variable in production.
      const required = [
        "DATABASE_URL",
        "DIRECT_URL",
        "CLERK_SECRET_KEY",
        "CLERK_WEBHOOK_SECRET",
        "OPENAI_API_KEY",
        "CRON_SECRET",
      ] as const;
      for (const key of required) {
        if (!vars[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required in production`,
          });
        }
      }
      if (vars.DEMO_E2E_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DEMO_E2E_SECRET"],
          message: "DEMO_E2E_SECRET must be unset in production (§23.4)",
        });
      }
    }
  });

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid server environment (§07.9):\n${detail}`);
}

export const env = parsed.data;

/** True when the OpenAI gateway must run mocked (§22, operator config "MOCK"). */
export const openAiIsMocked =
  !env.OPENAI_API_KEY || env.OPENAI_API_KEY === "MOCK";
