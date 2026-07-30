import "server-only";

/**
 * Permission vocabulary — §11.2. Static resource:action constants; the Ctx
 * carries role + can(). MVP role map: owner → all. The dormant editor/viewer
 * rows (§11.3) exist so enabling real roles later is data, not code.
 */

export const PERMISSIONS = [
  "transactions:read",
  "transactions:import",
  "accounts:manage",
  "anomalies:read",
  "anomalies:triage",
  "alerts:manage",
  "investigations:use",
  "workspace:settings",
  "workspace:delete",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role = "owner" | "editor" | "viewer";

/** §11.3 dormant role model (normative table). */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  editor: [
    "transactions:read",
    "transactions:import",
    "anomalies:read",
    "anomalies:triage",
    "alerts:manage",
    "investigations:use",
  ],
  viewer: ["transactions:read", "anomalies:read", "investigations:use"],
};

export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
