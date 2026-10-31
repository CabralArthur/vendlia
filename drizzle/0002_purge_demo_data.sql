-- Remove all sample ("exemplo") data created by earlier versions. Only rows flagged as demo are touched.
DELETE FROM "suppression_list" s USING "businesses" b
  WHERE b."is_demo" = true AND s."org_id" = b."org_id" AND s."value" = b."phone_e164";--> statement-breakpoint
DELETE FROM "whatsapp_instances" WHERE "name" LIKE 'demo-%';--> statement-breakpoint
DELETE FROM "proposals" WHERE "lead_id" IN (SELECT l."id" FROM "leads" l JOIN "businesses" b ON b."id" = l."business_id" WHERE b."is_demo" = true);--> statement-breakpoint
DELETE FROM "customers" WHERE "lead_id" IN (SELECT l."id" FROM "leads" l JOIN "businesses" b ON b."id" = l."business_id" WHERE b."is_demo" = true);--> statement-breakpoint
DELETE FROM "businesses" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "notifications" WHERE "type" LIKE 'demo:%';
