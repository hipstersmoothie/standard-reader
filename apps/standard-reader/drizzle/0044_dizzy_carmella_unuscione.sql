CREATE TABLE "sites" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"owner_did" text NOT NULL,
	"rkey" text NOT NULL,
	"publication_uri" text,
	"style" text DEFAULT 'broadsheet' NOT NULL,
	"tagline" text,
	"theme_background" text,
	"theme_foreground" text,
	"theme_accent" text,
	"theme_accent_foreground" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"show_standard_reader_link" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sites_owner_idx" ON "sites" USING btree ("owner_did","publication_uri");--> statement-breakpoint
CREATE INDEX "sites_publication_idx" ON "sites" USING btree ("publication_uri");