require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cron = require('node-cron');
const { pool } = require('./lib/db');
const { sendEmail } = require('./lib/email-service');
const { checkReplies } = require('./lib/reply-service');
const { validateEmail } = require('./lib/email-validator');
const { maskEmail } = require('./lib/log-utils');
const { refreshExpiringTokens } = require('./lib/token-refresh-service');
const {
    startWarmup,
    pauseWarmup,
    resumeWarmup,
    getUserWarmupAccounts,
    getWarmupStats,
    getUserAggregateStats,
    runWarmupCycle,
    runDailyWarmupCycle,
    processPendingJobs,
    processPendingReplies,
    processWarmupJobs,
    processSpamRescue,
    pollInboxForReplies,
    updateWarmupMode,
    setNetworkOptIn,
    setNetworkOptOut,
    getNetworkOptStatus,
} = require('./lib/warmup-service');

const app = express();
const cors = require('cors');
const PORT = process.env.PORT || 3000;
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '*/5 * * * *';

const CHUNK_SIZE = 10;
const CHUNK_DELAY_MS = 2000;
const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

// Token cache for campaign runs - prevents excessive token refreshes
// Key: accountId, Value: { accessToken, expiresAt }
const tokenCache = new Map();
const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cleanup expired entries every TTL interval
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of tokenCache) {
        if (now - value.cachedAt > TOKEN_CACHE_TTL_MS) {
            tokenCache.delete(key);
        }
    }
}, TOKEN_CACHE_TTL_MS);

let keepAliveInterval = null;

// --- Authentication Middleware ---
function authenticateRequest(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.slice(7);
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        if (!payload.sub || !payload.email) {
            return res.status(401).json({ error: 'Invalid token payload' });
        }
        req.user = { userId: payload.sub, email: payload.email };
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

async function verifyAccountOwnership(userId, accountId, table = 'sender_accounts') {
    try {
        const allowedTables = ['sender_accounts', 'warmup_accounts', 'campaigns'];
        if (!allowedTables.includes(table)) {
            return { success: false, status: 400, error: 'Invalid table' };
        }
        const result = await pool.query(
            `SELECT user_id FROM ${table} WHERE id = $1`,
            [accountId]
        );
        const data = result.rows[0];
        if (!data) return { success: false, status: 404, error: 'Account not found' };
        if (data.user_id !== userId) return { success: false, status: 403, error: 'Forbidden' };
        return { success: true };
    } catch (err) {
        return { success: false, status: 500, error: err.message };
    }
}

app.use(express.json());

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
    credentials: true
}));

// --- Health Check Routes ---

app.get('/', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'EmailFlow Backend is active' });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/status', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) AS count FROM email_logs");
        const count = parseInt(result.rows[0].count) || 0;

        res.json({
            uptime: process.uptime(),
            total_emails_sent: count,
            timestamp: new Date().toISOString(),
            env: {
                GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? `SET (len: ${process.env.GOOGLE_CLIENT_ID.trim().length})` : 'MISSING',
                GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? `SET (len: ${process.env.GOOGLE_CLIENT_SECRET.trim().length})` : 'MISSING',
                PORT: PORT,
                NODE_ENV: process.env.NODE_ENV
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/auth-check', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

    res.json({
        clientId: {
            length: clientId.length,
            trimmedLength: clientId.trim().length,
            prefix: clientId.substring(0, 10) + '...',
            suffix: '...' + clientId.substring(clientId.length - 10)
        },
        clientSecret: {
            length: clientSecret.length,
            trimmedLength: clientSecret.trim().length,
            prefix: clientSecret.substring(0, 5) + '...',
            suffix: '...' + clientSecret.substring(clientSecret.length - 5)
        }
    });
});

// --- Helpers ---

function isBounceError(errorMessage) {
    if (!errorMessage) return false;
    const errorLower = errorMessage.toLowerCase();
    const bouncePatterns = [
        'mailbox unavailable',
        'mailbox busy',
        'user unknown',
        'recipient rejected',
        'address not found',
        'no such user',
        'mailbox quota',
        ' exceeds quota',
        '550',
        '554',
        'bounced',
        'hard bounce',
        'delivery failed',
        'undeliverable',
        'invalid recipient',
        'domain does not exist',
        'mailer-daemon',
        'message blocked',
        'spam detected',
        'suspicious domain'
    ];
    return bouncePatterns.some(pattern => errorLower.includes(pattern));
}

async function isEmailBlocked(userId, email) {
    if (!userId || !email) return false;
    try {
        const result = await pool.query(
            "SELECT id FROM blocked_leads WHERE user_id = $1 AND email = $2",
            [userId, email.toLowerCase()]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('[Blocklist] Error checking blocked email:', err.message);
        return false;
    }
}

async function blockEmail(userId, email, reason) {
    if (!userId || !email) return;
    try {
        await pool.query(
            `INSERT INTO blocked_leads (user_id, email, reason) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (user_id, email) DO UPDATE SET reason = EXCLUDED.reason`,
            [userId, email.toLowerCase(), reason || 'bounce']
        );
        console.log(`[Blocklist] ✅ Blocked email: ${maskEmail(email)} (reason: ${reason || 'bounce'})`);
    } catch (error) {
        console.error(`[Blocklist] Failed to block email ${maskEmail(email)}:`, error.message);
    }
}

async function getBlockedEmails(userId) {
    if (!userId) return [];
    try {
        const result = await pool.query(
            "SELECT email FROM blocked_leads WHERE user_id = $1",
            [userId]
        );
        return result.rows.map(row => row.email);
    } catch (error) {
        console.error('[Blocklist] Failed to fetch blocked emails:', error.message);
        return [];
    }
}

function replacePlaceholders(template, lead) {
    if (!template || !lead || typeof lead !== 'object') return '';
    const data = {
        firstName: lead.first_name || lead.firstName || '',
        lastName: lead.last_name || lead.lastName || '',
        fullName: lead.full_name || lead.fullName || '',
        businessName: lead.business_name || lead.businessName || '',
        website: lead.website || '',
        email: lead.email || ''
    };

    return template
        .replace(/\{\{\s*firstName\s*\}\}/gi, data.firstName)
        .replace(/\{\{\s*first\s*name\s*\}\}/gi, data.firstName)
        .replace(/\{firstName\}/gi, data.firstName)
        .replace(/\{\{\s*lastName\s*\}\}/gi, data.lastName)
        .replace(/\{\{\s*last\s*name\s*\}\}/gi, data.lastName)
        .replace(/\{lastName\}/gi, data.lastName)
        .replace(/\{\{\s*fullName\s*\}\}/gi, data.fullName)
        .replace(/\{\{\s*full\s*name\s*\}\}/gi, data.fullName)
        .replace(/\{fullName\}/gi, data.fullName)
        .replace(/\{\{\s*businessName\s*\}\}/gi, data.businessName)
        .replace(/\{\{\s*business\s*name\s*\}\}/gi, data.businessName)
        .replace(/\{businessName\}/gi, data.businessName)
        .replace(/\{\{\s*website\s*\}\}/gi, data.website)
        .replace(/\{website\}/gi, data.website)
        .replace(/\{\{\s*email\s*\}\}/gi, data.email)
        .replace(/\{email\}/gi, data.email);
}

// --- Keep-Alive Mechanism ---

function startKeepAlive() {
    if (keepAliveInterval) {
        console.log('[KeepAlive] Already running');
        return;
    }
    
    console.log('[KeepAlive] Starting internal keep-alive pings every 4 minutes');
    keepAliveInterval = setInterval(async () => {
        try {
            const baseUrl = process.env.SELF_BASE_URL || `http://localhost:${PORT}`;
            await fetch(`${baseUrl}/health`);
            console.log(`[KeepAlive] Ping sent at ${new Date().toISOString()}`);
        } catch (err) {
            console.error('[KeepAlive] Ping failed:', err.message);
        }
    }, KEEP_ALIVE_INTERVAL_MS);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        console.log('[KeepAlive] Stopping keep-alive pings');
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

// --- Campaign Progress Updates ---

async function updateCampaignProgress(campaignId, leadsSent, lastLeadIndex, status = null) {
    try {
        if (status) {
            await pool.query(
                "UPDATE campaigns SET leads_sent = $1, last_lead_index = $2, campaign_status = $3 WHERE id = $4",
                [leadsSent, lastLeadIndex, status, campaignId]
            );
        } else {
            await pool.query(
                "UPDATE campaigns SET leads_sent = $1, last_lead_index = $2 WHERE id = $3",
                [leadsSent, lastLeadIndex, campaignId]
            );
        }
    } catch (err) {
        console.error(`[Campaign Progress] Error updating campaign ${campaignId}:`, err.message);
    }
}

// --- Resume Interrupted Campaigns ---

async function resumeInterruptedCampaigns() {
    console.log(`[${new Date().toISOString()}] Checking for interrupted campaigns...`);
    
    try {
        const result = await pool.query(
            `SELECT id, name, total_leads, leads_sent, campaign_status 
             FROM campaigns 
             WHERE status = 'RUNNING' AND campaign_status = 'running' 
             LIMIT 10`
        );
        const runningCampaigns = result.rows;
        
        if (!runningCampaigns || runningCampaigns.length === 0) {
            console.log('[Resume] No interrupted campaigns found');
            return;
        }
        
        console.log(`[Resume] Found ${runningCampaigns.length} interrupted campaign(s) to resume`);
        
        for (const campaign of runningCampaigns) {
            if (campaign.leads_sent < campaign.total_leads) {
                console.log(`[Resume] Resuming campaign ${campaign.id} (${campaign.name}) from lead ${campaign.leads_sent + 1} of ${campaign.total_leads}`);
                await processCampaign(campaign.id, campaign.leads_sent);
            } else {
                console.log(`[Resume] Campaign ${campaign.id} already complete, marking as completed`);
                await pool.query(
                    "UPDATE campaigns SET campaign_status = 'completed', status = 'COMPLETED' WHERE id = $1",
                    [campaign.id]
                );
            }
        }
    } catch (err) {
        console.error('[Resume] Error resuming campaigns:', err.message);
    }
}

// --- Core Sending Logic ---

async function processCampaign(campaignId, startFromIndex = 0) {
    console.log(`[Campaign ${campaignId}] Starting from index ${startFromIndex}`);
    
    // Mark campaign as running
    await updateCampaignProgress(campaignId, startFromIndex, startFromIndex, 'running');
    
    // Start keep-alive
    startKeepAlive();
    
    let leadsSent = startFromIndex;
    let leadsFailed = 0;
    
    try {
        // Fetch campaign details and user settings for the owner
        const campResult = await pool.query(
            'SELECT user_id FROM campaigns WHERE id = $1',
            [campaignId]
        );
        const campaign = campResult.rows[0];

        if (!campaign) {
            console.error(`[Campaign ${campaignId}] Campaign owner not found`);
            await updateCampaignProgress(campaignId, leadsSent, startFromIndex, 'failed');
            return { success: false, error: 'Campaign owner not found' };
        }

        const settingsResult = await pool.query(
            'SELECT * FROM user_settings WHERE user_id = $1',
            [campaign.user_id]
        );
        const userSettings = settingsResult.rows[0];

        // Recovery: reset any PROCESSING leads back to PENDING (from crashed runs)
        const recoveryResult = await pool.query(
            "UPDATE leads SET status = 'PENDING' WHERE campaign_id = $1 AND status = 'PROCESSING' RETURNING id",
            [campaignId]
        );
        const staleProcessing = recoveryResult.rows;
        
        if (staleProcessing?.length > 0) {
            console.log(`[Campaign ${campaignId}] Recovered ${staleProcessing.length} stale PROCESSING leads`);
        }

        // Fetch ALL leads for this campaign that are PENDING
        const leadsResult = await pool.query(
            `SELECT l.*, c.status AS c_status, c.subject AS c_subject, c.body AS c_body, 
                    c.min_delay AS c_min_delay, c.max_delay AS c_max_delay, c.sender_display_name AS c_sender_display_name
             FROM leads l
             INNER JOIN campaigns c ON l.campaign_id = c.id
             WHERE l.campaign_id = $1 AND l.status = 'PENDING'
             ORDER BY l.created_at ASC`,
            [campaignId]
        );
        
        const allLeads = leadsResult.rows.map(row => ({
            ...row,
            campaigns: {
                status: row.c_status,
                subject: row.c_subject,
                body: row.c_body,
                min_delay: row.c_min_delay,
                max_delay: row.c_max_delay,
                sender_display_name: row.c_sender_display_name
            }
        }));
            
        if (!allLeads || allLeads.length === 0) {
            console.log(`[Campaign ${campaignId}] No pending leads found`);
            await updateCampaignProgress(campaignId, leadsSent, startFromIndex, 'completed');
            return { success: true, sent: 0, failed: 0 };
        }
        
        // Skip to startFromIndex
        const leadsToProcess = allLeads.slice(startFromIndex);
        console.log(`[Campaign ${campaignId}] Processing ${leadsToProcess.length} leads (starting from index ${startFromIndex})`);
        
        // Process in chunks
        for (let chunkStart = 0; chunkStart < leadsToProcess.length; chunkStart += CHUNK_SIZE) {
            const chunk = leadsToProcess.slice(chunkStart, chunkStart + CHUNK_SIZE);
            const currentIndex = startFromIndex + chunkStart;
            
            console.log(`[Campaign ${campaignId}] Processing chunk ${Math.floor(chunkStart / CHUNK_SIZE) + 1}: leads ${currentIndex + 1} to ${currentIndex + chunk.length}`);
            
            // Process each lead in the chunk
            for (let i = 0; i < chunk.length; i++) {
                const lead = chunk[i];
                const leadGlobalIndex = currentIndex + i;
                
                console.log(`[Campaign ${campaignId}] >>> Starting send to lead ${leadGlobalIndex + 1}/${allLeads.length}: ${maskEmail(lead.email)}`);
                
                // Check if already blocked or already sent (fresh per-lead check)
                const existingResult = await pool.query(
                    'SELECT id, status FROM leads WHERE id = $1',
                    [lead.id]
                );
                const existingLead = existingResult.rows[0];
                
                if (existingLead?.status === 'BLOCKED' || existingLead?.status === 'SENT') {
                    console.log(`[Campaign ${campaignId}] ⏭ Lead ${maskEmail(lead.email)} already ${existingLead.status}, skipping`);
                    continue;
                }
                
                // Idempotency lock: try to claim this lead with PROCESSING status
                // Only claims if still PENDING — prevents duplicate sends from concurrent triggers
                const claimResult = await pool.query(
                    "UPDATE leads SET status = 'PROCESSING' WHERE id = $1 AND status = 'PENDING' RETURNING id",
                    [lead.id]
                );
                const claimed = claimResult.rows[0];
                
                if (!claimed) {
                    console.log(`[Campaign ${campaignId}] ⏭ Lead ${maskEmail(lead.email)} already claimed by another process, skipping`);
                    continue;
                }

                
                // Check Send Window - only if explicitly enabled
                if (userSettings && userSettings.send_window_enabled === true) {
                    const now = new Date();
                    const timezone = userSettings.timezone || 'UTC';
                    
                    // Get current time in user's timezone
                    const userTimeStr = now.toLocaleTimeString('en-US', { 
                        timeZone: timezone, 
                        hour12: false, 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                    
                    const from = userSettings.send_window_from || '09:00';
                    const to = userSettings.send_window_to || '17:00';
                    
                    if (userTimeStr < from || userTimeStr > to) {
                        console.log(`[Campaign ${campaignId}] ⏳ Outside send window (${from} - ${to}). Current user time: ${userTimeStr}. Waiting...`);
                        
                        // Stop the campaign processing for now - it will be resumed by the cron
                        await updateCampaignProgress(campaignId, leadsSent, leadGlobalIndex, 'idle');
                        return { success: true, message: 'Paused - outside send window', paused: true };
                    }
                }
                
                try {
                    // Resolve sender account
                    const accResult = await pool.query(
                        'SELECT * FROM sender_accounts WHERE id = $1',
                        [lead.sender_account_id]
                    );
                    const account = accResult.rows[0];
                    
                    if (!account) {
                        console.error(`[Campaign ${campaignId}] ❌ Lead ${maskEmail(lead.email)}: Sender account not found`);
                        await pool.query(
                            "UPDATE leads SET status = 'FAILED', error_message = 'Sender account not found or deleted.' WHERE id = $1",
                            [lead.id]
                        );
                        
                        await pool.query(
                            `INSERT INTO email_logs (campaign_id, lead_id, sender_account_id, subject, status, error_message, retry_count) 
                             VALUES ($1, $2, $3, $4, 'FAILED', 'Sender account not found or deleted.', 0)`,
                            [lead.campaign_id, lead.id, lead.sender_account_id, lead.campaigns?.subject || '']
                        );
                        
                        leadsFailed++;
                        console.log(`[Campaign ${campaignId}] <<< Failed lead ${maskEmail(lead.email)}: Sender account not found`);
                        
                        // Save progress after each failure
                        await updateCampaignProgress(campaignId, leadsSent, leadGlobalIndex + 1);
                        continue;
                    }
                    
                    // Validate Email
                    const validation = await validateEmail(lead.email);
                    if (!validation.valid) {
                        console.warn(`[Campaign ${campaignId}] ❌ Lead ${maskEmail(lead.email)}: Validation failed - ${validation.reason}`);
                        
                        // Block invalid emails
                        await blockEmail(campaign.user_id, lead.email, `Validation: ${validation.reason}`);
                        
                        await pool.query(
                            "UPDATE leads SET status = 'BLOCKED', error_message = $1 WHERE id = $2",
                            [`Validation failed: ${validation.reason}`, lead.id]
                        );
                        
                        await pool.query(
                            `INSERT INTO email_logs (campaign_id, lead_id, sender_account_id, subject, status, error_message, retry_count) 
                             VALUES ($1, $2, $3, $4, 'BLOCKED', $5, 0)`,
                            [lead.campaign_id, lead.id, lead.sender_account_id, lead.campaigns?.subject || '', `Validation failed: ${validation.reason} (${validation.type})`]
                        );
                        
                        leadsFailed++;
                        console.log(`[Campaign ${campaignId}] <<< Failed lead ${maskEmail(lead.email)}: ${validation.reason}`);
                        
                        // Save progress after each failure
                        await updateCampaignProgress(campaignId, leadsSent, leadGlobalIndex + 1);
                        continue;
                    }
                    
                    // Send Email - wrapped in try/catch
                    const personalizedSubject = lead.personalized_subject || replacePlaceholders(lead.campaigns?.subject, lead);
                    const personalizedBody = lead.personalized_body || replacePlaceholders(lead.campaigns?.body, lead);
                    
                    console.log(`[Campaign ${campaignId}] Attempting to send email to ${maskEmail(lead.email)}...`);
                    
                    const result = await sendEmail({
                        campaign_id: lead.campaign_id,
                        lead_id: lead.id,
                        sender_account: {
                            ...account,
                            app_password: process.env.EMAIL_PASS || account.app_password
                        },
                        to: lead.email,
                        subject: personalizedSubject,
                        body: personalizedBody,
                        sender_display_name: lead.campaigns?.sender_display_name || null
                    });
                    
                    if (result.success) {
                        leadsSent++;
                        console.log(`[Campaign ${campaignId}] <<< ✅ SUCCESS: Email sent to ${maskEmail(lead.email)} (messageId: ${result.messageId})`);
                    } else {
                        leadsFailed++;
                        console.log(`[Campaign ${campaignId}] <<< ❌ FAILED: Email send failed for ${maskEmail(lead.email)}: ${result.error}`);
                        
                        // Check if it's a bounce and block the email
                        if (isBounceError(result.error)) {
                            await blockEmail(campaign.user_id, lead.email, result.error);
                            await pool.query(
                                "UPDATE leads SET status = 'BLOCKED', error_message = $1 WHERE id = $2",
                                [`Blocked: ${result.error}`, lead.id]
                            );
                        }
                    }
                    
                    // Save progress after each lead
                    await updateCampaignProgress(campaignId, leadsSent, leadGlobalIndex + 1);
                    
                    // Wait between emails (randomized delay)
                    const minDelay = (lead.campaigns?.min_delay || 5) * 60 * 1000;
                    const maxDelay = (lead.campaigns?.max_delay || 15) * 60 * 1000;
                    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                    console.log(`[Campaign ${campaignId}] Waiting ${Math.round(delay / 1000)}s before next email...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                } catch (error) {
                    // Catch any unexpected errors for this specific lead
                    leadsFailed++;
                    console.error(`[Campaign ${campaignId}] <<< ❌ ERROR for ${maskEmail(lead.email)}:`, error.message);
                    
                    // Check if it's a bounce and block the email
                    const isBounce = isBounceError(error.message);
                    if (isBounce) {
                        await blockEmail(campaign.user_id, lead.email, error.message);
                    }
                    
                    try {
                        await pool.query(
                            "UPDATE leads SET status = $1, error_message = $2 WHERE id = $3",
                            [isBounce ? 'BLOCKED' : 'FAILED', isBounce ? `Blocked: ${error.message}` : error.message, lead.id]
                        );
                        
                        await pool.query(
                            `INSERT INTO email_logs (campaign_id, lead_id, sender_account_id, subject, status, error_message, retry_count) 
                             VALUES ($1, $2, $3, $4, $5, $6, 0)`,
                            [lead.campaign_id, lead.id, lead.sender_account_id, lead.campaigns?.subject || '', isBounce ? 'BLOCKED' : 'FAILED', isBounce ? `Blocked: ${error.message}` : error.message]
                        );
                    } catch (dbError) {
                        console.error(`[Campaign ${campaignId}] Failed to log error for ${maskEmail(lead.email)}:`, dbError.message);
                    }
                    
                    // Save progress after each failure
                    await updateCampaignProgress(campaignId, leadsSent, leadGlobalIndex + 1);
                    // Continue to next lead - do not stop the campaign
                }
            }
            
            // Delay between chunks
            if (chunkStart + CHUNK_SIZE < leadsToProcess.length) {
                console.log(`[Campaign ${campaignId}] Chunk complete. Waiting ${CHUNK_DELAY_MS / 1000}s before next chunk...`);
                await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));
            }
        }
        
        // Campaign complete
        console.log(`[Campaign ${campaignId}] ✅ Campaign completed. ${leadsSent} sent, ${leadsFailed} failed.`);
        
        await updateCampaignProgress(campaignId, leadsSent, leadsSent + leadsFailed, 'completed');
        
        // Update main status to COMPLETED
        await pool.query(
            "UPDATE campaigns SET status = 'COMPLETED' WHERE id = $1",
            [campaignId]
        );
        
        return { success: true, sent: leadsSent, failed: leadsFailed };
        
    } catch (error) {
        console.error(`[Campaign ${campaignId}] ❌ CRITICAL ERROR:`, error.message);
        await updateCampaignProgress(campaignId, leadsSent, leadsSent, 'failed');
        return { success: false, error: error.message };
    } finally {
        stopKeepAlive();
    }
}

// --- Legacy function for backwards compatibility ---

async function runCampaignAutomation() {
    console.log(`[${new Date().toISOString()}] Starting automation cycle...`);

    try {
        // Check for interrupted campaigns first
        await resumeInterruptedCampaigns();

        // Find campaigns that need to run
        const campaignsResult = await pool.query(
            `SELECT id, name, total_leads, leads_sent, campaign_status 
             FROM campaigns 
             WHERE status = 'RUNNING' AND (campaign_status = 'idle' OR campaign_status IS NULL) 
             LIMIT 10`
        );
        const campaignsToRun = campaignsResult.rows;
        
        if (!campaignsToRun || campaignsToRun.length === 0) {
            console.log(`[${new Date().toISOString()}] No campaigns found in 'RUNNING' status with 'idle' campaign_status.`);
            
            // Diagnostics: check if there are ANY running campaigns (maybe they have wrong campaign_status)
            const allRunningResult = await pool.query(
                "SELECT id, campaign_status FROM campaigns WHERE status = 'RUNNING'"
            );
            const allRunning = allRunningResult.rows;
            
            if (allRunning && allRunning.length > 0) {
                console.log(`[Diagnostics] Found ${allRunning.length} campaigns in 'RUNNING' status but none are 'idle'. Statuses: ${allRunning.map(c => c.campaign_status).join(', ')}`);
            } else {
                 console.log(`[Diagnostics] No campaigns in 'RUNNING' status found at all.`);
            }
        } else {
            for (const campaign of campaignsToRun) {
                console.log(`Starting campaign: ${campaign.name} (${campaign.id})`);
                await processCampaign(campaign.id, 0);
            }
        }

        // Check for any remaining PENDING leads in running campaigns (edge case)
        const pendingResult = await pool.query(
            "SELECT campaign_id FROM leads WHERE status = 'PENDING' LIMIT 50"
        );
        const pendingLeads = pendingResult.rows;
            
        if (pendingLeads && pendingLeads.length > 0) {
            const campaignIds = [...new Set(pendingLeads.map(l => l.campaign_id))];
            for (const cid of campaignIds) {
                const campResult = await pool.query(
                    "SELECT id, leads_sent, campaign_status FROM campaigns WHERE id = $1",
                    [cid]
                );
                const camp = campResult.rows[0];
                if (camp && (camp.campaign_status === 'running')) {
                    console.log(`Found pending leads for running campaign ${cid}, resuming...`);
                    await processCampaign(cid, camp.leads_sent || 0);
                }
            }
        }

        console.log('Automation cycle completed.');
    } catch (error) {
        console.error('Automation cycle failed:', error.message);
    }
}

// --- Trigger Routes ---

app.post('/trigger', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Manual automation trigger received.`);

    const results = {};

    // Run campaign automation
    try {
        await runCampaignAutomation();
        results.automation = { success: true };
    } catch (error) {
        console.error('[Trigger] Campaign automation failed:', error.message);
        results.automation = { success: false, error: error.message };
    }

    // Check replies
    try {
        await checkReplies();
        results.replies = { success: true };
    } catch (error) {
        console.error('[Trigger] Check replies failed:', error.message);
        results.replies = { success: false, error: error.message };
    }

    // Process warmup jobs from database
    try {
        await processWarmupJobs();
        results.warmupJobs = { success: true };
    } catch (error) {
        console.error('[Trigger] Process warmup jobs failed:', error.message);
        results.warmupJobs = { success: false, error: error.message };
    }

    // Independent reply polling loop
    try {
        await pollInboxForReplies();
        results.replyPoll = { success: true };
    } catch (error) {
        console.error('[Trigger] Reply polling failed:', error.message);
        results.replyPoll = { success: false, error: error.message };
    }

    // Process pending replies
    try {
        await processPendingReplies();
        results.pendingReplies = { success: true };
    } catch (error) {
        console.error('[Trigger] Process pending replies failed:', error.message);
        results.pendingReplies = { success: false, error: error.message };
    }

    // Run spam rescue
    try {
        await processSpamRescue();
        results.spamRescue = { success: true };
    } catch (error) {
        console.error('[Trigger] Spam rescue failed:', error.message);
        results.spamRescue = { success: false, error: error.message };
    }

    // Return success if at least one function succeeded
    const allFailed = Object.values(results).every(r => !r.success);
    if (allFailed) {
        console.error('[Trigger] All automation functions failed');
        return res.status(500).json({ 
            error: 'All automation functions failed',
            details: results
        });
    }

    res.json({
        success: true,
        message: 'Automation triggered with partial results',
        results
    });
});

// --- Campaign Trigger Endpoint ---

app.post('/campaign/:id/run', async (req, res) => {
    const campaignId = req.params.id;
    console.log(`[${new Date().toISOString()}] Campaign run triggered for ${campaignId}`);
    
    try {
        // Verify campaign exists and is in RUNNING status
        const campResult = await pool.query(
            'SELECT id, status, total_leads, campaign_status, leads_sent FROM campaigns WHERE id = $1',
            [campaignId]
        );
        const campaign = campResult.rows[0];
            
        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        
        if (campaign.status !== 'RUNNING') {
            return res.status(400).json({ error: 'Campaign is not in RUNNING status' });
        }
        
        // Start the campaign
        const startIndex = campaign.leads_sent || 0;
        await processCampaign(campaignId, startIndex);
        
        res.json({
            success: true,
            message: `Campaign ${campaignId} started from lead ${startIndex + 1}`
        });
    } catch (error) {
        console.error('Campaign trigger error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Warmup Routes ---

// POST /warmup/start
app.post('/warmup/start', authenticateRequest, async (req, res) => {
    try {
        const { gmail_account_id, mode = 'own_only', duration = 30 } = req.body;

        if (!gmail_account_id) {
            return res.status(400).json({ error: 'gmail_account_id is required' });
        }

        const ownership = await verifyAccountOwnership(req.user.userId, gmail_account_id);
        if (!ownership.success) {
            return res.status(ownership.status).json({ error: ownership.error });
        }

        const warmupAccount = await startWarmup(gmail_account_id, mode, duration);

        res.json({ success: true, data: warmupAccount });
    } catch (error) {
        console.error('[Warmup Start] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /warmup/pause
app.post('/warmup/pause', authenticateRequest, async (req, res) => {
    try {
        const { warmup_account_id } = req.body;

        if (!warmup_account_id) {
            return res.status(400).json({ error: 'warmup_account_id is required' });
        }

        const ownership = await verifyAccountOwnership(req.user.userId, warmup_account_id, 'warmup_accounts');
        if (!ownership.success) {
            return res.status(ownership.status).json({ error: ownership.error });
        }

        const warmupAccount = await pauseWarmup(warmup_account_id);

        res.json({ success: true, data: warmupAccount });
    } catch (error) {
        console.error('[Warmup Pause] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /warmup/resume
app.post('/warmup/resume', authenticateRequest, async (req, res) => {
    try {
        const { warmup_account_id } = req.body;

        if (!warmup_account_id) {
            return res.status(400).json({ error: 'warmup_account_id is required' });
        }

        const ownership = await verifyAccountOwnership(req.user.userId, warmup_account_id, 'warmup_accounts');
        if (!ownership.success) {
            return res.status(ownership.status).json({ error: ownership.error });
        }

        const warmupAccount = await resumeWarmup(warmup_account_id);

        res.json({ success: true, data: warmupAccount });
    } catch (error) {
        console.error('[Warmup Resume] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /warmup/trigger - Manually trigger a single warmup cycle for testing
app.post('/warmup/trigger', authenticateRequest, async (req, res) => {
    try {
        const { warmup_account_id, test_mode } = req.body;

        if (!warmup_account_id) {
            return res.status(400).json({ error: 'warmup_account_id is required' });
        }

        const ownership = await verifyAccountOwnership(req.user.userId, warmup_account_id, 'warmup_accounts');
        if (!ownership.success) {
            return res.status(ownership.status).json({ error: ownership.error });
        }

        const accResult = await pool.query(
            'SELECT * FROM warmup_accounts WHERE id = $1',
            [warmup_account_id]
        );
        const account = accResult.rows[0];

        if (!account) {
            return res.status(404).json({ error: 'Warmup account not found' });
        }

        if (account.status !== 'warming') {
            return res.status(400).json({ error: 'Account is not currently warming up' });
        }

        const isTestMode = test_mode === true;
        console.log(`[Trigger] Starting warmup cycle for account ${account.id} (${account.gmail_email})${isTestMode ? ' [TEST MODE - Reply in 1-2 min]' : ''}`);
        await runWarmupCycle(account, isTestMode);
        console.log(`[Trigger] Warmup cycle completed for account ${account.id}`);

        res.json({ 
            success: true, 
            message: 'Warmup cycle completed successfully',
            test_mode: isTestMode,
            reply_delay: isTestMode ? '1-2 minutes' : '8-30 minutes (normal)'
        });
    } catch (error) {
        console.error('[Warmup Trigger] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /warmup/schedule - Trigger daily job scheduling (saves jobs to database)
app.post('/warmup/schedule', authenticateRequest, async (req, res) => {
    try {
        console.log(`[Schedule] Starting daily warmup scheduling at ${new Date().toISOString()}`);
        await runDailyWarmupCycle();
        console.log(`[Schedule] Daily warmup scheduling complete`);
        res.json({ success: true, message: 'Daily jobs scheduled' });
    } catch (error) {
        console.error('[Schedule] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /warmup/accounts
app.get('/warmup/accounts', authenticateRequest, async (req, res) => {
    try {
        const accounts = await getUserWarmupAccounts(req.user.userId);
        res.json({ success: true, data: accounts });
    } catch (error) {
        console.error('[Warmup Accounts] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /warmup/stats/:account_id
app.get('/warmup/stats/:account_id', authenticateRequest, async (req, res) => {
    try {
        const accountId = req.params.account_id;
        const days = parseInt(req.query.days) || 14;

        if (!accountId) {
            return res.status(400).json({ error: 'account_id is required' });
        }

        const ownership = await verifyAccountOwnership(req.user.userId, accountId, 'warmup_accounts');
        if (!ownership.success) {
            return res.status(ownership.status).json({ error: ownership.error });
        }

        const stats = await getWarmupStats(accountId, days);

        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('[Warmup Stats] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /warmup/stats/aggregate
app.get('/warmup/stats/aggregate', authenticateRequest, async (req, res) => {
    try {
        const stats = await getUserAggregateStats(req.user.userId);
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('[Warmup Aggregate Stats] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// PATCH /warmup/mode
app.patch('/warmup/mode', authenticateRequest, async (req, res) => {
    try {
        const { warmup_account_id, mode } = req.body;

        if (!warmup_account_id) {
            return res.status(400).json({ error: 'warmup_account_id is required' });
        }

        if (!mode || !['own_only', 'network'].includes(mode)) {
            return res.status(400).json({ error: 'mode is required and must be "own_only" or "network"' });
        }

        const ownership = await verifyAccountOwnership(req.user.userId, warmup_account_id, 'warmup_accounts');
        if (!ownership.success) {
            return res.status(ownership.status).json({ error: ownership.error });
        }

        const warmupAccount = await updateWarmupMode(warmup_account_id, mode);

        res.json({ success: true, data: warmupAccount });
    } catch (error) {
        console.error('[Warmup Mode] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /warmup/network-opt-in
app.post('/warmup/network-opt-in', authenticateRequest, async (req, res) => {
    try {
        const result = await setNetworkOptIn(req.user.userId);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[Warmup Network Opt-In] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /warmup/network-opt-out
app.post('/warmup/network-opt-out', authenticateRequest, async (req, res) => {
    try {
        const result = await setNetworkOptOut(req.user.userId);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[Warmup Network Opt-Out] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /warmup/network-status
app.get('/warmup/network-status', authenticateRequest, async (req, res) => {
    try {
        const userId = req.user.userId;
        const status = await getNetworkOptStatus(userId);
        res.json({ success: true, data: { network_opt_in: status } });
    } catch (error) {
        console.error('[Warmup Network Status] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Scheduling ---

// Main campaign automation - runs every 5 minutes (or as configured)
cron.schedule(CRON_SCHEDULE, () => {
    runCampaignAutomation();
    checkReplies();
});

// Token refresh + reply polling - runs every 15 minutes
cron.schedule('*/15 * * * *', () => {
    refreshExpiringTokens();
    console.log('[Reply Poll] Running independent reply polling...');
    pollInboxForReplies();
});

// Process warmup jobs - runs every 5 minutes to send emails
cron.schedule('*/5 * * * *', () => {
    console.log('[Warmup Jobs] Running job processor...');
    processWarmupJobs();
});

// Process pending replies - runs every 5 minutes (sends already-scheduled replies)
cron.schedule('*/5 * * * *', () => {
    processPendingReplies();
});

// Spam rescue - runs every 5 minutes to rescue warmup emails from spam
cron.schedule('*/5 * * * *', () => {
    console.log('[Spam Rescue] Running spam rescue check...');
    processSpamRescue();
});

// POST /warmup/process-jobs - Manually trigger job processing
app.post('/warmup/process-jobs', authenticateRequest, async (req, res) => {
    try {
        await processWarmupJobs();
        await pollInboxForReplies();
        await processPendingReplies();
        res.json({ success: true, message: 'Jobs processed' });
    } catch (error) {
        console.error('[Warmup Jobs] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /warmup/spam-rescue - Manually trigger spam rescue
app.post('/warmup/spam-rescue', authenticateRequest, async (req, res) => {
    try {
        const result = await processSpamRescue();
        res.json({ success: true, message: 'Spam rescue completed', result });
    } catch (error) {
        console.error('[Spam Rescue] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Daily warmup cycle - runs every day at 6 AM UTC (12 PM IST)
cron.schedule('0 6 * * *', () => {
    console.log('[Warmup] Starting daily warmup cycle...');
    runDailyWarmupCycle();
});

// --- Server Startup ---

// --- Setup Routes ---

app.post('/setup/drafts', async (req, res) => {
    try {
        await pool.query("SELECT id FROM drafts LIMIT 1");
        return res.json({ success: true, message: "Drafts table ready" });
    } catch (error) {
        console.log('Drafts table does not exist:', error.message);
        res.json({ success: false, message: "Table not found - create manually in database" });
    }
});

app.post('/setup/migrate', async (req, res) => {
    try {
        await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS send_window_enabled BOOLEAN DEFAULT true;`);
        res.json({ success: true, message: "Migration successful - send_window_enabled added" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Cron schedule set to: ${CRON_SCHEDULE}`);
    
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

    console.log(`[Diagnostics] GOOGLE_CLIENT_ID: ${clientId ? `SET (len: ${clientId.length}, prefix: ${clientId.substring(0, 10)}...)` : 'MISSING'}`);
    console.log(`[Diagnostics] GOOGLE_CLIENT_SECRET: ${clientSecret ? `SET (len: ${clientSecret.length}, prefix: ${clientSecret.substring(0, 5)}...)` : 'MISSING'}`);
    console.log(`[Diagnostics] ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? 'SET' : 'USING DEFAULT'}`);
    
    // Check for interrupted campaigns on startup
    setTimeout(() => {
        resumeInterruptedCampaigns();
    }, 5000);
});
