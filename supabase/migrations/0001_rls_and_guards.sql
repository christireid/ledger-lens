-- Custom migration: extensions, guards, triggers, RLS, roles & grants.
-- Normative sources: §09.2 (conventions), §09.3 (immutability by privilege),
-- §09.5 (text search index), §09.6 (RLS), §21 (least privilege).

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gin;--> statement-breakpoint

-- unaccent() is STABLE, not IMMUTABLE — wrap for index use (§09.5).
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;--> statement-breakpoint

-- §09.5: accent-insensitive text search over descriptions.
CREATE INDEX IF NOT EXISTS transactions_workspace_description_search_idx
  ON transactions USING gin (workspace_id, to_tsvector('simple', immutable_unaccent(description)));--> statement-breakpoint

-- ── Self-referential supersedes FK (§02.4-3) ─────────────────────────────────
ALTER TABLE transactions
  ADD CONSTRAINT transactions_supersedes_id_fk
  FOREIGN KEY (supersedes_id) REFERENCES transactions(id);--> statement-breakpoint

-- ── updated_at trigger (§09.2: trigger-maintained on mutable tables) ─────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER workspaces_set_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER import_batches_set_updated_at BEFORE UPDATE ON import_batches FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER anomalies_set_updated_at BEFORE UPDATE ON anomalies FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER alert_rules_set_updated_at BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER investigations_set_updated_at BEFORE UPDATE ON investigations FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint

-- ── Expression uniques not expressible in drizzle schema ─────────────────────
-- S-08 duplicate-rule block: unique (workspace_id, type, md5(params::text)).
-- (§09.3 says "hash index"; hash indexes cannot be UNIQUE — btree over md5()
-- delivers the same guarantee. DECISIONS.md 2026-07-30.)
CREATE UNIQUE INDEX IF NOT EXISTS alert_rules_workspace_type_params_uq
  ON alert_rules (workspace_id, type, md5(params::text));--> statement-breakpoint

-- ── auth.jwt() compatibility stub (§09.6) ────────────────────────────────────
-- Supabase defines auth.jwt(); on plain Postgres (local docker / CI) we create
-- an equivalent reading the same request.jwt.claims GUC. Guarded so it never
-- replaces Supabase's own function.
CREATE SCHEMA IF NOT EXISTS auth;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'auth' AND p.proname = 'jwt'
  ) THEN
    CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS 'SELECT coalesce(nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb, ''{}''::jsonb)';
  END IF;
END
$$;--> statement-breakpoint

-- ── app_user role (§09.6, §21): subject to RLS; migrations run as admin ──────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public, auth TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT ON
  workspaces, accounts, instruments, import_batches, transactions,
  portfolio_snapshots, anomalies, alert_rules, notifications,
  investigations, messages, message_citations, ai_eval_log
TO app_user;--> statement-breakpoint
-- Mutable tables get UPDATE; ledger immutability is privilege-enforced:
-- transactions allow UPDATE on the superseded column ONLY (§09.3).
GRANT UPDATE ON
  workspaces, accounts, import_batches, anomalies, alert_rules,
  notifications, investigations, messages
TO app_user;--> statement-breakpoint
GRANT UPDATE (superseded) ON transactions TO app_user;--> statement-breakpoint
-- Workspace hard delete cascades (§09.8); app_user may delete workspace-scoped rows.
GRANT DELETE ON
  workspaces, accounts, import_batches, transactions, portfolio_snapshots,
  anomalies, alert_rules, notifications, investigations, messages,
  message_citations, ai_eval_log
TO app_user;--> statement-breakpoint

-- ── Row-Level Security (§09.6) ───────────────────────────────────────────────
-- Service layer is the primary guard (ctx.workspaceId); RLS turns a service bug
-- into a zero-row result instead of a data leak.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY workspaces_owner ON workspaces
  USING (clerk_user_id = auth.jwt()->>'sub')
  WITH CHECK (clerk_user_id = auth.jwt()->>'sub');--> statement-breakpoint
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY accounts_workspace ON accounts
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY import_batches_workspace ON import_batches
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY transactions_workspace ON transactions
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY portfolio_snapshots_workspace ON portfolio_snapshots
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY anomalies_workspace ON anomalies
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY alert_rules_workspace ON alert_rules
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY notifications_workspace ON notifications
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY investigations_workspace ON investigations
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY messages_workspace ON messages
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
ALTER TABLE message_citations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY message_citations_workspace ON message_citations
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
ALTER TABLE ai_eval_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ai_eval_log_workspace ON ai_eval_log
  USING (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE clerk_user_id = auth.jwt()->>'sub'));--> statement-breakpoint
-- instruments: global table (not workspace-scoped, §09.3) — RLS enabled with
-- read-for-all + insert-for-all (symbols are universal; no tenant data).
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY instruments_read_all ON instruments FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY instruments_insert_all ON instruments FOR INSERT WITH CHECK (true);--> statement-breakpoint

-- ── Statement timeout at role level (§09.5) ──────────────────────────────────
ALTER ROLE app_user SET statement_timeout = '5s';
