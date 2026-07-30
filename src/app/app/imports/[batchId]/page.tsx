import { Suspense } from "react";

import { BatchDetailClient } from "@/app/app/imports/[batchId]/batch-detail-client";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  return (
    <Suspense>
      <BatchDetailClient batchId={batchId} />
    </Suspense>
  );
}
