import { Webhook } from "svix";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Webhook signature tests — §10.8: failing-signature test mandatory.
 * The secret is a test-only value; verification is real Svix HMAC.
 */

const TEST_SECRET = "whsec_dGVzdC1zZWNyZXQtZm9yLXVuaXQtdGVzdHM=";

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  vi.stubEnv("CLERK_WEBHOOK_SECRET", TEST_SECRET);
  ({ POST } = await import("./route"));
});

function signedRequest(payload: string): Request {
  const wh = new Webhook(TEST_SECRET);
  const id = "msg_test_1";
  const timestamp = new Date();
  const signature = wh.sign(id, timestamp, payload);
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body: payload,
    headers: {
      "svix-id": id,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
    },
  });
}

describe("Clerk webhook (§10.2)", () => {
  it("rejects a missing signature with 401", async () => {
    const res = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: JSON.stringify({ type: "user.created", data: { id: "user_x" } }),
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
  });

  it("rejects a tampered payload with 401", async () => {
    const req = signedRequest(
      JSON.stringify({ type: "user.created", data: { id: "user_x" } }),
    );
    const tampered = new Request(req.url, {
      method: "POST",
      body: JSON.stringify({ type: "user.deleted", data: { id: "victim" } }),
      headers: req.headers,
    });
    const res = await POST(tampered);
    expect(res.status).toBe(401);
  });

  it("accepts a validly signed advisory event (user.created → no-op)", async () => {
    const res = await POST(
      signedRequest(
        JSON.stringify({ type: "user.created", data: { id: "user_x" } }),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });
});
