import { Suspense } from "react";

import { LedgerClient } from "@/app/app/ledger/ledger-client";

// S-04 Ledger — §05.5: the raw evidence table.
export default function LedgerPage() {
  return (
    <Suspense>
      <LedgerClient />
    </Suspense>
  );
}
