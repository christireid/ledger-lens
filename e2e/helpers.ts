import { randomUUID } from "node:crypto";

import type { BrowserContext, Page } from "@playwright/test";

export const E2E_SECRET = "e2e-secret";

/** Establish a §20.8 test session for a fresh user (lazy bootstrap creates the workspace). */
export async function signInAs(context: BrowserContext, userId: string): Promise<void> {
  await context.addCookies([
    {
      name: "demo_e2e_session",
      value: encodeURIComponent(`${E2E_SECRET}:${userId}`),
      url: "http://localhost:3100",
    },
  ]);
}

export function freshUser(prefix: string): string {
  return `e2e_${prefix}_${randomUUID().slice(0, 8)}`;
}

/** Create an account via the API from the browser context (same cookie auth). */
export async function apiPost(page: Page, path: string, body?: unknown): Promise<unknown> {
  return page.evaluate(
    async ({ path, body }) => {
      const res = await fetch(`/api${path}`, {
        method: "POST",
        headers: body !== undefined ? { "Content-Type": "application/json" } : {},
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return res.json();
    },
    { path, body },
  );
}

export const SAMPLE_CSV = [
  "Date,Description,Amount,Type,Symbol,Quantity,Price",
  "2026-01-05,ACME PAYROLL,2500.00,deposit,,,",
  "2026-01-06,GROCERY MART,-82.13,debit,,,",
  "2026-01-07,YOU BOUGHT AAPL,-1850.50,bought,AAPL,10,185.05",
  "2026-02-01,BIG WIRE OUT,-9000.00,debit,,,",
  "not-a-date,BAD ROW,-10.00,debit,,,",
].join("\r\n");
