import Link from "next/link";

// S-01 Marketing / Landing — §05.2: 30-second pitch, SSG, fully responsive.
export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 pb-16 pt-24 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Ledger Lens</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Turn a pile of financial exports into an explainable picture of your money
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Import broker and bank CSVs. Ledger Lens reconstructs positions, cost basis, and P&L,
          flags anomalies, and answers questions with citations to the exact rows it used.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/sign-up?demo=1"
            className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try the demo
          </Link>
          <Link
            href="/sign-in"
            className="rounded-md border px-6 py-2.5 text-sm font-medium hover:bg-muted"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Three feature cards — Import, Detect, Investigate */}
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-16 sm:grid-cols-3">
        {[
          {
            title: "Import",
            body: "Drop any CSV export. Smart column mapping, per-row validation with downloadable reject reasons, and duplicate protection at three layers.",
          },
          {
            title: "Detect",
            body: "Six deterministic detectors watch for duplicate charges, fee spikes, allocation drift, and data-integrity gaps — every finding cites its evidence rows.",
          },
          {
            title: "Investigate",
            body: "Ask questions in plain language. The AI investigator answers with citation chips that open the underlying transactions — no uncited claims.",
          },
        ].map((feature) => (
          <div key={feature.title} className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold">{feature.title}</h2>
            <p className="text-sm text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </section>

      {/* Tech-stack strip (hiring signal) */}
      <section className="border-y bg-muted/40 py-8">
        <div className="mx-auto max-w-5xl px-6">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Built with
          </p>
          <p className="text-center text-sm text-muted-foreground">
            Next.js App Router · TypeScript strict · PostgreSQL + Drizzle (RLS) · Clerk ·
            TanStack Query · Tailwind · Zod end-to-end · OpenAI tool-calling · Playwright + Vitest
          </p>
        </div>
      </section>

      <footer className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8 text-sm text-muted-foreground">
        <span>Ledger Lens — portfolio project</span>
        <a
          className="underline underline-offset-4 hover:text-foreground"
          href="https://github.com/christireid/ledger-lens"
          rel="noreferrer"
        >
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}
