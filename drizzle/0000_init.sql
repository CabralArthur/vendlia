CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_sources" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"business_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"license" text NOT NULL,
	"restrictions" text,
	"payload" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"cnpj" text,
	"segment" text DEFAULT 'servicos' NOT NULL,
	"category" text,
	"address" text,
	"neighborhood" text,
	"city" text,
	"state" text,
	"lat" double precision,
	"lng" double precision,
	"phone" text,
	"phone_e164" text,
	"email" text,
	"website" text,
	"website_status" text DEFAULT 'unknown' NOT NULL,
	"instagram" text,
	"opening_hours" text,
	"description" text,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_points" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"business_id" text NOT NULL,
	"channel" text NOT NULL,
	"value" text NOT NULL,
	"wa_exists" boolean,
	"permission" text DEFAULT 'unknown' NOT NULL,
	"consent_source" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"lead_id" text,
	"instance_id" text NOT NULL,
	"remote_jid" text NOT NULL,
	"phone_e164" text NOT NULL,
	"contact_name" text,
	"state" text DEFAULT 'AI_ACTIVE' NOT NULL,
	"assignee_id" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"unread" integer DEFAULT 0 NOT NULL,
	"last_intent" text,
	"summary" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"handoff_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"name" text NOT NULL,
	"document" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"provider_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_runs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"source" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intent_classifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"intent" text NOT NULL,
	"confidence" double precision NOT NULL,
	"urgency" text NOT NULL,
	"sentiment" text NOT NULL,
	"suggested_action" text NOT NULL,
	"suggested_reply" text,
	"reason" text NOT NULL,
	"handoff_required" boolean NOT NULL,
	"summary" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"business_id" text NOT NULL,
	"stage" text DEFAULT 'discovered' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"score_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_action" text,
	"owner_id" text,
	"notes" text,
	"lost_reason" text,
	"last_contact_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_org_id_pk" PRIMARY KEY("user_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"direction" text NOT NULL,
	"author" text NOT NULL,
	"kind" text DEFAULT 'reply' NOT NULL,
	"body" text NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_subscription_id" text,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invoice_url" text,
	"due_date" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_payment_id_unique" UNIQUE("provider_payment_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"setup_price_cents" integer NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"website_id" text,
	"product_id" text NOT NULL,
	"token" text NOT NULL,
	"setup_price_cents" integer NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"notes" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"client_approved_content_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"website_id" text,
	"provider" text NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"next_due_date" text,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"value" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "website_versions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"website_id" text NOT NULL,
	"version" integer NOT NULL,
	"template" text NOT NULL,
	"accent" text NOT NULL,
	"content" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "websites" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"slug" text NOT NULL,
	"template" text NOT NULL,
	"accent" text DEFAULT '#39D79B' NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'preview' NOT NULL,
	"preview_token" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_version" integer,
	"custom_domain" text,
	"views" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "websites_slug_unique" UNIQUE("slug"),
	CONSTRAINT "websites_custom_domain_unique" UNIQUE("custom_domain")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_instances" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"phone" text,
	"webhook_token" text NOT NULL,
	"qr_base64" text,
	"hourly_limit" integer DEFAULT 8 NOT NULL,
	"daily_limit" integer DEFAULT 30 NOT NULL,
	"warmup_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_instances_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_sources" ADD CONSTRAINT "business_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_sources" ADD CONSTRAINT "business_sources_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_points" ADD CONSTRAINT "contact_points_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_points" ADD CONSTRAINT "contact_points_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_instance_id_whatsapp_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."whatsapp_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_classifications" ADD CONSTRAINT "intent_classifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_classifications" ADD CONSTRAINT "intent_classifications_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_classifications" ADD CONSTRAINT "intent_classifications_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_versions" ADD CONSTRAINT "website_versions_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_instances" ADD CONSTRAINT "whatsapp_instances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_sources_ext" ON "business_sources" USING btree ("org_id","source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_org_cnpj" ON "businesses" USING btree ("org_id","cnpj");--> statement-breakpoint
CREATE INDEX "businesses_org_phone" ON "businesses" USING btree ("org_id","phone_e164");--> statement-breakpoint
CREATE INDEX "businesses_org_name" ON "businesses" USING btree ("org_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_points_value" ON "contact_points" USING btree ("org_id","channel","value");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_jid" ON "conversations" USING btree ("instance_id","remote_jid");--> statement-breakpoint
CREATE INDEX "conversations_org_last" ON "conversations" USING btree ("org_id","last_message_at");--> statement-breakpoint
CREATE INDEX "lead_events_lead" ON "lead_events" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_business" ON "leads" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "leads_org_stage" ON "leads" USING btree ("org_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_id" ON "messages" USING btree ("org_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "messages_conv" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_org" ON "notifications" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_events_uniq" ON "provider_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_value" ON "suppression_list" USING btree ("org_id","value");--> statement-breakpoint
CREATE INDEX "usage_org" ON "usage_records" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "website_versions_v" ON "website_versions" USING btree ("website_id","version");--> statement-breakpoint
CREATE INDEX "websites_lead" ON "websites" USING btree ("lead_id");