CREATE TABLE "bookmarks" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"owner_did" text NOT NULL,
	"rkey" text NOT NULL,
	"document_uri" text NOT NULL,
	"document_did" text,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reads" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"owner_did" text NOT NULL,
	"rkey" text NOT NULL,
	"document_uri" text NOT NULL,
	"document_did" text,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bookmarks_owner_idx" ON "bookmarks" USING btree ("owner_did","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bookmarks_document_idx" ON "bookmarks" USING btree ("document_uri");--> statement-breakpoint
CREATE INDEX "bookmarks_edge_idx" ON "bookmarks" USING btree ("owner_did","document_uri");--> statement-breakpoint
CREATE INDEX "reads_owner_idx" ON "reads" USING btree ("owner_did","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reads_document_idx" ON "reads" USING btree ("document_uri");--> statement-breakpoint
CREATE INDEX "reads_edge_idx" ON "reads" USING btree ("owner_did","document_uri");