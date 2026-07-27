CREATE TABLE "mcp_auth_code" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"did" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text NOT NULL,
	"code_challenge" text NOT NULL,
	"resource" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_client" (
	"id" text PRIMARY KEY NOT NULL,
	"secret_hash" text,
	"name" text NOT NULL,
	"redirect_uris" text NOT NULL,
	"token_endpoint_auth_method" text NOT NULL,
	"scope" text NOT NULL,
	"client_uri" text,
	"logo_uri" text,
	"software_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_token" (
	"id" text PRIMARY KEY NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"did" text NOT NULL,
	"scope" text NOT NULL,
	"resource" text,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_token_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "mcp_token_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
ALTER TABLE "mcp_auth_code" ADD CONSTRAINT "mcp_auth_code_client_id_mcp_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_auth_code" ADD CONSTRAINT "mcp_auth_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_token" ADD CONSTRAINT "mcp_token_client_id_mcp_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_token" ADD CONSTRAINT "mcp_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_auth_code_expires_at_idx" ON "mcp_auth_code" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mcp_token_user_id_idx" ON "mcp_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_token_expires_at_idx" ON "mcp_token" USING btree ("expires_at");