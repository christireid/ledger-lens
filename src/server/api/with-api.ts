import "server-only";

import { randomUUID } from "node:crypto";

import { ZodError, type ZodTypeAny, type z } from "zod";

import { buildCtx, type Ctx } from "@/server/context";
import { withRls, type RlsDb } from "@/server/db/rls";
import { env } from "@/server/env";
import { AppError, RateLimitError, UnauthorizedError } from "@/server/errors";
import { checkRateLimit, type RateScope } from "@/server/api/rate-limit";
import { resolveWorkspace } from "@/server/services/workspace";

/**
 * withApi — §07.4: the single composition point producing the §17 envelope.
 * Resolves auth + workspace, parses body/query through Zod, enforces rate
 * limits, serializes AppErrors per §18.3, stamps requestId + timing.
 */

export type ApiHandlerArgs<TBody, TQuery> = {
  ctx: Ctx;
  db: RlsDb;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
  req: Request;
  requestId: string;
};

type Options<TBody extends ZodTypeAny | undefined, TQuery extends ZodTypeAny | undefined> = {
  auth?: "required" | "none";
  bodySchema?: TBody;
  querySchema?: TQuery;
  rateScope?: RateScope;
  /** raw body routes (multipart/CSV) skip JSON parsing */
  rawBody?: boolean;
};

export function ok<T>(data: T, meta?: { cursor?: string | null; total?: number | "10000+" }, status = 200): Response {
  return Response.json(meta === undefined ? { data } : { data, meta }, { status });
}

export function created<T>(data: T): Response {
  return ok(data, undefined, 201);
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function serializeError(err: unknown, requestId: string): Response {
  if (err instanceof AppError) {
    const body = {
      error: {
        code: err.code,
        message: err.expose
          ? err.message
          : `Something went wrong. Reference: ${requestId}`,
        ...(err.fields ? { fields: err.fields } : {}),
        ...(err.retryAfter !== undefined ? { retryAfter: err.retryAfter } : {}),
        ...(err.meta ?? {}),
        requestId,
      },
    };
    const headers: Record<string, string> = {};
    if (err.retryAfter !== undefined) headers["Retry-After"] = String(err.retryAfter);
    return Response.json(body, { status: err.httpStatus, headers });
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      fields[issue.path.join(".") || "_"] = issue.message;
    }
    return Response.json(
      { error: { code: "validation_failed", message: "Validation failed.", fields, requestId } },
      { status: 422 },
    );
  }
  // §18.3: generic message ONLY — no stacks, SQL, or internals cross the wire.
  console.error(`[${requestId}] unhandled`, err);
  return Response.json(
    {
      error: {
        code: "internal_error",
        message: `Something went wrong. Reference: ${requestId}`,
        requestId,
      },
    },
    { status: 500 },
  );
}

/** Resolve the authenticated Clerk user; §20.8 test-session path for E2E/preview. */
async function resolveUserId(req: Request): Promise<string | null> {
  // Test-session mechanism (DEMO_E2E_SECRET, §20.8/§23.4 — asserted absent in prod).
  const testSecret = env.DEMO_E2E_SECRET;
  if (testSecret) {
    const provided = req.headers.get("x-demo-e2e-secret");
    const testUser = req.headers.get("x-demo-user-id");
    if (provided === testSecret && testUser) return testUser;
  }
  if (env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId;
  }
  return null;
}

export function withApi<
  TBody extends ZodTypeAny | undefined = undefined,
  TQuery extends ZodTypeAny | undefined = undefined,
>(
  options: Options<TBody, TQuery>,
  handler: (
    args: ApiHandlerArgs<
      TBody extends ZodTypeAny ? z.infer<TBody> : undefined,
      TQuery extends ZodTypeAny ? z.infer<TQuery> : undefined
    >,
  ) => Promise<Response>,
) {
  return async (
    req: Request,
    routeCtx: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const requestId = randomUUID().slice(0, 8);
    const started = Date.now();
    try {
      const params = (await routeCtx?.params) ?? {};

      // Auth (§10.3): userId exclusively from the verified session.
      const userId = await resolveUserId(req);
      if (options.auth !== "none" && !userId) {
        throw new UnauthorizedError();
      }

      // Rate limit (§07.7) — keyed by user, IP pre-auth.
      const scope: RateScope = options.rateScope ?? "global";
      const rateKey = userId ?? req.headers.get("x-forwarded-for") ?? "anon";
      const rate = await checkRateLimit(scope, rateKey);
      if (!rate.allowed) throw new RateLimitError(rate.retryAfter);

      // CSRF posture (§10.3/§21): state-changing endpoints reject non-JSON.
      const method = req.method.toUpperCase();
      let rawBody: unknown;
      if (["POST", "PATCH", "PUT", "DELETE"].includes(method) && !options.rawBody) {
        const contentType = req.headers.get("content-type") ?? "";
        if (options.bodySchema && !contentType.includes("application/json")) {
          throw new AppError("validation_failed", "Expected application/json body.");
        }
        if (options.bodySchema) {
          try {
            rawBody = await req.json();
          } catch {
            throw new AppError("validation_failed", "Malformed JSON body.");
          }
        }
      }
      const body = options.bodySchema ? options.bodySchema.parse(rawBody) : undefined;

      const query = options.querySchema
        ? options.querySchema.parse(
            Object.fromEntries(new URL(req.url).searchParams),
          )
        : undefined;

      // No-session public routes handle their own auth (webhook/cron).
      if (!userId) {
        return await handler({
          ctx: undefined as never,
          db: undefined as never,
          body: body as never,
          query: query as never,
          params,
          req,
          requestId,
        });
      }

      // Workspace resolution (§10.4) inside the RLS transaction (§10.5).
      const response = await withRls(userId, async (db) => {
        const resolved = await resolveWorkspace(db, userId);
        const ctx = buildCtx({
          userId,
          workspaceId: resolved.workspaceId,
          role: resolved.role,
          db,
          logger: {
            info: (msg, m) => console.log(`[${requestId}] ${msg}`, m ?? ""),
            warn: (msg, m) => console.warn(`[${requestId}] ${msg}`, m ?? ""),
            error: (msg, m) => console.error(`[${requestId}] ${msg}`, m ?? ""),
          },
        });
        return handler({
          ctx,
          db,
          body: body as never,
          query: query as never,
          params,
          req,
          requestId,
        });
      });
      return response;
    } catch (err) {
      return serializeError(err, requestId);
    } finally {
      const ms = Date.now() - started;
      console.log(`[${requestId}] ${req.method} ${new URL(req.url).pathname} ${ms}ms`);
    }
  };
}
