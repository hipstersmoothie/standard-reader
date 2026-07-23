ALTER TABLE "newsletter_subscribers" ADD COLUMN "source" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "space_record_uri" text;