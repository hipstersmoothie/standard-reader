CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"did" text,
	"image" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"theme_mode" text,
	"reader_voice" text,
	"open_links_externally" boolean,
	"open_collections_in_magazine" boolean,
	"reading_typography" text,
	"track_reading_history" boolean,
	"home_scope" text,
	"profile_hidden_tabs" text,
	"profile_show_likes" boolean,
	"collections_authoring_enabled" boolean,
	"userinput_feedback_enabled" boolean,
	"margin_save_enabled" boolean,
	"semble_save_enabled" boolean,
	"atstore_review_prompt_dismissed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_did_unique" UNIQUE("did")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"did" text PRIMARY KEY NOT NULL,
	"handle" text,
	"pds" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_name" text,
	"description" text,
	"avatar_url" text,
	"banner_url" text,
	"bsky_profile_uri" text,
	"bsky_profile_cid" text,
	"profile_fetched_at" timestamp with time zone,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"did" text NOT NULL,
	"rkey" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"icon_cid" text,
	"icon_mime" text,
	"theme_accent" text,
	"theme_background" text,
	"theme_foreground" text,
	"theme_accent_foreground" text,
	"theme_json" jsonb,
	"show_in_discover" boolean DEFAULT true NOT NULL,
	"collections_publication" boolean DEFAULT false NOT NULL,
	"topic" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_checked_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(name, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')) STORED,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_contributors" (
	"document_uri" text NOT NULL,
	"did" text NOT NULL,
	"role" text,
	"display_name" text,
	CONSTRAINT "document_contributors_document_uri_did_pk" PRIMARY KEY("document_uri","did")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"did" text NOT NULL,
	"rkey" text NOT NULL,
	"title" text NOT NULL,
	"site_uri" text NOT NULL,
	"publication_uri" text,
	"path" text,
	"canonical_url" text,
	"description" text,
	"text_content" text,
	"content_json" jsonb,
	"content_format" text,
	"collection_json" jsonb,
	"has_renderable_body" boolean DEFAULT true NOT NULL,
	"cover_image_cid" text,
	"cover_image_mime" text,
	"tags" text[],
	"featured" boolean DEFAULT false NOT NULL,
	"backlink_count" integer DEFAULT 0 NOT NULL,
	"backlink_count_prev" integer DEFAULT 0 NOT NULL,
	"backlink_synced_at" timestamp with time zone,
	"trending_score" double precision DEFAULT 0 NOT NULL,
	"trending_recomputed_at" timestamp with time zone,
	"distinct_recommender_count" integer DEFAULT 0 NOT NULL,
	"bsky_post_uri" text,
	"bsky_post_cid" text,
	"published_at" timestamp with time zone NOT NULL,
	"record_updated_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B') || setweight(to_tsvector('english', coalesce(text_content, '')), 'C')) STORED,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommends" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"recommender_did" text NOT NULL,
	"rkey" text NOT NULL,
	"document_uri" text NOT NULL,
	"document_did" text,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"subscriber_did" text NOT NULL,
	"rkey" text NOT NULL,
	"publication_uri" text NOT NULL,
	"publication_did" text,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "publication_corecommends" (
	"publication_uri" text NOT NULL,
	"related_publication_uri" text NOT NULL,
	"co_recommender_count" integer DEFAULT 0 NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_corecommends_publication_uri_related_publication_uri_pk" PRIMARY KEY("publication_uri","related_publication_uri")
);
--> statement-breakpoint
CREATE TABLE "publication_cosubscriptions" (
	"publication_uri" text NOT NULL,
	"related_publication_uri" text NOT NULL,
	"co_subscriber_count" integer DEFAULT 0 NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_cosubscriptions_publication_uri_related_publication_uri_pk" PRIMARY KEY("publication_uri","related_publication_uri")
);
--> statement-breakpoint
CREATE TABLE "publication_stats" (
	"publication_uri" text PRIMARY KEY NOT NULL,
	"subscriber_count" integer DEFAULT 0 NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"recommend_count" integer DEFAULT 0 NOT NULL,
	"last_document_at" timestamp with time zone,
	"documents_7d" integer DEFAULT 0 NOT NULL,
	"subscribers_7d" integer DEFAULT 0 NOT NULL,
	"recommends_7d" integer DEFAULT 0 NOT NULL,
	"documents_prev_7d" integer DEFAULT 0 NOT NULL,
	"subscribers_prev_7d" integer DEFAULT 0 NOT NULL,
	"recommends_prev_7d" integer DEFAULT 0 NOT NULL,
	"backlinks_7d" integer DEFAULT 0 NOT NULL,
	"trending_velocity" double precision DEFAULT 0 NOT NULL,
	"trending_score" double precision DEFAULT 0 NOT NULL,
	"trending_window_start" timestamp with time zone,
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_dead_letter" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" bigint,
	"uri" text,
	"collection" text,
	"action" text,
	"payload" jsonb,
	"error" text,
	"retries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_state" (
	"id" text PRIMARY KEY NOT NULL,
	"last_event_id" bigint,
	"last_event_at" timestamp with time zone,
	"events_processed" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_repos" (
	"did" text PRIMARY KEY NOT NULL,
	"reason" text,
	"added_to_tap_at" timestamp with time zone,
	"backfill_state" text DEFAULT 'pending' NOT NULL,
	"last_seen_rev" text,
	"reconcile_fail_count" integer DEFAULT 0 NOT NULL,
	"reconcile_retry_after" timestamp with time zone,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_labels" (
	"src" text NOT NULL,
	"uri" text NOT NULL,
	"val" text NOT NULL,
	"cts" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_labels_src_uri_val_pk" PRIMARY KEY("src","uri","val")
);
--> statement-breakpoint
CREATE TABLE "label_sync_state" (
	"labeler_did" text PRIMARY KEY NOT NULL,
	"cursor" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labeler_services" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"owner_did" text NOT NULL,
	"rkey" text NOT NULL,
	"labeler_did" text NOT NULL,
	"service_endpoint" text NOT NULL,
	"display_name" text,
	"description" text,
	"avatar_url" text,
	"label_value_definitions" jsonb,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labeler_subscriptions" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"subscriber_did" text NOT NULL,
	"rkey" text NOT NULL,
	"labeler_did" text NOT NULL,
	"prefs" jsonb,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"document_uri" text NOT NULL,
	"quote_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upvote_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subject_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "save_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_app" text NOT NULL,
	"collection_uri" text,
	"collection_cid" text,
	"new_collection_name" text,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"author" text,
	"site_name" text,
	"image_url" text,
	"motivation" text,
	"passage" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_contributors" ADD CONSTRAINT "document_contributors_document_uri_documents_uri_fk" FOREIGN KEY ("document_uri") REFERENCES "public"."documents"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_corecommends" ADD CONSTRAINT "publication_corecommends_publication_uri_publications_uri_fk" FOREIGN KEY ("publication_uri") REFERENCES "public"."publications"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_corecommends" ADD CONSTRAINT "publication_corecommends_related_publication_uri_publications_uri_fk" FOREIGN KEY ("related_publication_uri") REFERENCES "public"."publications"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_cosubscriptions" ADD CONSTRAINT "publication_cosubscriptions_publication_uri_publications_uri_fk" FOREIGN KEY ("publication_uri") REFERENCES "public"."publications"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_cosubscriptions" ADD CONSTRAINT "publication_cosubscriptions_related_publication_uri_publications_uri_fk" FOREIGN KEY ("related_publication_uri") REFERENCES "public"."publications"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_stats" ADD CONSTRAINT "publication_stats_publication_uri_publications_uri_fk" FOREIGN KEY ("publication_uri") REFERENCES "public"."publications"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_draft" ADD CONSTRAINT "feedback_draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upvote_draft" ADD CONSTRAINT "upvote_draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "save_draft" ADD CONSTRAINT "save_draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "profiles_handle_idx" ON "profiles" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "publications_did_idx" ON "publications" USING btree ("did");--> statement-breakpoint
CREATE INDEX "publications_name_idx" ON "publications" USING btree ("name");--> statement-breakpoint
CREATE INDEX "publications_discover_idx" ON "publications" USING btree ("show_in_discover","deleted");--> statement-breakpoint
CREATE INDEX "publications_topic_idx" ON "publications" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "publications_url_idx" ON "publications" USING btree ("url");--> statement-breakpoint
CREATE INDEX "publications_search_idx" ON "publications" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "document_contributors_did_idx" ON "document_contributors" USING btree ("did");--> statement-breakpoint
CREATE INDEX "documents_did_idx" ON "documents" USING btree ("did");--> statement-breakpoint
CREATE INDEX "documents_publication_published_idx" ON "documents" USING btree ("publication_uri","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_published_idx" ON "documents" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_featured_idx" ON "documents" USING btree ("featured","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_site_idx" ON "documents" USING btree ("site_uri");--> statement-breakpoint
CREATE INDEX "documents_search_idx" ON "documents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "documents_trending_idx" ON "documents" USING btree ("trending_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recommends_document_idx" ON "recommends" USING btree ("document_uri");--> statement-breakpoint
CREATE INDEX "recommends_recommender_idx" ON "recommends" USING btree ("recommender_did");--> statement-breakpoint
CREATE INDEX "recommends_edge_idx" ON "recommends" USING btree ("recommender_did","document_uri");--> statement-breakpoint
CREATE INDEX "subscriptions_publication_idx" ON "subscriptions" USING btree ("publication_uri");--> statement-breakpoint
CREATE INDEX "subscriptions_subscriber_idx" ON "subscriptions" USING btree ("subscriber_did");--> statement-breakpoint
CREATE INDEX "subscriptions_edge_idx" ON "subscriptions" USING btree ("subscriber_did","publication_uri");--> statement-breakpoint
CREATE INDEX "bookmarks_owner_idx" ON "bookmarks" USING btree ("owner_did","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bookmarks_document_idx" ON "bookmarks" USING btree ("document_uri");--> statement-breakpoint
CREATE INDEX "bookmarks_edge_idx" ON "bookmarks" USING btree ("owner_did","document_uri");--> statement-breakpoint
CREATE INDEX "reads_owner_idx" ON "reads" USING btree ("owner_did","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reads_document_idx" ON "reads" USING btree ("document_uri");--> statement-breakpoint
CREATE INDEX "reads_edge_idx" ON "reads" USING btree ("owner_did","document_uri");--> statement-breakpoint
CREATE INDEX "list_saves_saver_idx" ON "list_saves" USING btree ("saver_did");--> statement-breakpoint
CREATE INDEX "list_saves_list_uri_idx" ON "list_saves" USING btree ("list_uri");--> statement-breakpoint
CREATE INDEX "lists_owner_idx" ON "lists" USING btree ("owner_did","rkey");--> statement-breakpoint
CREATE INDEX "publication_corecomm_rank_idx" ON "publication_corecommends" USING btree ("publication_uri","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "publication_cosub_rank_idx" ON "publication_cosubscriptions" USING btree ("publication_uri","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "publication_stats_subscribers_idx" ON "publication_stats" USING btree ("subscriber_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "publication_stats_active_idx" ON "publication_stats" USING btree ("last_document_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "publication_stats_trending_idx" ON "publication_stats" USING btree ("trending_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ingest_dead_letter_collection_idx" ON "ingest_dead_letter" USING btree ("collection");--> statement-breakpoint
CREATE INDEX "tracked_repos_state_idx" ON "tracked_repos" USING btree ("backfill_state");--> statement-breakpoint
CREATE INDEX "document_labels_uri_idx" ON "document_labels" USING btree ("uri");--> statement-breakpoint
CREATE INDEX "document_labels_src_idx" ON "document_labels" USING btree ("src");--> statement-breakpoint
CREATE INDEX "labeler_services_labeler_idx" ON "labeler_services" USING btree ("labeler_did");--> statement-breakpoint
CREATE INDEX "labeler_subscriptions_subscriber_idx" ON "labeler_subscriptions" USING btree ("subscriber_did");--> statement-breakpoint
CREATE INDEX "labeler_subscriptions_labeler_idx" ON "labeler_subscriptions" USING btree ("labeler_did");--> statement-breakpoint
CREATE INDEX "quote_shares_document_uri_idx" ON "quote_shares" USING btree ("document_uri");--> statement-breakpoint
CREATE INDEX "feedback_draft_user_idx" ON "feedback_draft" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_draft_expires_idx" ON "feedback_draft" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "upvote_draft_user_idx" ON "upvote_draft" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "upvote_draft_expires_idx" ON "upvote_draft" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "save_draft_user_idx" ON "save_draft" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "save_draft_expires_idx" ON "save_draft" USING btree ("expires_at");