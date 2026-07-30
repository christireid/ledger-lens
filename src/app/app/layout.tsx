import { headers } from "next/headers";

import { AppShell } from "@/components/app/app-shell";
import { Providers } from "@/components/app/providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // §21.4 — the next-themes inline script receives the per-request nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <Providers nonce={nonce}>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
