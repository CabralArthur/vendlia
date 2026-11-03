-- Turn on automatic answers to simple questions for existing accounts (new default).
UPDATE "organizations" SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{autoReplyInformational}', 'true'::jsonb);
