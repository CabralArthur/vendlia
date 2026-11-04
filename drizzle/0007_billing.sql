ALTER TABLE "organizations" ADD COLUMN "plan" text DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_status" text DEFAULT 'trialing' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_cycle" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "pending_plan" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "pending_cycle" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "asaas_customer_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "asaas_subscription_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "extra_sites" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "unlimited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
-- Accounts that existed before billing belong to the platform owner: keep them free and unlimited.
UPDATE "organizations" SET "unlimited" = true, "plan" = 'agencia', "billing_status" = 'active';
