ALTER TABLE "businesses" ADD COLUMN "rating" double precision;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "rating_count" integer;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;