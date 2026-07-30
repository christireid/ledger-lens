import { SignIn } from "@clerk/nextjs";

import { AuthUnavailableCard } from "@/components/app/auth-unavailable-card";
import { clientEnv } from "@/lib/env.client";

// S-02 Auth — §05.3: Clerk component centered on --background, brand-tokened.
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      {clientEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <SignIn />
      ) : (
        <AuthUnavailableCard />
      )}
    </main>
  );
}
