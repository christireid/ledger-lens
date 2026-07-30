import { Suspense } from "react";

import { ThreadClient } from "@/app/app/investigations/[id]/thread-client";

// S-07 Investigation thread — §05.7 / §03.6.3.
export default async function InvestigationThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <ThreadClient investigationId={id} />
    </Suspense>
  );
}
