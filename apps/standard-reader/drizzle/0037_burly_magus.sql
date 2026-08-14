CREATE TABLE "reading_progress" (
	"owner_did" text NOT NULL,
	"document_uri" text NOT NULL,
	"progress" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_owner_did_document_uri_pk" PRIMARY KEY("owner_did","document_uri")
);
--> statement-breakpoint
CREATE INDEX "reading_progress_owner_idx" ON "reading_progress" USING btree ("owner_did","updated_at" DESC NULLS LAST);