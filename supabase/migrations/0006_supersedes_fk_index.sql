-- §09.5 index discipline: the transactions.supersedes_id self-FK had no
-- covering index, so every transaction delete seq-scanned the table for
-- referencing rows — workspace deletion and demo clear were O(n^2) at size.
CREATE INDEX IF NOT EXISTS transactions_supersedes_idx
  ON transactions (supersedes_id)
  WHERE supersedes_id IS NOT NULL;
