-- Add progress tracking columns to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS leads_sent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_lead_index INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS campaign_status TEXT DEFAULT 'idle' CHECK (campaign_status IN ('idle', 'running', 'completed', 'failed', 'paused'));

-- Note: We'll use campaign_status for the campaign running state
-- This is separate from the main 'status' field which is used for RUNNING/PAUSED/COMPLETED/DRAFT
