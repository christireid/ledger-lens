CREATE TYPE "public"."account_type" AS ENUM('brokerage', 'bank', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('large_transaction', 'fee_spike', 'allocation_drift', 'account_inactivity');--> statement-breakpoint
CREATE TYPE "public"."anomaly_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."anomaly_status" AS ENUM('open', 'acknowledged', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('draft', 'mapped', 'validated', 'committed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."instrument_kind" AS ENUM('equity', 'etf', 'cash');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('buy', 'sell', 'dividend', 'interest', 'deposit', 'withdrawal', 'fee', 'transfer_in', 'transfer_out', 'other');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"institution" text,
	"currency" char(3) NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_eval_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"message_id" uuid,
	"prompt_version" text,
	"model" text,
	"tool_calls" jsonb,
	"latency_ms" integer,
	"usage" jsonb,
	"feedback" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" "alert_type" NOT NULL,
	"name" text NOT NULL,
	"params" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"severity" "anomaly_severity" NOT NULL,
	"status" "anomaly_status" DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"explanation" text,
	"evidence_tx_ids" uuid[] NOT NULL,
	"evidence_hash" text NOT NULL,
	"detected_batch_id" uuid,
	"status_changed_by" text,
	"status_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_name" text,
	"content_hash" text NOT NULL,
	"status" "batch_status" DEFAULT 'draft' NOT NULL,
	"mapping" jsonb,
	"stats" jsonb,
	"idempotency_key" uuid,
	"rejected_rows" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"kind" "instrument_kind" DEFAULT 'equity' NOT NULL,
	"currency" char(3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"kind" text NOT NULL,
	"ref_ids" uuid[] NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"investigation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"stopped" boolean DEFAULT false NOT NULL,
	"prompt_version" text,
	"model" text,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_assistant_fields_required" CHECK ("messages"."role" <> 'assistant' or ("messages"."prompt_version" is not null and "messages"."model" is not null and "messages"."usage" is not null))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"alert_rule_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"evidence" jsonb,
	"dedup_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"computed_at" timestamp with time zone,
	"total_value" numeric(18, 4),
	"cash_value" numeric(18, 4),
	"schema_version" integer DEFAULT 1 NOT NULL,
	"positions" jsonb NOT NULL,
	"per_account" jsonb,
	"per_currency" jsonb,
	"input_max_tx_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"source_line" integer,
	"date" date NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"instrument_id" uuid,
	"quantity" numeric(20, 8),
	"price" numeric(18, 4),
	"description" text DEFAULT '' NOT NULL,
	"supersedes_id" uuid,
	"superseded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_trade_fields_all_or_none" CHECK ("transactions"."type" not in ('buy','sell') or ("transactions"."instrument_id" is not null and "transactions"."quantity" is not null and "transactions"."price" is not null)),
	CONSTRAINT "transactions_quantity_nonzero" CHECK ("transactions"."quantity" is null or "transactions"."quantity" <> 0),
	CONSTRAINT "transactions_amount_nonzero" CHECK ("transactions"."amount" <> 0 or "transactions"."type" = 'other'),
	CONSTRAINT "transactions_no_self_supersede" CHECK ("transactions"."supersedes_id" <> "transactions"."id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"base_currency" char(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_eval_log" ADD CONSTRAINT "ai_eval_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_eval_log" ADD CONSTRAINT "ai_eval_log_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_detected_batch_id_import_batches_id_fk" FOREIGN KEY ("detected_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_workspace_lower_name_uq" ON "accounts" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "accounts_workspace_active_idx" ON "accounts" USING btree ("workspace_id") WHERE "accounts"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "anomalies_workspace_type_evidence_uq" ON "anomalies" USING btree ("workspace_id","type","evidence_hash");--> statement-breakpoint
CREATE INDEX "anomalies_workspace_status_severity_idx" ON "anomalies" USING btree ("workspace_id","status","severity" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_workspace_hash_committed_uq" ON "import_batches" USING btree ("workspace_id","content_hash") WHERE "import_batches"."status" = 'committed';--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_symbol_kind_uq" ON "instruments" USING btree ("symbol","kind");--> statement-breakpoint
CREATE INDEX "messages_investigation_created_idx" ON "messages" USING btree ("investigation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_workspace_dedup_uq" ON "notifications" USING btree ("workspace_id","dedup_key");--> statement-breakpoint
CREATE INDEX "notifications_workspace_unread_idx" ON "notifications" USING btree ("workspace_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_snapshots_workspace_as_of_uq" ON "portfolio_snapshots" USING btree ("workspace_id","as_of");--> statement-breakpoint
CREATE INDEX "portfolio_snapshots_workspace_as_of_desc_idx" ON "portfolio_snapshots" USING btree ("workspace_id","as_of" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_workspace_date_id_idx" ON "transactions" USING btree ("workspace_id","date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_workspace_account_date_idx" ON "transactions" USING btree ("workspace_id","account_id","date") WHERE not "transactions"."superseded";--> statement-breakpoint
CREATE INDEX "transactions_workspace_instrument_date_idx" ON "transactions" USING btree ("workspace_id","instrument_id","date") WHERE not "transactions"."superseded";--> statement-breakpoint
CREATE INDEX "transactions_workspace_type_date_idx" ON "transactions" USING btree ("workspace_id","type","date");--> statement-breakpoint
CREATE INDEX "transactions_import_batch_idx" ON "transactions" USING btree ("import_batch_id");