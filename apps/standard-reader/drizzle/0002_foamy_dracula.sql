-- Already created CONCURRENTLY on prod out-of-band; IF NOT EXISTS makes this a
-- no-op there while still building the index on fresh/local databases.
CREATE INDEX IF NOT EXISTS "documents_canonical_url_idx" ON "documents" USING btree ("canonical_url") WHERE deleted = false;