import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-sm text-muted-foreground">This page doesn&apos;t exist.</p>
      <Link className="text-sm text-primary underline underline-offset-4" href="/">
        Back to Ledger Lens
      </Link>
    </main>
  );
}
