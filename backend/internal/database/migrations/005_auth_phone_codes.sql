-- 005: Phone-based account verification and password reset.
-- users.phone holds the registered number (E.164). auth_codes stores hashed one-time SMS codes;
-- auth_sms_charges is the ledger of verification/reset SMS billed to users (35 UGX each by default).
-- Column names match the explicit gorm:"column:..." tags in internal/models/auth_code.go.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_name = 'users') THEN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
        CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
    END IF;

    CREATE TABLE IF NOT EXISTS auth_codes (
        id           BIGSERIAL PRIMARY KEY,
        user_id      BIGINT       NOT NULL,
        purpose      VARCHAR(16)  NOT NULL,
        code_hash    TEXT         NOT NULL,
        phone        TEXT         NOT NULL,
        attempts     BIGINT       NOT NULL DEFAULT 0,
        expires_at   TIMESTAMPTZ  NOT NULL,
        consumed_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_auth_codes_user_id ON auth_codes (user_id);

    CREATE TABLE IF NOT EXISTS auth_sms_charges (
        id          BIGSERIAL PRIMARY KEY,
        user_id     BIGINT       NOT NULL,
        purpose     VARCHAR(16)  NOT NULL,
        phone       TEXT         NOT NULL,
        provider    TEXT,
        credits     BIGINT       NOT NULL DEFAULT 0,
        amount_ugx  BIGINT       NOT NULL DEFAULT 0,
        status      VARCHAR(16)  NOT NULL,
        error       TEXT,
        created_at  TIMESTAMPTZ,
        updated_at  TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sms_charges_user_id ON auth_sms_charges (user_id);
END $$;
