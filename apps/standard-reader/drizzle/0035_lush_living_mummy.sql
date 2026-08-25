CREATE TABLE "block_list_items" (
	"uri" text PRIMARY KEY NOT NULL,
	"list_uri" text NOT NULL,
	"subject_did" text NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_list_sync_state" (
	"list_uri" text PRIMARY KEY NOT NULL,
	"owner_did" text NOT NULL,
	"name" text,
	"description" text,
	"purpose" text,
	"item_count" integer DEFAULT 0 NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_lists" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"blocker_did" text NOT NULL,
	"rkey" text NOT NULL,
	"list_uri" text NOT NULL,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_sync_state" (
	"did" text PRIMARY KEY NOT NULL,
	"outgoing_count" integer DEFAULT 0 NOT NULL,
	"incoming_count" integer DEFAULT 0 NOT NULL,
	"list_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"blocker_did" text NOT NULL,
	"rkey" text NOT NULL,
	"subject_did" text NOT NULL,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "blocking_enabled" boolean;--> statement-breakpoint
CREATE INDEX "block_list_items_list_idx" ON "block_list_items" USING btree ("list_uri");--> statement-breakpoint
CREATE INDEX "block_list_items_subject_idx" ON "block_list_items" USING btree ("subject_did");--> statement-breakpoint
CREATE INDEX "block_list_items_list_subject_idx" ON "block_list_items" USING btree ("list_uri","subject_did");--> statement-breakpoint
CREATE INDEX "block_lists_blocker_idx" ON "block_lists" USING btree ("blocker_did");--> statement-breakpoint
CREATE INDEX "block_lists_list_idx" ON "block_lists" USING btree ("list_uri");--> statement-breakpoint
CREATE INDEX "blocks_blocker_idx" ON "blocks" USING btree ("blocker_did");--> statement-breakpoint
CREATE INDEX "blocks_subject_idx" ON "blocks" USING btree ("subject_did");--> statement-breakpoint
CREATE INDEX "blocks_edge_idx" ON "blocks" USING btree ("blocker_did","subject_did");