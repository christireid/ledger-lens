-- §17.2: POST /anomalies/:id/status carries an optional note — a triage
-- audit field (US-05) that must be persisted, not silently dropped.
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS triage_note text;
GRANT UPDATE (status, triage_note, updated_at) ON anomalies TO app_user;
