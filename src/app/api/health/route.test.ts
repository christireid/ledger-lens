import { describe, expect, it, vi } from "vitest";

/** §24.10 — health envelope shapes: 200 data envelope, 503 §17.1 error envelope. */

vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({
  env: { DATABASE_URL: "postgres://mocked", OPENAI_API_KEY: "MOCK" },
}));
vi.mock("@/server/db/rls", () => ({
  adminDb: () => ({
    execute: vi.fn().mockImplementation(() => {
      if (dbHealthy) return Promise.resolve([{ "?column?": 1 }]);
      return Promise.reject(new Error("connect ECONNREFUSED"));
    }),
  }),
}));

let dbHealthy = true;

describe("GET /api/health (§24.6)", () => {
  it("returns 200 with a data envelope when the DB answers", async () => {
    dbHealthy = true;
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string; checks: Record<string, string> } };
    expect(body.data.status).toBe("healthy");
    expect(body.data.checks.database).toBe("ok");
  });

  it("returns 503 with the §17.1 error envelope when the DB is down", async () => {
    dbHealthy = false;
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe("upstream_unavailable");
    // §18.3 posture: no dependency detail crosses the wire.
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });
});
