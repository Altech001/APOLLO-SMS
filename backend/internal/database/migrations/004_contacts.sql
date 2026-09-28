-- 004: Contacts and contact groups move from browser storage to the database.
-- Column names match the explicit gorm:"column:..." tags in internal/models/contact.go.
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS contacts (
        id          BIGSERIAL PRIMARY KEY,
        user_id     BIGINT       NOT NULL,
        name        TEXT         NOT NULL,
        phone       TEXT         NOT NULL,
        email       TEXT,
        notes       TEXT,
        created_at  TIMESTAMPTZ,
        updated_at  TIMESTAMPTZ,
        deleted_at  TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts (user_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at ON contacts (deleted_at);
    -- One live contact per phone number per user; soft-deleted rows don't block re-adding.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_user_phone_live ON contacts (user_id, phone) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS contact_groups (
        id           BIGSERIAL PRIMARY KEY,
        user_id      BIGINT       NOT NULL,
        name         TEXT         NOT NULL,
        description  TEXT,
        color        TEXT,
        created_at   TIMESTAMPTZ,
        updated_at   TIMESTAMPTZ,
        deleted_at   TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_contact_groups_user_id ON contact_groups (user_id);
    CREATE INDEX IF NOT EXISTS idx_contact_groups_deleted_at ON contact_groups (deleted_at);

    CREATE TABLE IF NOT EXISTS contact_group_members (
        contact_id  BIGINT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
        group_id    BIGINT NOT NULL REFERENCES contact_groups (id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ,
        PRIMARY KEY (contact_id, group_id)
    );
    CREATE INDEX IF NOT EXISTS idx_contact_group_members_group_id ON contact_group_members (group_id);
END $$;
