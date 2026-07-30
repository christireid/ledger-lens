import { SignUp } from "@clerk/nextjs";

import { AuthUnavailableCard } from "@/components/app/auth-unavailable-card";
import { clientEnv } from "@/lib/env.client";

// S-02 Auth — §05.3. Demo-flag propagation handled via the sign-up redirect
// params (S-01 → S-02 → bootstrap, §10.4).
export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      {clientEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <SignUp />
      ) : (
        <AuthUnavailableCard />
      )}
    </main>
  );
}
