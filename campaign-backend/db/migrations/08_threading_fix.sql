-- Gmail Threading Fix
-- Add message_id column for storing original email's Message-ID header
-- This ensures replies are properly threaded onto original conversations

ALTER TABLE pending_replies ADD COLUMN IF NOT EXISTS message_id TEXT;
