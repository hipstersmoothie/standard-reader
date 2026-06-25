CREATE TABLE "document_labels" (
	"src" text NOT NULL,
	"uri" text NOT NULL,
	"val" text NOT NULL,
	"cts" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_labels_src_uri_val_pk" PRIMARY KEY("src","uri","val")
);
--> statement-breakpoint
CREATE INDEX "document_labels_uri_idx" ON "document_labels" USING btree ("uri");--> statement-breakpoint
CREATE INDEX "document_labels_src_idx" ON "document_labels" USING btree ("src");