CREATE TABLE "tag_embeddings" (
	"tag" text PRIMARY KEY NOT NULL,
	"embedding" double precision[] NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_publications" (
	"topic_slug" text NOT NULL,
	"publication_uri" text NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"matched_tag_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "topic_publications_topic_slug_publication_uri_pk" PRIMARY KEY("topic_slug","publication_uri")
);
--> statement-breakpoint
CREATE TABLE "topic_tags" (
	"topic_slug" text NOT NULL,
	"tag" text NOT NULL,
	"weight" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "topic_tags_topic_slug_tag_pk" PRIMARY KEY("topic_slug","tag")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"signature_tags" text[] NOT NULL,
	"tag_count" integer DEFAULT 0 NOT NULL,
	"publication_count" integer DEFAULT 0 NOT NULL,
	"author_count" integer DEFAULT 0 NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"name_model" text,
	"named_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topic_publications" ADD CONSTRAINT "topic_publications_topic_slug_topics_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topics"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_publications" ADD CONSTRAINT "topic_publications_publication_uri_publications_uri_fk" FOREIGN KEY ("publication_uri") REFERENCES "public"."publications"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_tags" ADD CONSTRAINT "topic_tags_topic_slug_topics_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topics"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_publications_rank_idx" ON "topic_publications" USING btree ("topic_slug","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "topic_publications_pub_idx" ON "topic_publications" USING btree ("publication_uri");--> statement-breakpoint
CREATE INDEX "topic_tags_tag_idx" ON "topic_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "topic_tags_weight_idx" ON "topic_tags" USING btree ("topic_slug","weight" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "topics_published_score_idx" ON "topics" USING btree ("published","score" DESC NULLS LAST);