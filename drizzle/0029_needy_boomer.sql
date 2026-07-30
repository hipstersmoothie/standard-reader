ALTER TABLE "profiles" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "labeler_services" DROP COLUMN "source";