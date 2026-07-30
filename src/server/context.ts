import "server-only";

import {
  roleCan,
  type Permission,
  type Role,
} from "@/server/auth/permissions";
import type { WorkspaceId } from "@/lib/schemas";

/**
 * Ctx — §07.2. Services receive a typed context (workspaceId, userId, db
 * handle, logger, clock) — injectable for tests. can() per §11.2 is called in
 * every service function's first lines; services are the enforcement point.
 */

export type CtxLogger = {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
};

export type Ctx = {
  userId: string; // Clerk user ID — exclusively from the verified session (§10.3)
  workspaceId: WorkspaceId;
  role: Role;
  db: unknown; // typed at the service boundary; narrow to Db where used
  logger: CtxLogger;
  clock: () => Date;
  /** §11.2 — optional objectId arg reserved for per-object grants (§11.4). */
  can: (permission: Permission, objectId?: string) => boolean;
};

export function buildCtx(input: {
  userId: string;
  workspaceId: WorkspaceId;
  role?: Role;
  db: unknown;
  logger?: CtxLogger;
  clock?: () => Date;
}): Ctx {
  const role = input.role ?? "owner";
  return {
    userId: input.userId,
    workspaceId: input.workspaceId,
    role,
    db: input.db,
    logger: input.logger ?? {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    clock: input.clock ?? (() => new Date()),
    can: (permission) => roleCan(role, permission),
  };
}
