CREATE TABLE "writer_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"path" text,
	"body_markdown" text DEFAULT '' NOT NULL,
	"tags" text[],
	"destination_uri" text,
	"cover_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "writer_drafts_user_id_idx" ON "writer_drafts" USING btree ("user_id");