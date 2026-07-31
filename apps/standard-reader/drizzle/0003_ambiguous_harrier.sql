CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- The three trigram indexes below were created CONCURRENTLY on prod out-of-band
-- (a plain CREATE INDEX takes a long lock on `documents`); IF NOT EXISTS makes
-- these no-ops there while still building them on fresh/local/test databases.
CREATE INDEX IF NOT EXISTS "profiles_handle_trgm_idx" ON "profiles" USING gin ("handle" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profiles_display_name_trgm_idx" ON "profiles" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_canonical_url_trgm_idx" ON "documents" USING gin ("canonical_url" gin_trgm_ops);
