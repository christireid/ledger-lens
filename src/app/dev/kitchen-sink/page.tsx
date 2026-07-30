import { notFound } from "next/navigation";

import { KitchenSinkClient } from "@/app/dev/kitchen-sink/sink-client";

// §04.13 / §05.11: dev-only component gallery; excluded from production.
export default function KitchenSinkPage() {
  if (process.env.NODE_ENV === "production" && !process.env.DEMO_E2E_SECRET) {
    notFound();
  }
  return <KitchenSinkClient />;
}
