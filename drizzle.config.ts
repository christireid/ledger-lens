import { defineConfig } from "drizzle-kit";

// Migrations land in supabase/migrations (§23.2), reviewed as SQL in PRs,
// forward-only in prod (§09.7). DIRECT_URL (session mode) applies them (§23.4).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./supabase/migrations",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
