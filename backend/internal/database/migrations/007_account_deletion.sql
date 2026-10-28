DO $$
BEGIN
    -- On a fresh database AutoMigrate creates users after versioned migrations run.
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_name = 'users') THEN
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS account_status VARCHAR(32) NOT NULL DEFAULT 'active',
            ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS deletion_completed_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS terms_version VARCHAR(32);

        UPDATE users
        SET account_status = 'active'
        WHERE deleted_at IS NULL AND (account_status IS NULL OR account_status = '');

        UPDATE users
        SET account_status = 'deletion_pending',
            deletion_requested_at = COALESCE(deletion_requested_at, deleted_at),
            deletion_scheduled_for = COALESCE(deletion_scheduled_for, deleted_at + INTERVAL '60 days')
        WHERE deleted_at IS NOT NULL
          AND (account_status IS NULL OR account_status = '' OR account_status = 'active');

        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
        DROP INDEX IF EXISTS idx_users_email;
        DROP INDEX IF EXISTS uni_users_email;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active
            ON users (email)
            WHERE deleted_at IS NULL;

        CREATE INDEX IF NOT EXISTS idx_users_account_status
            ON users (account_status);

        CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled_for
            ON users (deletion_scheduled_for);
    END IF;
END $$;
