-- Add rotation columns to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS rotation_mode TEXT,
ADD COLUMN IF NOT EXISTS selected_draft_ids UUID[],
ADD COLUMN IF NOT EXISTS draft_index INTEGER DEFAULT 0;

-- Add draft_id column to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS draft_id UUID REFERENCES drafts(id);