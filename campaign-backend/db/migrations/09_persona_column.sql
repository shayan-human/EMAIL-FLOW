-- Add persona column to warmup_accounts for email style variety
ALTER TABLE warmup_accounts ADD COLUMN IF NOT EXISTS persona TEXT DEFAULT 'casual';
