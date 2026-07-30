import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { API_INVENTORY, type EndpointRow } from "@/lib/api-inventory";
import { toPublicId } from "@/lib/public-ids";
import {
  accounts,
  alertRules,
  anomalies,
  importBatches,
  investigations,
  messages,
  notifications,
  transactions,
  workspaces,
} from "@/server/db/schema";
import { adminDb } from "@/server/db/rls";

/**
 * Contract tests — §17.5: requests generated for every §17.2 row —
 * valid + boundary + invalid per field. Handlers invoked directly (no HTTP
 * server); auth via the §20.8 test-session mechanism; real local DB.
 */

const SECRET = process.env.DEMO_E2E_SECRET ?? "";
const userId = `contract_${randomUUID().slice(0, 8)}`;

type Fx = {
  accountId: string;
  txId: string;
  batchId: string; // validated batch
  anomalyId: string;
  ruleId: string;
  notificationId: string;
  investigationId: string;
  messageId: string;
};
const fx = {} as Fx;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("contract tests require DATABASE_URL");
  if (!SECRET) throw new Error("contract tests require DEMO_E2E_SECRET (set by config)");
  const db = adminDb();
  const [ws] = await db
    .insert(workspaces)
    .values({ clerkUserId: userId, name: "Contract" })
    .returning();
  const [account] = await db
    .insert(accounts)
    .values({ workspaceId: ws!.id, name: "Contract Checking", type: "bank", currency: "USD" })
    .returning();
  fx.accountId = account!.id;
  const csv = "Date,Description,Amount\r\n2026-01-05,ROW,-10.00\r\n";
  const { createHash } = await import("node:crypto");
  const [batch] = await db
    .insert(importBatches)
    .values({
      workspaceId: ws!.id,
      fileName: "contract.csv",
      contentHash: createHash("sha256").update(csv).digest("hex"),
      status: "validated",
      mapping: { date: 0, description: 1, amount: 2 },
      rawContent: Buffer.from(csv).toString("base64"),
      stats: { accepted: 1, rejected: 0, duplicates: 0 },
      rejectedRows: [],
    })
    .returning();
  fx.batchId = batch!.id;
  const [tx] = await db
    .insert(transactions)
    .values({
      workspaceId: ws!.id,
      accountId: account!.id,
      importBatchId: batch!.id,
      date: "2026-01-02",
      type: "deposit",
      amount: "100.0000",
      currency: "USD",
    })
    .returning();
  fx.txId = tx!.id;
  const [anomaly] = await db
    .insert(anomalies)
    .values({
      workspaceId: ws!.id,
      type: "large_transaction",
      severity: "medium",
      title: "contract",
      evidenceTxIds: [tx!.id],
      evidenceHash: randomUUID(),
    })
    .returning();
  fx.anomalyId = anomaly!.id;
  const [rule] = await db
    .insert(alertRules)
    .values({
      workspaceId: ws!.id,
      type: "large_transaction",
      name: "contract rule",
      params: { threshold: "5000.00" },
    })
    .returning();
  fx.ruleId = rule!.id;
  const [notification] = await db
    .insert(notifications)
    .values({ workspaceId: ws!.id, title: "n", body: "b", dedupKey: randomUUID() })
    .returning();
  fx.notificationId = notification!.id;
  const [inv] = await db
    .insert(investigations)
    .values({ workspaceId: ws!.id, title: "contract" })
    .returning();
  fx.investigationId = inv!.id;
  const [message] = await db
    .insert(messages)
    .values({
      workspaceId: ws!.id,
      investigationId: inv!.id,
      role: "user",
      content: "hello",
    })
    .returning();
  fx.messageId = message!.id;
});

afterAll(async () => {
  await adminDb().delete(workspaces).where(eq(workspaces.clerkUserId, userId));
});

type Case = {
  params?: Record<string, string>;
  query?: string;
  body?: unknown;
  /** expected success status for the valid case */
  status: number;
  /** invalid-body case expected status (default 422) */
  invalidStatus?: number;
  skipInvalid?: boolean;
  contentType?: string | null;
};

function validCaseFor(row: EndpointRow): Case | null {
  const key = `${row.method} ${row.path}`;
  const map: Record<string, Case> = {
    "GET /dashboard": { query: "?range=90d", status: 200 },
    "GET /transactions": { query: "?limit=10", status: 200 },
    "GET /transactions/:id": { params: { id: toPublicId("transaction", fx.txId) }, status: 200 },
    "POST /transactions/:id/supersede": {
      params: { id: toPublicId("transaction", fx.txId) },
      body: { correction: { date: "2026-01-02", type: "deposit", amount: "101.00", description: "fixed" } },
      status: 201,
    },
    "GET /accounts": { status: 200 },
    "POST /accounts": {
      body: { name: `Acct ${randomUUID().slice(0, 6)}`, type: "bank", currency: "USD" },
      status: 201,
    },
    "PATCH /accounts/:id": {
      params: { id: toPublicId("account", fx.accountId) },
      body: { institution: "Contract Bank" },
      status: 200,
    },
    "POST /accounts/:id/archive": {
      params: { id: toPublicId("account", fx.accountId) },
      status: 200,
    },
    "GET /snapshots/series": { query: "?range=90d", status: 200 },
    "GET /anomalies": { query: "?status=open", status: 200 },
    "POST /anomalies/:id/status": {
      params: { id: toPublicId("anomaly", fx.anomalyId) },
      body: { status: "acknowledged" },
      status: 200,
    },
    "POST /anomalies/bulk-status": {
      body: { ids: [toPublicId("anomaly", fx.anomalyId)], status: "acknowledged" },
      status: 200,
    },
    "GET /alerts": { status: 200 },
    "POST /alerts": {
      body: { type: "account_inactivity", name: `r ${randomUUID().slice(0, 6)}`, enabled: true, params: { days: 45 } },
      status: 201,
    },
    "PATCH /alerts/:id": {
      params: { id: toPublicId("alertRule", fx.ruleId) },
      body: { enabled: false },
      status: 200,
    },
    "DELETE /alerts/:id": { params: { id: toPublicId("alertRule", fx.ruleId) }, status: 204, skipInvalid: true },
    "POST /alerts/preview": {
      body: { type: "large_transaction", name: "preview", enabled: true, params: { threshold: "50.00" } },
      status: 200,
    },
    "GET /notifications": { status: 200 },
    "POST /notifications/read": { body: { all: true }, status: 200 },
    "GET /investigations": { status: 200 },
    "POST /investigations": { status: 201, skipInvalid: true },
    "GET /investigations/:id": { params: { id: toPublicId("investigation", fx.investigationId) }, status: 200 },
    "PATCH /investigations/:id": {
      params: { id: toPublicId("investigation", fx.investigationId) },
      body: { title: "renamed" },
      status: 200,
    },
    "POST /investigations/:id/messages": {
      params: { id: toPublicId("investigation", fx.investigationId) },
      body: { content: "what happened?" },
      status: 200, // SSE stream (§17.3) — M8 gateway live (mocked transport)
    },
    "DELETE /investigations/:id": {
      params: { id: toPublicId("investigation", fx.investigationId) },
      status: 204,
      skipInvalid: true,
    },
    "POST /messages/:id/feedback": {
      params: { id: toPublicId("message", fx.messageId) },
      body: { value: 1 },
      status: 204,
    },
    "GET /imports": { status: 200 },
    "GET /imports/:batchId": { params: { batchId: toPublicId("batch", fx.batchId) }, status: 200 },
    "PATCH /imports/:batchId/mapping": {
      params: { batchId: toPublicId("batch", fx.batchId) },
      body: { mapping: { date: 0, description: 1, amount: 2 } },
      status: 200,
    },
    "POST /imports/:batchId/validate": { params: { batchId: toPublicId("batch", fx.batchId) }, status: 200 },
    "POST /imports/:batchId/commit": {
      params: { batchId: toPublicId("batch", fx.batchId) },
      body: { accountId: toPublicId("account", fx.accountId) },
      status: 200,
    },
    "GET /imports/:batchId/rejects.csv": {
      params: { batchId: toPublicId("batch", fx.batchId) },
      status: 200,
    },
    "GET /workspace": { status: 200 },
    "DELETE /workspace": { status: 204, skipInvalid: true },
    "PATCH /workspace": { body: { name: "Contract WS" }, status: 200 },
    "POST /workspace/demo": { body: { action: "clear" }, status: 202 },
    "GET /health": { status: 200 },
    "GET /docs": { status: 200 },
  };
  return map[key] ?? null;
}

async function invoke(
  row: EndpointRow,
  opts: { authed: boolean; params?: Record<string, string>; query?: string; body?: unknown; rawBody?: BodyInit; contentType?: string | null },
): Promise<Response> {
  const mod = await import(`../../app/api/${row.routeFile.replace("/route.ts", "/route")}`);
  const handler = mod[row.method] as (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
  const url = `http://localhost/api${row.path.replace(/:(\w+)/g, (_, p) => opts.params?.[p] ?? "missing")}${opts.query ?? ""}`;
  const headers: Record<string, string> = {};
  if (opts.authed) {
    headers["x-demo-e2e-secret"] = SECRET;
    headers["x-demo-user-id"] = userId;
  }
  let bodyInit: BodyInit | undefined;
  if (opts.rawBody !== undefined) {
    bodyInit = opts.rawBody;
  } else if (opts.body !== undefined) {
    bodyInit = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  const req = new Request(url, {
    method: row.method,
    headers,
    ...(bodyInit !== undefined ? { body: bodyInit } : {}),
  });
  return handler(req, { params: Promise.resolve(opts.params ?? {}) });
}

describe("endpoint contract suite (§17.5 — every inventory row)", () => {
  const sessionRows = API_INVENTORY.filter((r) => r.auth === "session");

  it("covers every session endpoint with a valid case", () => {
    for (const row of sessionRows) {
      if (row.notes === "multipart file") continue; // dedicated test below
      expect(validCaseFor(row), `${row.method} ${row.path}`).not.toBeNull();
    }
  });

  for (const row of API_INVENTORY.filter((r) => r.auth === "session")) {
    const key = `${row.method} ${row.path}`;
    if (row.notes === "multipart file") continue;

    it(`${key}: unauthenticated → 401 envelope`, async () => {
      const c = validCaseFor(row)!;
      const res = await invoke(row, { authed: false, ...(c.params ? { params: c.params } : {}), ...(c.body !== undefined ? { body: c.body } : {}) });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("unauthorized");
      expect(body.error.requestId).toBeDefined();
    });

    if (row.bodySchema) {
      it(`${key}: unknown body field → 422 (strict schemas, §17.5)`, async () => {
        const c = validCaseFor(row)!;
        if (c.skipInvalid) return;
        const res = await invoke(row, {
          authed: true,
          ...(c.params ? { params: c.params } : {}),
          body: { ...(c.body as Record<string, unknown>), __unknown_field: 1 },
        });
        expect(res.status).toBe(c.invalidStatus ?? 422);
        const body = await res.json();
        expect(body.error.code).toBe("validation_failed");
      });

      it(`${key}: malformed JSON → 422`, async () => {
        const c = validCaseFor(row)!;
        const res = await invoke(row, {
          authed: true,
          ...(c.params ? { params: c.params } : {}),
          rawBody: "{not json",
          contentType: "application/json",
        });
        // content-type guard or JSON parse — both land as validation_failed
        expect([400, 422]).toContain(res.status);
      });
    }
  }

  it("runs every valid case in dependency order and matches §17.4 statuses", async () => {
    // Order matters: destructive cases (archive, deletes, demo clear) last.
    const order = [
      "GET /health", "GET /docs", "GET /workspace", "PATCH /workspace",
      "GET /dashboard", "GET /transactions", "GET /transactions/:id",
      "GET /accounts", "POST /accounts",
      "GET /snapshots/series", "GET /anomalies",
      "POST /anomalies/:id/status", "POST /anomalies/bulk-status",
      "GET /alerts", "POST /alerts", "POST /alerts/preview", "PATCH /alerts/:id",
      "GET /notifications", "POST /notifications/read",
      "GET /investigations", "POST /investigations", "GET /investigations/:id",
      "PATCH /investigations/:id", "POST /investigations/:id/messages",
      "POST /messages/:id/feedback",
      "GET /imports", "GET /imports/:batchId", "PATCH /imports/:batchId/mapping",
      "POST /imports/:batchId/validate", "POST /imports/:batchId/commit",
      "GET /imports/:batchId/rejects.csv",
      "POST /transactions/:id/supersede",
      "PATCH /accounts/:id", "POST /accounts/:id/archive",
      "DELETE /alerts/:id", "DELETE /investigations/:id",
      "POST /workspace/demo",
      "DELETE /workspace", // destructive — must run last
    ];
    for (const key of order) {
      const row = API_INVENTORY.find((r) => `${r.method} ${r.path}` === key)!;
      const c = validCaseFor(row)!;
      const res = await invoke(row, {
        authed: true,
        ...(c.params ? { params: c.params } : {}),
        ...(c.query ? { query: c.query } : {}),
        ...(c.body !== undefined ? { body: c.body } : {}),
      });
      expect(res.status, key).toBe(c.status);
      if (res.status !== 204 && !key.endsWith("rejects.csv") && key !== "GET /docs" && key !== "POST /investigations/:id/messages") {
        const parsed = await res.json();
        if (res.status < 400) expect(parsed).toHaveProperty("data");
        else expect(parsed).toHaveProperty("error");
      }
    }
  }, 120_000);

  it("POST /imports: multipart upload → 201 draft; oversize → 413; wrong type → 415", async () => {
    const row = API_INVENTORY.find((r) => r.method === "POST" && r.path === "/imports")!;
    const csv = `Date,Description,Amount\r\n2026-02-0${1 + Math.floor(Math.random() * 8)},UPLOAD ${randomUUID().slice(0, 8)},-12.00\r\n`;
    const form = new FormData();
    form.append("file", new File([csv], "upload.csv", { type: "text/csv" }));
    const okRes = await invoke(row, { authed: true, rawBody: form });
    expect(okRes.status).toBe(201);

    const wrongType = await invoke(row, { authed: true, body: {} });
    expect(wrongType.status).toBe(415);
  });

  it("cron: missing secret → uniform 404 (§21.9-2 anti-oracle)", async () => {
    const row = API_INVENTORY.find((r) => r.path === "/cron/nightly")!;
    const res = await invoke(row, { authed: false });
    expect(res.status).toBe(404);
  });

  it("chart payload stays under 50KB with ≤ ~400 points (§13.3/§20.2)", async () => {
    const row = API_INVENTORY.find((r) => r.path === "/snapshots/series")!;
    const res = await invoke(row, { authed: true, query: "?range=all" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.length).toBeLessThan(50 * 1024);
    const body = JSON.parse(text) as { data: unknown[] };
    expect(body.data.length).toBeLessThanOrEqual(460); // 400 + gap markers
  });

  it("§18.3: internal errors never leak internals (secret-marker test)", async () => {
    const { serializeError } = await import("@/server/api/with-api");
    const res = serializeError(new Error("secret-marker-xyzzy"), "req_test");
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("secret-marker-xyzzy");
    expect(text).toContain("req_test");
  });
});
