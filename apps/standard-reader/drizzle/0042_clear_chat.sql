CREATE TABLE "kosync_documents" (
	"hash" text PRIMARY KEY NOT NULL,
	"document_uri" text NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kosync_progress" (
	"owner_did" text NOT NULL,
	"document_hash" text NOT NULL,
	"progress" text NOT NULL,
	"percentage" real NOT NULL,
	"device" text,
	"device_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kosync_progress_owner_did_document_hash_pk" PRIMARY KEY("owner_did","document_hash")
);
--> statement-breakpoint
CREATE INDEX "kosync_documents_uri_idx" ON "kosync_documents" USING btree ("document_uri");--> statement-breakpoint
CREATE INDEX "kosync_progress_owner_idx" ON "kosync_progress" USING btree ("owner_did","updated_at" DESC NULLS LAST);