-- P1: Add threading columns for proper Gmail reply threading
-- rfc_message_id = RFC 2822 Message-ID header (e.g. <CABxyz@mail.gmail.com>)
-- Used for In-Reply-To and References headers in replies

ALTER TABLE warmup_emails ADD COLUMN IF NOT EXISTS rfc_message_id TEXT;
ALTER TABLE pending_replies ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT;
ALTER TABLE pending_replies ADD COLUMN IF NOT EXISTS rfc_message_id TEXT;
