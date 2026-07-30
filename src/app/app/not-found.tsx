import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">That page doesn&apos;t exist in this workspace.</p>
      <Button asChild>
        <Link href="/app/dashboard">Go to Dashboard</Link>
      </Button>
    </div>
  );
}
