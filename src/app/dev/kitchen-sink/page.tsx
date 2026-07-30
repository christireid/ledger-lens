import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { KitchenSinkClient } from "@/app/dev/kitchen-sink/sink-client";

// §04.13 / §05.11: dev-only component gallery; excluded from production.
export default async function KitchenSinkPage() {
  if (process.env.NODE_ENV === "production" && !process.env.DEMO_E2E_SECRET) {
    notFound();
  }
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <KitchenSinkClient nonce={nonce} />;
}
