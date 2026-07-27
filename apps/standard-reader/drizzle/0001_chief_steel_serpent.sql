ALTER TABLE "user" ADD COLUMN "weekly_digest_enabled" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "weekly_digest_last_sent_at" timestamp with time zone;