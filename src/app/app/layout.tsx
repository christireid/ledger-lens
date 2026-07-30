import { AppShell } from "@/components/app/app-shell";
import { Providers } from "@/components/app/providers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
