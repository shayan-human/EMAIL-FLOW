-- NextAuth Authentication Tables
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  email_verified TIMESTAMPTZ,
  password TEXT,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  UNIQUE(identifier, token)
);

-- Core EmailFlow Tables

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  tags TEXT[] DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount NUMERIC(10,2) DEFAULT 0,
  stage TEXT DEFAULT 'Lead'::TEXT,
  expected_close_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT deals_stage_check CHECK (stage = ANY (ARRAY['Lead'::TEXT, 'Qualified'::TEXT, 'Proposal'::TEXT, 'Negotiation'::TEXT, 'Won'::TEXT, 'Lost'::TEXT]))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT activity_logs_type_check CHECK (type = ANY (ARRAY['stage_change'::TEXT, 'note_added'::TEXT, 'task_completed'::TEXT, 'file_attached'::TEXT]))
);

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'Open'::TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY['Open'::TEXT, 'Completed'::TEXT]))
);

CREATE TABLE IF NOT EXISTS blocked_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  reason TEXT,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'DRAFT'::TEXT,
  total_leads INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  min_delay INTEGER DEFAULT 5,
  max_delay INTEGER DEFAULT 15,
  sender_display_name TEXT,
  leads_sent INTEGER DEFAULT 0,
  last_lead_index INTEGER DEFAULT 0,
  campaign_status TEXT DEFAULT 'idle'::TEXT,
  CONSTRAINT campaigns_campaign_status_check CHECK (campaign_status = ANY (ARRAY['idle'::TEXT, 'running'::TEXT, 'completed'::TEXT, 'failed'::TEXT, 'paused'::TEXT]))
);

CREATE TABLE IF NOT EXISTS campaign_stats (
  campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  total_sent INTEGER DEFAULT 0,
  total_replied INTEGER DEFAULT 0,
  reply_rate NUMERIC(5,2) DEFAULT 0,
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sender_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  google_access_token TEXT,
  google_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT,
  status TEXT DEFAULT 'CONNECTED'::TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  sent_today INTEGER DEFAULT 0,
  refresh_failure_count INTEGER DEFAULT 0,
  last_token_refresh_at TIMESTAMPTZ,
  UNIQUE(user_id, email)
);

CREATE TABLE IF NOT EXISTS campaign_accounts (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sender_account_id UUID NOT NULL REFERENCES sender_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, sender_account_id)
);

CREATE TABLE IF NOT EXISTS draft_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#F59E0B'::TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT DEFAULT ''::TEXT,
  body TEXT DEFAULT ''::TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  folder_id UUID REFERENCES draft_folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  status TEXT DEFAULT 'PENDING'::TEXT,
  sent_at TIMESTAMPTZ,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  replied_at TIMESTAMPTZ,
  reply_count INTEGER DEFAULT 0,
  sender_account_id UUID REFERENCES sender_accounts(id) ON DELETE SET NULL,
  sender_account_email TEXT,
  last_name TEXT,
  full_name TEXT,
  business_name TEXT,
  website TEXT,
  personalized_subject TEXT,
  personalized_body TEXT,
  phone TEXT,
  custom_fields JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sender_account_id UUID REFERENCES sender_accounts(id) ON DELETE SET NULL,
  subject TEXT,
  status TEXT DEFAULT 'QUEUED'::TEXT NOT NULL,
  error_message TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  retry_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT false,
  gmail_message_id TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'incoming'::TEXT,
  gmail_thread_id TEXT
);

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  timezone TEXT DEFAULT 'UTC'::TEXT,
  send_window_from TIME DEFAULT '09:00:00'::TIME,
  send_window_to TIME DEFAULT '17:00:00'::TIME,
  theme TEXT DEFAULT 'dark'::TEXT,
  reply_notifications BOOLEAN DEFAULT true,
  bounce_notifications BOOLEAN DEFAULT true,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  send_window_enabled BOOLEAN DEFAULT false,
  network_opt_in BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS warmup_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  gmail_account_id UUID REFERENCES sender_accounts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'inactive'::TEXT,
  mode TEXT DEFAULT 'own_only'::TEXT,
  day_number INTEGER DEFAULT 0,
  daily_target INTEGER DEFAULT 3,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  warmup_duration INTEGER,
  persona TEXT DEFAULT 'casual'::TEXT,
  warmed_up_at TIMESTAMPTZ,
  CONSTRAINT warmup_accounts_mode_check CHECK (mode = ANY (ARRAY['own_only'::TEXT, 'network'::TEXT])),
  CONSTRAINT warmup_accounts_status_check CHECK (status = ANY (ARRAY['inactive'::TEXT, 'warming'::TEXT, 'warmed'::TEXT, 'paused'::TEXT]))
);

CREATE TABLE IF NOT EXISTS warmup_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID REFERENCES warmup_accounts(id) ON DELETE CASCADE,
  to_account_id UUID REFERENCES warmup_accounts(id) ON DELETE CASCADE,
  gmail_message_id TEXT,
  thread_id TEXT,
  subject TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  rfc_message_id TEXT,
  landed_in_spam BOOLEAN DEFAULT false NOT NULL,
  spam_detected_at TIMESTAMPTZ,
  spam_rescued_at TIMESTAMPTZ,
  marked_important_at TIMESTAMPTZ,
  reply_detected_at TIMESTAMPTZ,
  reply_scheduled_at TIMESTAMPTZ,
  reply_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT warmup_emails_status_check CHECK (status = ANY (ARRAY['sent'::TEXT, 'replied'::TEXT, 'rescued'::TEXT]))
);

CREATE TABLE IF NOT EXISTS warmup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warmup_account_id UUID REFERENCES warmup_accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  gmail_message_id TEXT,
  thread_id TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending'::TEXT,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  to_account_id UUID REFERENCES warmup_accounts(id) ON DELETE CASCADE,
  subject TEXT,
  body TEXT,
  day_number INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS warmup_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES warmup_accounts(id) ON DELETE CASCADE,
  date DATE,
  sent INTEGER DEFAULT 0,
  received INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  spam_rescues INTEGER DEFAULT 0,
  UNIQUE(account_id, date)
);

CREATE TABLE IF NOT EXISTS pending_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warmup_account_id UUID REFERENCES warmup_accounts(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  thread_id TEXT,
  reply_content TEXT NOT NULL,
  status TEXT DEFAULT 'pending'::TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  last_attempted_at TIMESTAMPTZ,
  email_record_id UUID REFERENCES warmup_emails(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  original_subject TEXT,
  rfc_message_id TEXT,
  gmail_thread_id TEXT,
  message_id TEXT
);

-- Performance Indexes

CREATE INDEX IF NOT EXISTS idx_blocked_leads_user_email ON blocked_leads (user_id, email);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns (user_id);
CREATE INDEX IF NOT EXISTS idx_draft_folders_name ON draft_folders (name);
CREATE INDEX IF NOT EXISTS idx_draft_folders_user_id ON draft_folders (user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_folder_id ON drafts (folder_id);
CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts (user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON email_logs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_lead_id ON email_logs (lead_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs (status);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads (campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_sender_account_id ON leads (sender_account_id);
CREATE INDEX IF NOT EXISTS idx_pending_replies_scheduled ON pending_replies (scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pending_replies_status ON pending_replies (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_replies_gmail_thread_id ON replies (gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_replies_lead_id ON replies (lead_id);
CREATE INDEX IF NOT EXISTS idx_replies_lead_timestamp ON replies (lead_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_replies_timestamp ON replies (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_warmup_accounts_gmail_account_id ON warmup_accounts (gmail_account_id);
CREATE INDEX IF NOT EXISTS idx_warmup_accounts_status ON warmup_accounts (status);
CREATE INDEX IF NOT EXISTS idx_warmup_accounts_user_id ON warmup_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_warmup_emails_from_account_id ON warmup_emails (from_account_id);
CREATE INDEX IF NOT EXISTS idx_warmup_emails_sent_at ON warmup_emails (sent_at);
CREATE INDEX IF NOT EXISTS idx_warmup_emails_spam_pending ON warmup_emails (landed_in_spam) WHERE spam_rescued_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_warmup_emails_status ON warmup_emails (status);
CREATE INDEX IF NOT EXISTS idx_warmup_emails_to_account_id ON warmup_emails (to_account_id);
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_scheduled_at ON warmup_jobs (scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_status ON warmup_jobs (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_type_status_scheduled ON warmup_jobs (type, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_warmup_stats_account_id ON warmup_stats (account_id);
CREATE INDEX IF NOT EXISTS idx_warmup_stats_date ON warmup_stats (date);
