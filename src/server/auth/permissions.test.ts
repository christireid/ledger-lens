import { describe, expect, it } from "vitest";

import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  roleCan,
} from "@/server/auth/permissions";

/**
 * Role-matrix tests — §11.4: run against the dormant map so enabling
 * editor/viewer later starts from passing tests.
 */
describe("role matrix (§11.3 normative table)", () => {
  it("owner → all permissions", () => {
    for (const p of PERMISSIONS) {
      expect(roleCan("owner", p), p).toBe(true);
    }
  });

  it("editor → import/triage/alerts/read/investigations, no accounts/settings/delete", () => {
    expect(roleCan("editor", "transactions:read")).toBe(true);
    expect(roleCan("editor", "transactions:import")).toBe(true);
    expect(roleCan("editor", "anomalies:read")).toBe(true);
    expect(roleCan("editor", "anomalies:triage")).toBe(true);
    expect(roleCan("editor", "alerts:manage")).toBe(true);
    expect(roleCan("editor", "investigations:use")).toBe(true);
    expect(roleCan("editor", "accounts:manage")).toBe(false);
    expect(roleCan("editor", "workspace:settings")).toBe(false);
    expect(roleCan("editor", "workspace:delete")).toBe(false);
  });

  it("viewer → reads + investigations only", () => {
    expect(roleCan("viewer", "transactions:read")).toBe(true);
    expect(roleCan("viewer", "anomalies:read")).toBe(true);
    expect(roleCan("viewer", "investigations:use")).toBe(true);
    expect(roleCan("viewer", "transactions:import")).toBe(false);
    expect(roleCan("viewer", "anomalies:triage")).toBe(false);
    expect(roleCan("viewer", "alerts:manage")).toBe(false);
    expect(roleCan("viewer", "accounts:manage")).toBe(false);
    expect(roleCan("viewer", "workspace:settings")).toBe(false);
    expect(roleCan("viewer", "workspace:delete")).toBe(false);
  });

  it("every role's permission list is a subset of the closed vocabulary", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        expect(PERMISSIONS).toContain(p);
      }
    }
  });
});
