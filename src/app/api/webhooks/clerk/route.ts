import { Webhook } from "svix";

import { adminDb } from "@/server/db/rls";
import { env } from "@/server/env";
import { deleteWorkspaceForUser } from "@/server/services/workspace";

/**
 * Clerk webhook — §10.2. Svix signature verification is mandatory (§21).
 * user.created is advisory (bootstrap is lazy, §10.4); user.deleted triggers
 * the workspace cascade delete (§09.8) — the one flow that must not be lazy.
 * Replays are idempotent (§10.7-3).
 */

type ClerkEvent = {
  type: string;
  data: { id?: string };
};

export async function POST(req: Request): Promise<Response> {
  if (!env.CLERK_WEBHOOK_SECRET) {
    return Response.json(
      {
        error: {
          code: "internal_error",
          message: "Webhook not configured.",
          requestId: "webhook",
        },
      },
      { status: 500 },
    );
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ClerkEvent;
  try {
    const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
    event = wh.verify(payload, headers) as ClerkEvent;
  } catch {
    return Response.json(
      {
        error: {
          code: "unauthorized",
          message: "Invalid webhook signature.",
          requestId: "webhook",
        },
      },
      { status: 401 },
    );
  }

  switch (event.type) {
    case "user.deleted": {
      const clerkUserId = event.data.id;
      if (clerkUserId) {
        // Admin handle: the Clerk user no longer exists, so no RLS identity
        // can own this delete; cascade covers all workspace-scoped rows.
        await deleteWorkspaceForUser(adminDb(), clerkUserId);
      }
      return Response.json({ received: true });
    }
    case "user.created":
    default:
      // Advisory — lazy bootstrap owns workspace creation (§10.4).
      return Response.json({ received: true });
  }
}
