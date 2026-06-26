CREATE TABLE "list_saves" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"saver_did" text NOT NULL,
	"rkey" text NOT NULL,
	"list_uri" text NOT NULL,
	"list_owner_did" text,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"owner_did" text NOT NULL,
	"rkey" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"publications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "list_saves_saver_idx" ON "list_saves" USING btree ("saver_did");--> statement-breakpoint
CREATE INDEX "list_saves_list_uri_idx" ON "list_saves" USING btree ("list_uri");--> statement-breakpoint
CREATE INDEX "lists_owner_idx" ON "lists" USING btree ("owner_did","rkey");