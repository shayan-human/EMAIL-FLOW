-- P5: Spam Rescue System
-- Track warmup emails that land in spam and their rescue status

ALTER TABLE warmup_emails ADD COLUMN IF NOT EXISTS landed_in_spam BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE warmup_emails ADD COLUMN IF NOT EXISTS spam_detected_at TIMESTAMPTZ;
ALTER TABLE warmup_emails ADD COLUMN IF NOT EXISTS spam_rescued_at TIMESTAMPTZ;
ALTER TABLE warmup_emails ADD COLUMN IF NOT EXISTS marked_important_at TIMESTAMPTZ;

-- Index for efficient spam rescue polling queries
CREATE INDEX IF NOT EXISTS idx_warmup_emails_spam_pending
ON warmup_emails (landed_in_spam)
WHERE spam_rescued_at IS NULL;
