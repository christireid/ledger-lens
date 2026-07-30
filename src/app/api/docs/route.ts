import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { API_INVENTORY } from "@/lib/api-inventory";
import { ERROR_CODES } from "@/lib/schemas/error-codes";

extendZodWithOpenApi(z);

/**
 * GET /api/docs — OpenAPI 3.1 generated from the Zod schemas (§17.5), the
 * hiring-evaluator artifact. Served in non-prod (§17.5); harmless read-only
 * metadata elsewhere.
 */

function buildDocument() {
  const registry = new OpenAPIRegistry();

  const errorEnvelope = z.object({
    error: z.object({
      code: z.enum(ERROR_CODES),
      message: z.string(),
      fields: z.record(z.string()).optional(),
      retryAfter: z.number().optional(),
      requestId: z.string(),
    }),
  });

  for (const row of API_INVENTORY) {
    if (row.path === "/docs") continue;
    const params = [...row.path.matchAll(/:(\w+)/g)].map((m) => m[1]!);
    registry.registerPath({
      method: row.method.toLowerCase() as "get" | "post" | "patch" | "delete",
      path: row.path.replace(/:(\w+)/g, "{$1}"),
      summary: row.notes ?? `${row.method} ${row.path}`,
      request: {
        ...(params.length
          ? {
              params: z.object(
                Object.fromEntries(params.map((p) => [p, z.string()])),
              ),
            }
          : {}),
        ...(row.querySchema ? { query: row.querySchema as never } : {}),
        ...(row.bodySchema
          ? {
              body: {
                content: {
                  "application/json": { schema: row.bodySchema as never },
                },
              },
            }
          : {}),
      },
      responses: {
        200: {
          description: "Success envelope { data, meta? }",
          content: {
            "application/json": {
              schema: z.object({ data: z.unknown(), meta: z.unknown().optional() }),
            },
          },
        },
        422: {
          description: "Error envelope (§18)",
          content: { "application/json": { schema: errorEnvelope } },
        },
      },
    });
  }

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Ledger Lens API",
      version: "1.0.0",
      description:
        "AI-assisted financial investigation workspace. Money is decimal strings; IDs are prefixed; the workspace is implicit from the session (§17.1).",
    },
    servers: [{ url: "/api" }],
  });
}

export async function GET(): Promise<Response> {
  return Response.json(buildDocument());
}
