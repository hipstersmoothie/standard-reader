ALTER TABLE "tracked_repos" ADD COLUMN "last_seen_seq" bigint;--> statement-breakpoint
ALTER TABLE "tracked_repos" DROP COLUMN "last_seen_rev";