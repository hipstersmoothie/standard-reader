DROP INDEX "verification_identifier_idx";--> statement-breakpoint
--> Dedupe before the UNIQUE index: the prior delete-then-insert store writes
--> could leave duplicate rows for one identifier. Keep the newest per identifier
--> (highest ctid); drop the rest so CREATE UNIQUE INDEX can't fail.
DELETE FROM "verification" a USING "verification" b
  WHERE a."identifier" = b."identifier" AND a."ctid" < b."ctid";--> statement-breakpoint
CREATE UNIQUE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");