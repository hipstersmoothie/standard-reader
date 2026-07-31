CREATE TABLE "user_follows" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"follower_did" text NOT NULL,
	"rkey" text NOT NULL,
	"subject_did" text NOT NULL,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_follows_follower_idx" ON "user_follows" USING btree ("follower_did");--> statement-breakpoint
CREATE INDEX "user_follows_subject_idx" ON "user_follows" USING btree ("subject_did");--> statement-breakpoint
CREATE INDEX "user_follows_edge_idx" ON "user_follows" USING btree ("follower_did","subject_did");--> statement-breakpoint
CREATE INDEX "documents_did_published_idx" ON "documents" USING btree ("did","published_at" desc nulls last) WHERE deleted = false;--> statement-breakpoint
CREATE INDEX "recommends_doc_recommender_created_idx" ON "recommends" USING btree ("document_uri","recommender_did","created_at" desc nulls last) WHERE "recommends"."deleted" = false;