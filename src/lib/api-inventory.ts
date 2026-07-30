import type { ZodTypeAny } from "zod";

import {
  AccountInputSchema,
  AccountPatchSchema,
  AccountsQuerySchema,
  AlertRuleInputSchema,
  AlertRulePatchSchema,
  AnomaliesQuerySchema,
  AnomalyBulkStatusSchema,
  AnomalyStatusBodySchema,
  CursorQuerySchema,
  DashboardQuerySchema,
  DemoActionSchema,
  FeedbackBodySchema,
  ImportCommitBodySchema,
  ImportMappingBodySchema,
  InvestigationPatchSchema,
  MessageBodySchema,
  NotificationsReadSchema,
  SeriesQuerySchema,
  SupersedeBodySchema,
  TransactionsQuerySchema,
  WorkspacePatchSchema,
} from "@/lib/schemas/api";

/**
 * Endpoint inventory — §17.2, encoded so the route-walk parity test and the
 * OpenAPI generator both consume it: the table's completeness is executable
 * (§17.5). routeFile is relative to src/app/api/.
 */

export type EndpointRow = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string; // wire path, e.g. /transactions/:id
  routeFile: string; // e.g. transactions/[id]/route.ts
  auth: "session" | "signature" | "cron-secret" | "public";
  bodySchema?: ZodTypeAny;
  querySchema?: ZodTypeAny;
  idempotencyKey?: boolean;
  notes?: string;
};

export const API_INVENTORY: EndpointRow[] = [
  { method: "GET", path: "/dashboard", routeFile: "dashboard/route.ts", auth: "session", querySchema: DashboardQuerySchema },
  { method: "GET", path: "/transactions", routeFile: "transactions/route.ts", auth: "session", querySchema: TransactionsQuerySchema },
  { method: "GET", path: "/transactions/:id", routeFile: "transactions/[id]/route.ts", auth: "session" },
  { method: "POST", path: "/transactions/:id/supersede", routeFile: "transactions/[id]/supersede/route.ts", auth: "session", bodySchema: SupersedeBodySchema, idempotencyKey: true },
  { method: "GET", path: "/accounts", routeFile: "accounts/route.ts", auth: "session", querySchema: AccountsQuerySchema },
  { method: "POST", path: "/accounts", routeFile: "accounts/route.ts", auth: "session", bodySchema: AccountInputSchema },
  { method: "PATCH", path: "/accounts/:id", routeFile: "accounts/[id]/route.ts", auth: "session", bodySchema: AccountPatchSchema },
  { method: "POST", path: "/accounts/:id/archive", routeFile: "accounts/[id]/archive/route.ts", auth: "session" },
  { method: "GET", path: "/snapshots/series", routeFile: "snapshots/series/route.ts", auth: "session", querySchema: SeriesQuerySchema },
  { method: "GET", path: "/anomalies", routeFile: "anomalies/route.ts", auth: "session", querySchema: AnomaliesQuerySchema },
  { method: "POST", path: "/anomalies/:id/status", routeFile: "anomalies/[id]/status/route.ts", auth: "session", bodySchema: AnomalyStatusBodySchema },
  { method: "POST", path: "/anomalies/bulk-status", routeFile: "anomalies/bulk-status/route.ts", auth: "session", bodySchema: AnomalyBulkStatusSchema },
  { method: "GET", path: "/alerts", routeFile: "alerts/route.ts", auth: "session" },
  { method: "POST", path: "/alerts", routeFile: "alerts/route.ts", auth: "session", bodySchema: AlertRuleInputSchema },
  { method: "PATCH", path: "/alerts/:id", routeFile: "alerts/[id]/route.ts", auth: "session", bodySchema: AlertRulePatchSchema },
  { method: "DELETE", path: "/alerts/:id", routeFile: "alerts/[id]/route.ts", auth: "session" },
  { method: "POST", path: "/alerts/preview", routeFile: "alerts/preview/route.ts", auth: "session", bodySchema: AlertRuleInputSchema },
  { method: "GET", path: "/notifications", routeFile: "notifications/route.ts", auth: "session", querySchema: CursorQuerySchema },
  { method: "POST", path: "/notifications/read", routeFile: "notifications/read/route.ts", auth: "session", bodySchema: NotificationsReadSchema },
  { method: "GET", path: "/investigations", routeFile: "investigations/route.ts", auth: "session" },
  { method: "POST", path: "/investigations", routeFile: "investigations/route.ts", auth: "session" },
  { method: "GET", path: "/investigations/:id", routeFile: "investigations/[id]/route.ts", auth: "session" },
  { method: "PATCH", path: "/investigations/:id", routeFile: "investigations/[id]/route.ts", auth: "session", bodySchema: InvestigationPatchSchema },
  { method: "DELETE", path: "/investigations/:id", routeFile: "investigations/[id]/route.ts", auth: "session" },
  { method: "POST", path: "/investigations/:id/messages", routeFile: "investigations/[id]/messages/route.ts", auth: "session", bodySchema: MessageBodySchema, notes: "SSE stream (§17.3); rate-limited" },
  { method: "POST", path: "/messages/:id/feedback", routeFile: "messages/[id]/feedback/route.ts", auth: "session", bodySchema: FeedbackBodySchema },
  { method: "POST", path: "/imports", routeFile: "imports/route.ts", auth: "session", notes: "multipart file" },
  { method: "GET", path: "/imports", routeFile: "imports/route.ts", auth: "session", querySchema: CursorQuerySchema },
  { method: "GET", path: "/imports/:batchId", routeFile: "imports/[batchId]/route.ts", auth: "session" },
  { method: "PATCH", path: "/imports/:batchId/mapping", routeFile: "imports/[batchId]/mapping/route.ts", auth: "session", bodySchema: ImportMappingBodySchema },
  { method: "POST", path: "/imports/:batchId/validate", routeFile: "imports/[batchId]/validate/route.ts", auth: "session" },
  { method: "POST", path: "/imports/:batchId/commit", routeFile: "imports/[batchId]/commit/route.ts", auth: "session", bodySchema: ImportCommitBodySchema, idempotencyKey: true },
  { method: "GET", path: "/imports/:batchId/rejects.csv", routeFile: "imports/[batchId]/rejects.csv/route.ts", auth: "session", notes: "text/csv" },
  { method: "GET", path: "/workspace", routeFile: "workspace/route.ts", auth: "session" },
  { method: "PATCH", path: "/workspace", routeFile: "workspace/route.ts", auth: "session", bodySchema: WorkspacePatchSchema },
  { method: "DELETE", path: "/workspace", routeFile: "workspace/route.ts", auth: "session" },
  { method: "POST", path: "/workspace/demo", routeFile: "workspace/demo/route.ts", auth: "session", bodySchema: DemoActionSchema },
  { method: "POST", path: "/webhooks/clerk", routeFile: "webhooks/clerk/route.ts", auth: "signature" },
  { method: "GET", path: "/cron/nightly", routeFile: "cron/nightly/route.ts", auth: "cron-secret" },
  { method: "GET", path: "/health", routeFile: "health/route.ts", auth: "public" },
  { method: "GET", path: "/docs", routeFile: "docs/route.ts", auth: "public" },
  // §24.4 digest beacon — accepts only a digest string; no session, no data.
  { method: "POST", path: "/client-error", routeFile: "client-error/route.ts", auth: "public" },
];
