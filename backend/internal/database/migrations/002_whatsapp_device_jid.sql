-- 002: GORM originally named WhatsAppAccount.DeviceJID "device_j_id"; the code uses "device_jid".
-- Idempotent: safe on fresh databases (table absent) and on databases already fixed.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'whats_app_accounts' AND column_name = 'device_j_id') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = current_schema() AND table_name = 'whats_app_accounts' AND column_name = 'device_jid') THEN
            ALTER TABLE whats_app_accounts DROP COLUMN device_j_id;
        ELSE
            ALTER TABLE whats_app_accounts RENAME COLUMN device_j_id TO device_jid;
        END IF;
    END IF;
    -- AutoMigrate may already have created the correctly named index; then the old one is a duplicate.
    IF to_regclass('idx_whats_app_accounts_device_j_id') IS NOT NULL THEN
        IF to_regclass('idx_whats_app_accounts_device_jid') IS NOT NULL THEN
            DROP INDEX idx_whats_app_accounts_device_j_id;
        ELSE
            ALTER INDEX idx_whats_app_accounts_device_j_id RENAME TO idx_whats_app_accounts_device_jid;
        END IF;
    END IF;
END $$;
