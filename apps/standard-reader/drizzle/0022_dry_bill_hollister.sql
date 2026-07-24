CREATE TABLE "newsletter_publications" (
	"publication_uri" text PRIMARY KEY NOT NULL,
	"owner_did" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "newsletter_publications_owner_idx" ON "newsletter_publications" USING btree ("owner_did","connected_at" DESC NULLS LAST);