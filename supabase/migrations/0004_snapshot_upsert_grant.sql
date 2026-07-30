-- portfolio_snapshots upsert (§07.6: unique (workspace_id, as_of) upsert key)
-- requires UPDATE for the ON CONFLICT DO UPDATE path; omitted from 0001's
-- mutable-table grant list where snapshots were treated as write-once.
GRANT UPDATE ON portfolio_snapshots TO app_user;
