-- IF NOT EXISTS (not drizzle-kit's default output): this squashes three
-- migrations that already ran against long-lived preview branches, which
-- already have both columns from that earlier history — this migration's
-- own hash is new, so it must be a no-op there while still applying
-- cleanly on a genuinely fresh database (main, after merge).
ALTER TABLE "sidebar_prefs" ADD COLUMN IF NOT EXISTS "tree_order" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sidebar_prefs" ADD COLUMN IF NOT EXISTS "subscription_sort" text DEFAULT 'default' NOT NULL;