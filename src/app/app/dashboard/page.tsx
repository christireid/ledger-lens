import { DashboardClient } from "@/app/app/dashboard/dashboard-client";

// S-03 Dashboard — §05.4. Primary data hydrates client-side through the same
// query key the shell prefetches; zones all render from one snapshot (US-04).
export default function DashboardPage() {
  return <DashboardClient />;
}
