ALTER TABLE "publications" ADD COLUMN "prev_next_direction" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "serial_kind" text;--> statement-breakpoint
CREATE INDEX "publications_serial_idx" ON "publications" USING btree ("prev_next_direction") WHERE deleted = false;