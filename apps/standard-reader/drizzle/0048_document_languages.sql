-- Language tagging: a detected language per document, and the reader preference
-- that filters network-wide surfaces down to a chosen set of them.
--
-- `site.standard.document` has no language field, so the language is detected
-- from indexed text by `src/server/lang/detect.ts` (GlotLID, with a Jev
-- tiebreak for the documents it isn't sure of) and is ours, not the author's.
--
-- Its own table rather than columns on `documents`: the columns would need
-- indexes, and changing an indexed column defeats HOT updates — every tag
-- would rewrite the whole documents row, recompute its stored search_vector,
-- and touch all seventeen of its indexes. A first backfill done that way ran at
-- ~20 documents/s against prod. Every statement here is instant: the table is
-- new and empty, and `feed_languages` is nullable with no default.
CREATE TABLE "document_languages" (
	"document_uri" text PRIMARY KEY NOT NULL,
	"lang" text,
	"confidence" double precision,
	"source" text,
	"detected_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "feed_languages" text;--> statement-breakpoint
ALTER TABLE "document_languages" ADD CONSTRAINT "document_languages_document_uri_documents_uri_fk" FOREIGN KEY ("document_uri") REFERENCES "public"."documents"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_languages_pending_idx" ON "document_languages" USING btree ("document_uri") WHERE source = 'pending';--> statement-breakpoint
CREATE INDEX "document_languages_tiebreak_idx" ON "document_languages" USING btree ("document_uri") WHERE source = 'glotlid-unsure';