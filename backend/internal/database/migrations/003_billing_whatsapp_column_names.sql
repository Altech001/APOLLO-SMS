-- 003: GORM split "WhatsApp" into "whats_app" for the billing columns. Rename them to the names the
-- code queries (e.g. daily_usage.free_whatsapp_used). Values are kept. Idempotent: a column is only
-- renamed when the old name exists; if both exist (AutoMigrate already added the new one), the new
-- one is dropped first so the existing data is kept under the correct name.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('billing_plans', 'daily_free_whats_app', 'daily_free_whatsapp'),
            ('billing_plans', 'whats_app_credits',    'whatsapp_credits'),
            ('billing_plans', 'whats_app_per_sms',    'whatsapp_per_sms'),
            ('billing_plans', 'whats_app_price_ugx',  'whatsapp_price_ugx'),
            ('daily_usage',   'free_whats_app_used',  'free_whatsapp_used')
        ) AS t(tbl, old_name, new_name)
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = current_schema() AND table_name = r.tbl AND column_name = r.old_name) THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = current_schema() AND table_name = r.tbl AND column_name = r.new_name) THEN
                EXECUTE format('ALTER TABLE %I DROP COLUMN %I', r.tbl, r.new_name);
            END IF;
            EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.tbl, r.old_name, r.new_name);
        END IF;
    END LOOP;
END $$;
