-- 006: AI assistant conversations move from browser storage to the database, per user.
-- messages holds the chat as the app renders it (turns, proposed actions and their outcome, image links).
-- Column names match the explicit gorm:"column:..." tags in internal/models/ai_conversation.go.
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS ai_conversations (
        id          BIGSERIAL PRIMARY KEY,
        user_id     BIGINT      NOT NULL,
        title       TEXT        NOT NULL DEFAULT '',
        messages    TEXT        NOT NULL DEFAULT '[]',
        created_at  TIMESTAMPTZ,
        updated_at  TIMESTAMPTZ,
        deleted_at  TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated ON ai_conversations (user_id, updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_deleted_at ON ai_conversations (deleted_at);
END $$;
