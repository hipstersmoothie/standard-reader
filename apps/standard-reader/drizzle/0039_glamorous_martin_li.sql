CREATE TABLE "mutes" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"muter_did" text NOT NULL,
	"rkey" text NOT NULL,
	"subject" text NOT NULL,
	"subject_did" text,
	"subject_uri" text,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mutes_muter_idx" ON "mutes" USING btree ("muter_did");--> statement-breakpoint
CREATE INDEX "mutes_user_edge_idx" ON "mutes" USING btree ("muter_did","subject_did");--> statement-breakpoint
CREATE INDEX "mutes_pub_edge_idx" ON "mutes" USING btree ("muter_did","subject_uri");