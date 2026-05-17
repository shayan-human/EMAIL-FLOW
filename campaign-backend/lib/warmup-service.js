const { pool } = require('./db');
const { generateWarmupEmail, getRandomPersona } = require('./ollama-client');
const { sendWarmupEmail, fetchMessage, modifyLabels, sendReply, fetchRfcMessageId, findMessageByRfcId } = require('./gmail-warmup');
const { decrypt } = require('./encryption');
const { processSpamRescue } = require('./spam-rescue-service');
const { maskEmail } = require('./log-utils');

const DAILY_TARGETS = {
    5:  [5, 8, 12, 18, 22],
    10: [3, 5, 8, 12, 16, 20, 25, 28, 32, 35],
    20: [2, 3, 5, 7, 9, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 31, 32, 33, 34, 35],
    30: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 31, 32, 33, 34, 35, 34, 35, 33],
    40: [2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 34, 35, 33, 34]
};

const REPLY_RATE = 0.75;
const OFF_HOURS_START = 8, OFF_HOURS_END = 21;

function getReplyDelayMinutes(testMode = false) {
    if (testMode) {
        return Math.floor(Math.random() * (2 - 1 + 1)) + 1; // 1-2 minutes for testing
    }
    const now = new Date();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    if (isWeekend) {
        return Math.floor(Math.random() * (60 - 20 + 1)) + 20;
    } else {
        return Math.floor(Math.random() * (30 - 8 + 1)) + 8;
    }
}

function isWithinActiveHours(now) {
    const hours = now.getUTCHours();
    return hours >= OFF_HOURS_START && hours < OFF_HOURS_END;
}

function getNextActiveTime(now) {
    const next = new Date(now);
    if (now.getUTCHours() >= OFF_HOURS_END) {
        next.setUTCDate(next.getUTCDate() + 1);
    }
    next.setUTCHours(OFF_HOURS_START, 0, 0, 0);
    return next;
}

function shouldSendReply() {
    return Math.random() < REPLY_RATE;
}

function getDailyTarget(dayNumber, duration) {
    const targets = DAILY_TARGETS[duration] || DAILY_TARGETS[30];
    const index = dayNumber - 1;
    if (index >= targets.length) {
        return targets[targets.length - 1];
    }
    return targets[index];
}

function calculateDailyTarget(dayNumber) {
    if (dayNumber <= 5) return 3;
    if (dayNumber <= 10) return 7;
    if (dayNumber <= 15) return 12;
    if (dayNumber <= 20) return 18;
    if (dayNumber <= 30) return 25;
    if (dayNumber <= 40) return 35;
    return 35; // Cap at 35
}

/**
 * Pause warmup for an account
 */
async function scheduleDayOneJobs(warmupAccountRecord, duration) {
    let existingJobs = [];
    try {
        const result = await pool.query(
            "SELECT id FROM warmup_jobs WHERE warmup_account_id = $1 AND day_number = 1 AND status = 'pending'",
            [warmupAccountRecord.id]
        );
        existingJobs = result.rows;
    } catch (err) {
        console.error(`[Warmup] Error checking existing jobs:`, err.message);
    }
    
    if (existingJobs && existingJobs.length > 0) {
        console.log(`[Warmup] Day 1 jobs already exist for account ${warmupAccountRecord.id} (${existingJobs.length} jobs), skipping`);
        return;
    }

    const dailyTarget = getDailyTarget(1, duration);
    const startOffset = Math.floor(Math.random() * 31) + 30; // 30-60 mins from now
    const windowStart = new Date(Date.now() + startOffset * 60 * 1000);

    const jobsToInsert = [];
    let lastScheduled = new Date(windowStart);

    for (let i = 0; i < dailyTarget; i++) {
        if (i > 0) {
            const gap = Math.floor(Math.random() * 13) + 8; // 8-20 mins
            lastScheduled = new Date(lastScheduled.getTime() + gap * 60 * 1000);
        }
        const recipient = await pickRecipient(warmupAccountRecord);
        jobsToInsert.push({
            warmup_account_id: warmupAccountRecord.id,
            type: 'warmup',
            to_account_id: recipient.id,
            scheduled_at: lastScheduled.toISOString(),
            status: 'pending',
            day_number: 1,
        });
    }

    if (jobsToInsert.length > 0) {
        try {
            const values = [];
            const placeholders = [];
            let pIdx = 1;
            for (const job of jobsToInsert) {
                placeholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5})`);
                values.push(job.warmup_account_id, job.type, job.to_account_id, job.scheduled_at, job.status, job.day_number);
                pIdx += 6;
            }
            await pool.query(
                `INSERT INTO warmup_jobs (warmup_account_id, type, to_account_id, scheduled_at, status, day_number) VALUES ${placeholders.join(', ')}`,
                values
            );
            console.log(`[Warmup] Created ${jobsToInsert.length} day-1 jobs for account ${warmupAccountRecord.id} (first at ${jobsToInsert[0].scheduled_at})`);
        } catch (insertError) {
            console.error(`[Warmup] Error inserting day-1 jobs:`, insertError.message);
        }
    }
}

async function startWarmup(gmailAccountId, mode = 'own_only', duration = 30) {
    const accountResult = await pool.query(
        'SELECT id, user_id, email, name, google_access_token, google_refresh_token FROM sender_accounts WHERE id = $1',
        [gmailAccountId]
    );
    const gmailAccount = accountResult.rows[0];

    if (!gmailAccount) {
        throw new Error('Gmail account not found');
    }

    const existingResult = await pool.query(
        'SELECT * FROM warmup_accounts WHERE gmail_account_id = $1',
        [gmailAccountId]
    );
    const existing = existingResult.rows[0];

    if (existing) {
        if (existing.status === 'warming') {
            throw new Error('Account is already warming up');
        }
        const persona = existing.persona || getRandomPersona();
        const updateResult = await pool.query(
            `UPDATE warmup_accounts 
             SET status = 'warming', mode = $1, warmup_duration = $2, day_number = 1, daily_target = $3, started_at = $4, persona = $5
             WHERE id = $6 RETURNING *`,
            [mode, duration, getDailyTarget(1, duration), new Date().toISOString(), persona, existing.id]
        );
        const data = updateResult.rows[0];

        try {
            await scheduleDayOneJobs(data, duration);
        } catch (jobError) {
            console.error(`[Warmup] Warning: could not create day-1 jobs for account ${data.id}:`, jobError.message);
        }

        return data;
    } else {
        const persona = getRandomPersona();
        const insertResult = await pool.query(
            `INSERT INTO warmup_accounts (user_id, gmail_account_id, status, mode, warmup_duration, day_number, daily_target, started_at, persona)
             VALUES ($1, $2, 'warming', $3, $4, 1, $5, $6, $7) RETURNING *`,
            [gmailAccount.user_id, gmailAccountId, mode, duration, getDailyTarget(1, duration), new Date().toISOString(), persona]
        );
        const data = insertResult.rows[0];

        try {
            await scheduleDayOneJobs(data, duration);
        } catch (jobError) {
            console.error(`[Warmup] Warning: could not create day-1 jobs for account ${data.id}:`, jobError.message);
        }

        return data;
    }
}

/**
 * Pause warmup for an account
 */
async function pauseWarmup(warmupAccountId) {
    const result = await pool.query(
        "UPDATE warmup_accounts SET status = 'paused' WHERE id = $1 RETURNING *",
        [warmupAccountId]
    );
    const data = result.rows[0];
    if (!data) throw new Error('Warmup account not found');
    return data;
}

/**
 * Resume warmup for an account
 */
async function resumeWarmup(warmupAccountId) {
    const result = await pool.query(
        "UPDATE warmup_accounts SET status = 'warming' WHERE id = $1 RETURNING *",
        [warmupAccountId]
    );
    const data = result.rows[0];
    if (!data) throw new Error('Warmup account not found');
    return data;
}

/**
 * Get all warmup accounts for a user
 */
async function getUserWarmupAccounts(userId) {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        const result = await pool.query(
            `SELECT wa.*, 
                    sa.email AS sa_email, sa.name AS sa_name,
                    ws.sent AS ws_sent, ws.received AS ws_received, ws.replies AS ws_replies, ws.spam_rescues AS ws_spam_rescues
             FROM warmup_accounts wa
             INNER JOIN sender_accounts sa ON wa.gmail_account_id = sa.id
             LEFT JOIN warmup_stats ws ON wa.id = ws.account_id AND ws.date = $2
             WHERE wa.user_id = $1`,
            [userId, today]
        );
        return result.rows.map(wa => ({
            ...wa,
            gmail_email: wa.sa_email,
            gmail_name: wa.sa_name,
            today_sent: wa.ws_sent || 0,
            today_received: wa.ws_received || 0,
            today_replies: wa.ws_replies || 0,
            today_spam_rescues: wa.ws_spam_rescues || 0,
        }));
    } catch (error) {
        throw error;
    }
}

/**
 * Get warmup stats for an account
 */
async function getWarmupStats(accountId, days = 14) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
        const result = await pool.query(
            `SELECT * FROM warmup_stats 
             WHERE account_id = $1 AND date >= $2 
             ORDER BY date DESC`,
            [accountId, startDate.toISOString().split('T')[0]]
        );
        return result.rows || [];
    } catch (error) {
        throw error;
    }
}

/**
 * Get aggregate stats across all warmup accounts for a user
 */
async function getUserAggregateStats(userId) {
    let accounts = [];
    try {
        const result = await pool.query(
            'SELECT id, status FROM warmup_accounts WHERE user_id = $1',
            [userId]
        );
        accounts = result.rows;
    } catch (accountsError) {
        throw accountsError;
    }

    const accountIds = accounts?.map(a => a.id) || [];
    
    // Count by status
    let warmedUpAccounts = 0;
    let activeAccounts = 0;
    let pausedAccounts = 0;
    let notStartedAccounts = 0;

    accounts?.forEach(a => {
        if (a.status === 'warmed') warmedUpAccounts++;
        else if (a.status === 'warming') activeAccounts++;
        else if (a.status === 'paused') pausedAccounts++;
        else if (a.status === 'inactive') notStartedAccounts++;
    });

    // If no accounts, return zeros
    if (accountIds.length === 0) {
        return {
            totalAccounts: 0,
            warmedUpAccounts: 0,
            activeAccounts: 0,
            pausedAccounts: 0,
            notStartedAccounts: 0,
            totalSent: 0,
            totalReceived: 0,
            totalReplies: 0,
            totalSpamRescues: 0,
        };
    }

    let stats = [];
    try {
        const result = await pool.query(
            'SELECT sent, received, replies, spam_rescues FROM warmup_stats WHERE account_id = ANY($1)',
            [accountIds]
        );
        stats = result.rows;
    } catch (statsError) {
        throw statsError;
    }

    // Sum all stats
    let totalSent = 0;
    let totalReceived = 0;
    let totalReplies = 0;
    let totalSpamRescues = 0;

    stats?.forEach(s => {
        totalSent += s.sent || 0;
        totalReceived += s.received || 0;
        totalReplies += s.replies || 0;
        totalSpamRescues += s.spam_rescues || 0;
    });

    return {
        totalAccounts: accounts?.length || 0,
        warmedUpAccounts,
        activeAccounts,
        pausedAccounts,
        notStartedAccounts,
        totalSent,
        totalReceived,
        totalReplies,
        totalSpamRescues,
    };
}

/**
 * Log a warmup email
 */
async function logWarmupEmail(fromAccountId, toAccountId, gmailMessageId, threadId, subject, status, rfcMessageId, replyContent) {
    try {
        const result = await pool.query(
            `INSERT INTO warmup_emails (
                from_account_id, to_account_id, gmail_message_id, thread_id, 
                subject, status, rfc_message_id, reply_content
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                fromAccountId, toAccountId, gmailMessageId, threadId,
                subject, status, rfcMessageId || null, replyContent || null
            ]
        );
        return result.rows[0];
    } catch (error) {
        throw error;
    }
}

/**
 * Update warmup stats (upsert)
 */
async function updateWarmupStats(accountId, field, increment = 1) {
    const today = new Date().toISOString().split('T')[0];

    try {
        const selectResult = await pool.query(
            'SELECT * FROM warmup_stats WHERE account_id = $1 AND date = $2',
            [accountId, today]
        );
        const existing = selectResult.rows[0];

        if (existing) {
            const newValue = (existing[field] || 0) + increment;
            const updateResult = await pool.query(
                `UPDATE warmup_stats SET ${field} = $1 WHERE id = $2 RETURNING *`,
                [newValue, existing.id]
            );
            return updateResult.rows[0];
        } else {
            const insertResult = await pool.query(
                `INSERT INTO warmup_stats (account_id, date, ${field}) VALUES ($1, $2, $3) RETURNING *`,
                [accountId, today, increment]
            );
            return insertResult.rows[0];
        }
    } catch (error) {
        throw error;
    }
}

/**
 * Get full sender account data with decrypted tokens
 */
async function getFullAccountData(warmupAccount) {
    try {
        const result = await pool.query(
            'SELECT * FROM sender_accounts WHERE id = $1',
            [warmupAccount.gmail_account_id]
        );
        const account = result.rows[0];

        if (!account) {
            throw new Error('Sender account not found');
        }

        // Decrypt tokens
        return {
            ...account,
            google_access_token: decrypt(account.google_access_token),
            google_refresh_token: decrypt(account.google_refresh_token),
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Pick a recipient based on mode
 * Each sender account maintains its own rotation state
 */
const rotationState = new Map(); // Key: senderAccountId, Value: { date, index, accounts }

async function pickRecipient(fromWarmupAccount) {
    const mode = fromWarmupAccount.mode || 'own_only';
    const today = new Date().toISOString().split('T')[0];
    
    // Build base query - ONLY active accounts (warming or warmed) as recipients
    // CRITICAL: Filter out inactive accounts - they can't send replies!
    let queryStr = `
        SELECT wa.*, sa.email AS sa_email
        FROM warmup_accounts wa
        INNER JOIN sender_accounts sa ON wa.gmail_account_id = sa.id
        WHERE wa.status IN ('warming', 'warmed') 
          AND wa.id != $1
    `;
    const queryParams = [fromWarmupAccount.id];
    
    if (mode === 'own_only') {
        queryStr += ' AND wa.user_id = $2';
        queryParams.push(fromWarmupAccount.user_id);
    }
    
    let accounts = [];
    try {
        const result = await pool.query(queryStr, queryParams);
        accounts = result.rows.map(row => ({
            ...row,
            sender_accounts: {
                email: row.sa_email
            }
        }));
    } catch (err) {
        throw err;
    }
    
    if (!accounts || accounts.length === 0) {
        throw new Error('No other accounts available for warmup');
    }
    
    // Filter out same user accounts for network mode
    let eligibleRecipients = accounts;
    if (mode === 'network') {
        const recipientUserIds = [...new Set(accounts.map(a => a.user_id).filter(Boolean))];
        let optedInUsers = [];
        try {
            const optedInResult = await pool.query(
                'SELECT user_id FROM user_settings WHERE user_id = ANY($1) AND network_opt_in = true',
                [recipientUserIds]
            );
            optedInUsers = optedInResult.rows;
        } catch (err) {
            console.error(`[Warmup] Error fetching network opted-in users:`, err.message);
        }

        const optedInUserIds = new Set((optedInUsers || []).map(u => u.user_id));

        eligibleRecipients = accounts.filter(a => a.user_id !== fromWarmupAccount.user_id && optedInUserIds.has(a.user_id));
        if (eligibleRecipients.length === 0) {
            throw new Error('No accounts from other users available for network warmup');
        }
    }
    
    // Sort alphabetically for deterministic order
    const sortedAccounts = [...eligibleRecipients].sort((a, b) => 
        (a.sender_accounts?.email || '').localeCompare(b.sender_accounts?.email || '')
    );
    
    // Get or create rotation state for THIS specific sender account
    let state = rotationState.get(fromWarmupAccount.id);
    
    // Reset rotation if date changed OR if no state exists
    if (!state || state.date !== today) {
        state = { date: today, index: Math.floor(Math.random() * sortedAccounts.length), accounts: sortedAccounts };
        rotationState.set(fromWarmupAccount.id, state);
        console.log(`[Warmup] Round-robin rotation initialized for sender ${fromWarmupAccount.id} on ${today} with ${sortedAccounts.length} accounts`);
    }
    
    // Ensure accounts list is up-to-date (in case new accounts were added)
    if (state.accounts.length !== sortedAccounts.length) {
        state.accounts = sortedAccounts;
    }
    
    // Pick account at current index
    if (state.index >= state.accounts.length) {
        state.index = 0;
    }
    
    const selected = state.accounts[state.index];
    state.index++;
    
    console.log(`[Warmup] Round-robin for sender ${fromWarmupAccount.id}: selected recipient ${selected.id} (${maskEmail(selected.sender_accounts?.email)}) at index ${state.index - 1}`);
    
    return selected;
}

/**
 * Run a single warmup cycle
 */
async function runWarmupCycle(fromWarmupAccount, testMode = false) {
    console.log(`[Warmup] Starting cycle for account ${fromWarmupAccount.id}${testMode ? ' (TEST MODE)' : ''}`);

    try {
        // Step 1: Pick recipient
        const toWarmupAccount = await pickRecipient(fromWarmupAccount);
        console.log(`[Warmup] Selected recipient: ${toWarmupAccount.id} (mode: ${fromWarmupAccount.mode})`);

        // Get full account data for both accounts
        const fromAccount = await getFullAccountData(fromWarmupAccount);
        const toAccount = await getFullAccountData(toWarmupAccount);

        // Get persona for this account
        const persona = fromWarmupAccount.persona || 'casual';
        console.log(`[Warmup] Using persona: ${persona}`);

        // Step 2: Generate email content
        console.log(`[Warmup] Generating email content...`);
        const emailContent = await generateWarmupEmail(persona);
        console.log(`[Warmup] Generated - Subject: ${emailContent.subject}`);

        // Step 3: Send email
        console.log(`[Warmup] Sending email from ${maskEmail(fromAccount.email)} to ${maskEmail(toAccount.email)}...`);
        const result = await sendWarmupEmail(
            fromAccount,
            toAccount.email,
            emailContent.subject,
            emailContent.body
        );

        console.log(`[Warmup] Email sent - messageId: ${result.messageId}, threadId: ${result.threadId}`);

        // Fetch RFC Message-ID for proper reply threading
        const rfcMessageId = await fetchRfcMessageId(fromAccount, result.messageId);
        console.log(`[Warmup] RFC Message-ID: ${rfcMessageId || 'not found'}`);

        // Log the email
        await logWarmupEmail(
            fromWarmupAccount.id,
            toWarmupAccount.id,
            result.messageId,
            result.threadId,
            emailContent.subject,
            'sent',
            rfcMessageId,
            emailContent.reply
        );

        // Update stats - sender sent
        await updateWarmupStats(fromWarmupAccount.id, 'sent', 1);
        // Update stats - recipient received
        await updateWarmupStats(toWarmupAccount.id, 'received', 1);

        // Note: reply scheduling is now handled independently by pollInboxForReplies()

        console.log(`[Warmup] Warmup cycle completed successfully`);
        return { success: true };

    } catch (error) {
        console.error(`[Warmup] Cycle error:`, error.message);
        if (error.message && (
            error.message.includes('invalid_grant') || 
            error.message.includes('Token revoked') ||
            error.message.includes('NO_REFRESH_TOKEN') ||
            error.message.includes('invalid_client'))) {
            console.error(`[Warmup] 🔴 Sender account auth failed, pausing warmup.`);
            await pool.query(
                "UPDATE warmup_accounts SET status = 'paused' WHERE id = $1",
                [fromWarmupAccount.id]
            );
        }
        return { success: false, error: error.message || String(error) };
    }
}

/**
 * Independent reply polling loop — runs every 15 minutes, decoupled from send logic.
 * For each active warming account, detects unreplied warmup emails and schedules replies.
 * Pre-generated reply_content from warmup_emails is used directly (no regeneration).
 */
async function pollInboxForReplies() {
    console.log('[Reply Poll] ✅ Function fired at', new Date().toISOString());
    
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    let accounts = [];
    try {
        const result = await pool.query(
            "SELECT * FROM warmup_accounts WHERE status = 'warming'"
        );
        accounts = result.rows;
    } catch (accountsError) {
        console.error(`[Reply Poll] Error fetching warming accounts:`, accountsError.message);
        return;
    }

    if (!accounts || accounts.length === 0) {
        return;
    }

    console.log(`[Reply Poll] Checking ${accounts.length} account(s) for unreplied emails...`);

    for (const account of accounts) {
        // Find warmup emails received in last 3 days that haven't been scheduled for reply
        // CRITICAL: Only consider emails FROM other active warming accounts
        let unreplied = [];
        try {
            const result = await pool.query(
                `SELECT id, from_account_id, subject, reply_content, rfc_message_id 
                 FROM warmup_emails 
                 WHERE to_account_id = $1 
                   AND status = 'sent' 
                   AND reply_scheduled_at IS NULL 
                   AND created_at >= $2 
                 LIMIT 30`,
                [account.id, threeDaysAgo]
            );
            unreplied = result.rows;
        } catch (unrepliedError) {
            console.error(`[Reply Poll] Error fetching unreplied emails for account ${account.id}:`, unrepliedError.message);
            continue;
        }

        if (!unreplied || unreplied.length === 0) {
            console.log(`[Reply Poll] Account ${account.id}: no unreplied emails from active accounts`);
            continue;
        }

        console.log(`[Reply Poll] Account ${account.id}: ${unreplied.length} unreplied email(s) found`);

        const fromAccountIds = [...new Set(unreplied.map(e => e.from_account_id))];

        // CRITICAL: Only fetch from accounts that are still active (warming or warmed)
        let fromAccounts = [];
        try {
            const result = await pool.query(
                `SELECT id, gmail_account_id, status FROM warmup_accounts 
                 WHERE id = ANY($1) AND status IN ('warming', 'warmed')`,
                [fromAccountIds]
            );
            fromAccounts = result.rows;
        } catch (err) {
            console.error(`[Reply Poll] Error fetching sender accounts:`, err.message);
            continue;
        }

        // Filter out inactive senders - they can't receive replies!
        const activeFromIds = new Set((fromAccounts || []).map(a => a.id));
        const activeUnreplied = unreplied.filter(e => activeFromIds.has(e.from_account_id));
        
        if (activeUnreplied.length === 0) {
            console.log(`[Reply Poll] Account ${account.id}: no unreplied emails from ACTIVE accounts`);
            continue;
        }

        console.log(`[Reply Poll] Account ${account.id}: ${activeUnreplied.length} unreplied from active accounts`);

        const accountMap = {};
        (fromAccounts || []).forEach(a => { accountMap[a.id] = a; });

        for (const email of activeUnreplied) {
            const shouldReply = shouldSendReply();
            console.log(`[Reply Poll] shouldSendReply() = ${shouldReply} for email ${email.id}`);
            if (!shouldReply) {
                continue;
            }

            const fromAccount = accountMap[email.from_account_id];
            if (!fromAccount) {
                console.error(`[Reply Poll] Sender account not found for email ${email.id}`);
                continue;
            }

            let senderAccount;
            try {
                senderAccount = await getFullAccountData(fromAccount);
            } catch (err) {
                console.error(`[Reply Poll] Failed to get account data for ${fromAccount.id}:`, err.message);
                continue;
            }

            // Mark as scheduled immediately to prevent double-scheduling
            try {
                await pool.query(
                    'UPDATE warmup_emails SET reply_scheduled_at = $1 WHERE id = $2',
                    [now.toISOString(), email.id]
                );
            } catch (err) {
                console.error(`[Reply Poll] Error marking email ${email.id} as scheduled:`, err.message);
                continue;
            }

            // Schedule reply at now + 10-25 mins
            const delay = Math.floor(Math.random() * 16) + 10;
            const scheduledAt = new Date(now.getTime() + delay * 60 * 1000);

            try {
                await pool.query(
                    `INSERT INTO pending_replies (
                        warmup_account_id, to_email, original_subject, reply_content, 
                        status, scheduled_at, email_record_id, gmail_thread_id, 
                        rfc_message_id, message_id, max_retries
                     ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, NULL, $7, $8, 3)`,
                    [
                        account.id, senderAccount.email, email.subject, email.reply_content,
                        scheduledAt.toISOString(), email.id, email.rfc_message_id, email.rfc_message_id
                    ]
                );
            } catch (err) {
                console.error(`[Reply Poll] Error inserting pending reply for email ${email.id}:`, err.message);
                continue;
            }

            console.log(`[Reply Poll] ✅ Reply SCHEDULED for ${scheduledAt.toISOString()} (email ${email.id})`);
        }
    }

    console.log(`[Reply Poll] Cycle complete`);
}

/**
 * Process pending replies (called by cron every 5 minutes)
 */
async function processPendingReplies() {
    console.log(`[Pending Replies] Checking for pending replies at ${new Date().toISOString()}...`);
    
    const now = new Date();
    
    // Fetch pending replies that are due (with exponential backoff)
    let replies = [];
    try {
        const result = await pool.query(
            "SELECT * FROM pending_replies WHERE status = 'pending' AND scheduled_at < $1 LIMIT 20",
            [now.toISOString()]
        );
        replies = result.rows;
    } catch (error) {
        console.error('[Pending Replies] Error fetching replies:', error.message);
        return;
    }

    if (!replies || replies.length === 0) {
        console.log('[Pending Replies] No pending replies to process');
        return;
    }

    console.log(`[Pending Replies] Found ${replies.length} reply(ies) to process`);

    for (const reply of replies) {
        // Check retry limits
        if (reply.retry_count >= reply.max_retries) {
            console.log(`[Pending Replies] Max retries reached for ${reply.id}, marking as failed`);
            await pool.query(
                "UPDATE pending_replies SET status = 'failed', last_error = 'Max retries exceeded' WHERE id = $1",
                [reply.id]
            );
            continue;
        }

        // Exponential backoff check
        if (reply.last_attempted_at) {
            const backoffMinutes = (reply.retry_count + 1) * 5; // 5, 10, 15 minutes
            const lastAttempt = new Date(reply.last_attempted_at);
            const backoffDeadline = new Date(lastAttempt.getTime() + backoffMinutes * 60 * 1000);
            
            if (now < backoffDeadline) {
                console.log(`[Pending Replies] Skipping ${reply.id} - still in backoff period`);
                continue;
            }
        }

        try {
            // Check if still within active hours
            if (!isWithinActiveHours(now)) {
                const nextActive = getNextActiveTime(now);
                const additionalDelay = Math.floor(Math.random() * 10) + 5;
                const newScheduledAt = new Date(nextActive.getTime() + additionalDelay * 60 * 1000);
                
                console.log(`[Pending Replies] ${reply.id} is off-hours, deferring to ${newScheduledAt.toISOString()}`);
                
                await pool.query(
                    `UPDATE pending_replies 
                     SET scheduled_at = $1, last_attempted_at = $2, retry_count = $3, last_error = 'Deferred to off-hours'
                     WHERE id = $4`,
                    [newScheduledAt.toISOString(), now.toISOString(), reply.retry_count + 1, reply.id]
                );
                continue;
            }

            // Get full account data
            const waResult = await pool.query(
                'SELECT * FROM warmup_accounts WHERE id = $1',
                [reply.warmup_account_id]
            );
            const warmupAccount = waResult.rows[0];

            if (!warmupAccount) {
                console.error(`[Pending Replies] Account not found: ${reply.warmup_account_id}`);
                await markReplyFailed(reply.id, 'Account not found');
                continue;
            }

            const account = await getFullAccountData(warmupAccount);
            const persona = warmupAccount.persona || 'casual';

            console.log(`[Pending Replies] Sending reply from ${maskEmail(account.email)} to ${maskEmail(reply.to_email)}...`);
            
            // Update last attempted time
            await pool.query(
                'UPDATE pending_replies SET last_attempted_at = $1 WHERE id = $2',
                [now.toISOString(), reply.id]
            );

            // Use pre-generated reply_content (set at scheduling time by pollInboxForReplies)
            const replyContent = reply.reply_content;

            let bThreadId = reply.gmail_thread_id || null;
            const fallbackRfcId = reply.message_id || reply.rfc_message_id;
            
            if (!bThreadId && fallbackRfcId) {
                try {
                    const msgInfo = await findMessageByRfcId(account, fallbackRfcId);
                    if (msgInfo && msgInfo.threadId) {
                        bThreadId = msgInfo.threadId;
                        console.log(`[Pending Replies] Found threadId ${bThreadId} for RFC ID ${fallbackRfcId}`);

                        // Cache threadId on the pending reply to avoid repeat lookups
                        await pool.query(
                            'UPDATE pending_replies SET gmail_thread_id = $1 WHERE id = $2',
                            [bThreadId, reply.id]
                        );
                    } else {
                        console.warn(`[Pending Replies] Could not find threadId for RFC ID ${fallbackRfcId}`);
                    }
                } catch (findErr) {
                    console.error(`[Pending Replies] Error finding threadId:`, findErr.message);
                }
            }

            // Retry later if the original message hasn't landed / isn't searchable yet.
            // We only send once we can confidently thread (threadId found in this mailbox).
            if (!bThreadId) {
                if ((reply.retry_count || 0) >= reply.max_retries) {
                    console.log(`[Pending Replies] Max retries reached for ${reply.id}, marking as failed`);
                    await pool.query(
                        "UPDATE pending_replies SET status = 'failed', last_error = 'thread_not_found_after_max_retries' WHERE id = $1",
                        [reply.id]
                    );
                    continue;
                }

                const retryDelayMinutes = Math.floor(Math.random() * 8) + 5; // 5-12 min
                const newScheduledAt = new Date(now.getTime() + retryDelayMinutes * 60 * 1000);

                console.warn(
                    `[Pending Replies] Thread not found yet for ${reply.id}; rescheduling to ${newScheduledAt.toISOString()}`
                );

                await pool.query(
                    `UPDATE pending_replies 
                     SET scheduled_at = $1, retry_count = $2, last_error = 'THREAD_NOT_FOUND_RETRY'
                     WHERE id = $3`,
                    [newScheduledAt.toISOString(), (reply.retry_count || 0) + 1, reply.id]
                );

                continue;
            }

            // Send the reply with threading data
            await sendReply(
                account,
                reply.to_email,
                replyContent,
                reply.original_subject,
                bThreadId,
                fallbackRfcId
            );

            // Mark as completed
            await pool.query(
                "UPDATE pending_replies SET status = 'sent' WHERE id = $1",
                [reply.id]
            );

            // Update warmup_emails status if linked
            if (reply.email_record_id) {
                await pool.query(
                    "UPDATE warmup_emails SET status = 'replied' WHERE id = $1",
                    [reply.email_record_id]
                );
            }

            // Update stats - recipient replied
            await updateWarmupStats(reply.warmup_account_id, 'replies', 1);

            console.log(`[Pending Replies] Reply ${reply.id} sent successfully!`);

        } catch (replyError) {
            console.error(`[Pending Replies] Error sending reply ${reply.id}:`, replyError.message);
            
            if (replyError.message && (
                replyError.message.includes('invalid_grant') || 
                replyError.message.includes('Token revoked') ||
                replyError.message.includes('NO_REFRESH_TOKEN') ||
                replyError.message.includes('invalid_client'))) {
                console.error(`[Pending Replies] 🔴 Sender account auth failed, pausing warmup.`);
                await pool.query(
                    "UPDATE warmup_accounts SET status = 'paused' WHERE id = $1",
                    [reply.warmup_account_id]
                );
            }

            // Increment retry count and save error
            await pool.query(
                'UPDATE pending_replies SET retry_count = $1, last_error = $2 WHERE id = $3',
                [reply.retry_count + 1, replyError.message, reply.id]
            );
        }
    }
    
    console.log(`[Pending Replies] Processing complete`);
}

async function markReplyFailed(replyId, errorMessage) {
    try {
        await pool.query(
            "UPDATE pending_replies SET status = 'failed', last_error = $1 WHERE id = $2",
            [errorMessage, replyId]
        );
    } catch (err) {
        console.error(`[Pending Replies] Error marking reply ${replyId} failed:`, err.message);
    }
}

/**
 * Process pending warmup jobs (runs every few minutes via cron)
 */
async function processPendingJobs() {
    console.log(`[Warmup Jobs] Checking for pending jobs at ${new Date().toISOString()}...`);
    
    const now = new Date().toISOString();
    
    // Fetch pending jobs that are due
    let jobs = [];
    try {
        const result = await pool.query(
            "SELECT * FROM warmup_jobs WHERE status = 'pending' AND scheduled_at <= $1 LIMIT 50",
            [now]
        );
        jobs = result.rows;
    } catch (error) {
        console.error('[Warmup Jobs] Error fetching jobs:', error.message);
        return;
    }

    if (!jobs || jobs.length === 0) {
        console.log('[Warmup Jobs] No pending jobs to process');
        return;
    }

    console.log(`[Warmup Jobs] Found ${jobs.length} job(s) to process`);

    for (const job of jobs) {
        try {
            // Get the warmup account
            const waResult = await pool.query(
                'SELECT * FROM warmup_accounts WHERE id = $1',
                [job.warmup_account_id]
            );
            const warmupAccount = waResult.rows[0];

            if (!warmupAccount) {
                console.error(`[Warmup Jobs] Warmup account not found:`, job.warmup_account_id);
                await markJobFailed(job.id, 'Account not found');
                continue;
            }

            // Get full account data
            const account = await getFullAccountData(warmupAccount);

            if (job.type === 'engagement') {
                console.log(`[Warmup Jobs] Processing engagement job ${job.id}`);
                
                // Skip fetching message labels - just send reply directly
                // This avoids 404 errors when message can't be found
                try {
                    // Get the original email record to find sender/recipient
                    const emailResult = await pool.query(
                        'SELECT * FROM warmup_emails WHERE gmail_message_id = $1',
                        [job.gmail_message_id]
                    );
                    const warmupEmail = emailResult.rows[0];

                    if (!warmupEmail) {
                        console.error(`[Warmup Jobs] Email not found:`, job.gmail_message_id);
                        await markJobFailed(job.id, 'Email not found');
                        continue;
                    }

                    // Get the warmup accounts to find sender and recipient emails
                    const fromWaResult = await pool.query(
                        `SELECT wa.*, sa.email AS sa_email 
                         FROM warmup_accounts wa
                         INNER JOIN sender_accounts sa ON wa.gmail_account_id = sa.id
                         WHERE wa.id = $1`,
                        [warmupEmail.from_account_id]
                    );
                    const fromWa = fromWaResult.rows[0];
                    if (fromWa) {
                        fromWa.sender_accounts = { email: fromWa.sa_email };
                    }

                    const toWaResult = await pool.query(
                        `SELECT wa.*, sa.email AS sa_email 
                         FROM warmup_accounts wa
                         INNER JOIN sender_accounts sa ON wa.gmail_account_id = sa.id
                         WHERE wa.id = $1`,
                        [warmupEmail.to_account_id]
                    );
                    const toWa = toWaResult.rows[0];
                    if (toWa) {
                        toWa.sender_accounts = { email: toWa.sa_email };
                    }

                    const senderEmail = fromWa?.sender_accounts?.email;
                    const recipientEmail = toWa?.sender_accounts?.email;

                    // The job is for the account that received the email, so reply to the other person
                    const replyToEmail = (account.email === senderEmail) ? recipientEmail : senderEmail;
                    
                    console.log(`[Warmup Jobs] Replying to ${replyToEmail} in thread ${job.thread_id}...`);
                    
                    // Generate reply content
                    const emailContent = await generateWarmupEmail();
                    
                    // Send reply with recipient email using original subject and threading headers
                    const originalSubject = warmupEmail.subject || 'Hello';
                    await sendReply(
                        account,
                        replyToEmail,
                        emailContent.reply,
                        originalSubject,
                        warmupEmail.thread_id || null,
                        warmupEmail.rfc_message_id || null
                    );

                    // Update warmup_email status to replied
                    await pool.query(
                        "UPDATE warmup_emails SET status = 'replied' WHERE gmail_message_id = $1",
                        [job.gmail_message_id]
                    );

                    // Update stats - recipient replied
                    await updateWarmupStats(warmupAccount.id, 'replies', 1);

                    // Mark job as completed
                    await markJobCompleted(job.id);
                    
                    console.log(`[Warmup Jobs] Job ${job.id} completed successfully`);
                } catch (replyError) {
                    console.error(`[Warmup Jobs] Reply error:`, replyError.message);
                    await markJobFailed(job.id, replyError.message);
                }
            }

        } catch (jobError) {
            console.error(`[Warmup Jobs] Error processing job ${job.id}:`, jobError.message);
            await markJobFailed(job.id, jobError.message);
        }
    }
}

async function markJobCompleted(jobId) {
    try {
        await pool.query(
            "UPDATE warmup_jobs SET status = 'completed', executed_at = $1 WHERE id = $2",
            [new Date().toISOString(), jobId]
        );
    } catch (err) {
        console.error(`[Warmup Jobs] Error marking job ${jobId} completed:`, err.message);
    }
}

async function markJobFailed(jobId, errorMessage) {
    try {
        await pool.query(
            "UPDATE warmup_jobs SET status = 'failed', error_message = $1 WHERE id = $2",
            [errorMessage, jobId]
        );
    } catch (err) {
        console.error(`[Warmup Jobs] Error marking job ${jobId} failed:`, err.message);
    }
}

/**
 * Main daily warmup cycle - runs at 9 AM UTC
 * Now saves jobs to database instead of setTimeout (survives server sleep)
 */
async function runDailyWarmupCycle() {
    console.log(`[Warmup] === Starting daily warmup cycle at ${new Date().toISOString()} ===`);

    try {
        // Fetch all warming accounts
        let accounts = [];
        try {
            const result = await pool.query(
                "SELECT * FROM warmup_accounts WHERE status = 'warming'"
            );
            accounts = result.rows;
        } catch (err) {
            console.error('[Warmup] Error fetching accounts:', err.message);
            return;
        }

        if (!accounts || accounts.length === 0) {
            console.log('[Warmup] No accounts to warm up');
            return;
        }

        console.log(`[Warmup] Found ${accounts.length} account(s) to warm up`);

        const now = new Date();

        for (const account of accounts) {
            try {
                const duration = account.warmup_duration || 30;
                const newDayNumber = account.day_number + 1;
                const newTarget = getDailyTarget(newDayNumber, duration);

                console.log(`[Warmup] Processing account ${account.id}: day ${newDayNumber}, target ${newTarget}, duration ${duration}`);

                if (newDayNumber > duration) {
                    await pool.query(
                        "UPDATE warmup_accounts SET status = 'warmed', day_number = $1, warmed_up_at = $2 WHERE id = $3",
                        [newDayNumber, new Date().toISOString(), account.id]
                    );
                    
                    console.log(`[Warmup] Account ${account.id} is now warmed (day ${newDayNumber})`);
                    continue;
                }

                // Update account progress
                await pool.query(
                    "UPDATE warmup_accounts SET day_number = $1, daily_target = $2 WHERE id = $3",
                    [newDayNumber, newTarget, account.id]
                );

                // Clean up old pending jobs from previous days (by day_number, not timestamp)
                if (account.day_number > 1) {
                    await pool.query(
                        "DELETE FROM warmup_jobs WHERE warmup_account_id = $1 AND type = 'warmup' AND day_number = $2",
                        [account.id, account.day_number - 2]
                    );
                }

                // Count already completed jobs for today
                const todayStart = now.toISOString().split('T')[0] + 'T00:00:00.000Z';
                const completedTodayResult = await pool.query(
                    `SELECT id FROM warmup_jobs 
                     WHERE warmup_account_id = $1 AND type = 'warmup' AND status = 'completed' AND executed_at >= $2`,
                    [account.id, todayStart]
                );

                const completedCount = completedTodayResult.rows?.length || 0;
                const remainingCount = Math.max(0, newTarget - completedCount);

                console.log(`[Warmup] Account ${account.id}: target=${newTarget}, completed=${completedCount}, remaining=${remainingCount}`);

                if (remainingCount <= 0) {
                    console.log(`[Warmup] Account ${account.id}: already hit daily target (${completedCount}/${newTarget})`);
                    continue;
                }

                // Pick ONE recipient for all emails today (same recipient for all)
                // Calculate window: 12:00 PM IST today (6:30 AM UTC) + 0-30 min per-account random offset
                const windowStart = new Date(now);
                windowStart.setUTCHours(6, 30, 0, 0);
                const accountOffset = Math.floor(Math.random() * 31); // 0-30 mins
                windowStart.setUTCMinutes(windowStart.getUTCMinutes() + accountOffset);

                // Schedule N jobs with cascading gaps (8-20 mins each) — rotating recipients
                const jobsToInsert = [];
                let lastScheduled = new Date(windowStart);

                for (let i = 0; i < remainingCount; i++) {
                    if (i > 0) {
                        const gap = Math.floor(Math.random() * 13) + 8; // 8-20 mins
                        lastScheduled = new Date(lastScheduled.getTime() + gap * 60 * 1000);
                    }
                    // Pick a NEW recipient for each email (rotating)
                    const recipient = await pickRecipient(account);
                    jobsToInsert.push({
                        warmup_account_id: account.id,
                        type: 'warmup',
                        to_account_id: recipient.id,
                        scheduled_at: lastScheduled.toISOString(),
                        status: 'pending',
                        day_number: newDayNumber,
                    });
                }

                if (jobsToInsert.length > 0) {
                    const placeholders = [];
                    const values = [];
                    let pIdx = 1;
                    for (const j of jobsToInsert) {
                        placeholders.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5})`);
                        values.push(j.warmup_account_id, j.type, j.to_account_id, j.scheduled_at, j.status, j.day_number);
                        pIdx += 6;
                    }

                    try {
                        await pool.query(
                            `INSERT INTO warmup_jobs (warmup_account_id, type, to_account_id, scheduled_at, status, day_number)
                             VALUES ${placeholders.join(', ')}`,
                            values
                        );
                        console.log(`[Warmup] Saved ${jobsToInsert.length} warmup jobs for account ${account.id}, first at ${jobsToInsert[0].scheduled_at}, last at ${jobsToInsert[jobsToInsert.length - 1].scheduled_at}`);
                    } catch (insertError) {
                        console.error(`[Warmup] Error inserting jobs for account ${account.id}:`, insertError.message);
                    }
                }

            } catch (accountError) {
                console.error(`[Warmup] Error processing account ${account.id}:`, accountError.message);
            }
        }

        console.log(`[Warmup] === Daily warmup cycle complete ===`);

    } catch (error) {
        console.error('[Warmup] Daily cycle error:', error.message);
    }
}

/**
 * Process pending warmup jobs from database (called by cron every 5 minutes)
 * Survives server sleep - jobs are stored in database
 */
async function processWarmupJobs() {
    console.log(`[Warmup Jobs] Checking for pending warmup jobs at ${new Date().toISOString()}...`);
    
    const now = new Date();
    
    let jobs = [];
    try {
        const result = await pool.query(
            `SELECT * FROM warmup_jobs 
             WHERE type = 'warmup' AND status = 'pending' AND scheduled_at <= $1 
             LIMIT 50`,
            [now.toISOString()]
        );
        jobs = result.rows;
    } catch (error) {
        console.error('[Warmup Jobs] Error fetching jobs:', error.message);
        return;
    }

    if (!jobs || jobs.length === 0) {
        console.log('[Warmup Jobs] No pending warmup jobs to process');
        return;
    }

    console.log(`[Warmup Jobs] Found ${jobs.length} job(s) to process`);

    for (const job of jobs) {
        try {
            // Check retry limits
            if (job.retry_count >= 3) {
                console.log(`[Warmup Jobs] Max retries reached for job ${job.id}, marking as failed`);
                await pool.query(
                    "UPDATE warmup_jobs SET status = 'failed', error_message = 'Max retries exceeded' WHERE id = $1",
                    [job.id]
                );
                continue;
            }

            // Exponential backoff check
            if (job.last_attempted_at) {
                const backoffMinutes = (job.retry_count + 1) * 5;
                const lastAttempt = new Date(job.last_attempted_at);
                const backoffDeadline = new Date(lastAttempt.getTime() + backoffMinutes * 60 * 1000);
                
                if (now < backoffDeadline) {
                    console.log(`[Warmup Jobs] Skipping job ${job.id} - still in backoff period`);
                    continue;
                }
            }

            // Get warmup account
            const waResult = await pool.query(
                'SELECT * FROM warmup_accounts WHERE id = $1',
                [job.warmup_account_id]
            );
            const warmupAccount = waResult.rows[0];

            if (!warmupAccount) {
                console.error(`[Warmup Jobs] Account not found: ${job.warmup_account_id}`);
                await markWarmupJobFailed(job.id, 'Account not found');
                continue;
            }

            // Get to_account (recipient)
            const toResult = await pool.query(
                'SELECT * FROM warmup_accounts WHERE id = $1',
                [job.to_account_id]
            );
            const toAccount = toResult.rows[0];

            if (!toAccount) {
                console.error(`[Warmup Jobs] Recipient not found: ${job.to_account_id}`);
                await markWarmupJobFailed(job.id, 'Recipient not found');
                continue;
            }

            // Get full account data
            const fromAccountFull = await getFullAccountData(warmupAccount);
            const toAccountFull = await getFullAccountData(toAccount);

            console.log(`[Warmup Jobs] Sending email from ${maskEmail(fromAccountFull.email)} to ${maskEmail(toAccountFull.email)}...`);

            // Update last attempted
            await pool.query(
                'UPDATE warmup_jobs SET last_attempted_at = $1 WHERE id = $2',
                [now.toISOString(), job.id]
            );

            // Get persona for this account
            const persona = warmupAccount.persona || 'casual';

            // Generate email content
            const emailContent = await generateWarmupEmail(persona);

            // Send email
            const result = await sendWarmupEmail(
                fromAccountFull,
                toAccountFull.email,
                emailContent.subject,
                emailContent.body
            );

            // Fetch RFC Message-ID for proper reply threading
            const rfcMessageId = await fetchRfcMessageId(fromAccountFull, result.messageId);

            // Log the email
            await logWarmupEmail(
                warmupAccount.id,
                toAccount.id,
                result.messageId,
                result.threadId,
                emailContent.subject,
                'sent',
                rfcMessageId,
                emailContent.reply
            );

            // Update stats - sender sent
            await updateWarmupStats(warmupAccount.id, 'sent', 1);
            // Update stats - recipient received
            await updateWarmupStats(toAccount.id, 'received', 1);

            // Mark job as completed
            await pool.query(
                `UPDATE warmup_jobs 
                 SET status = 'completed', executed_at = $1, gmail_message_id = $2 
                 WHERE id = $3`,
                [now.toISOString(), result.messageId, job.id]
            );

            // Note: reply scheduling is now handled independently by pollInboxForReplies()

            console.log(`[Warmup Jobs] Job ${job.id} completed successfully`);

        } catch (jobError) {
            console.error(`[Warmup Jobs] Error processing job ${job.id}:`, jobError.message);
            
            await pool.query(
                'UPDATE warmup_jobs SET retry_count = $1, error_message = $2 WHERE id = $3',
                [(job.retry_count || 0) + 1, jobError.message, job.id]
            );
        }
    }
    
    console.log(`[Warmup Jobs] Processing complete`);
}

async function markWarmupJobFailed(jobId, errorMessage) {
    try {
        await pool.query(
            "UPDATE warmup_jobs SET status = 'failed', error_message = $1, retry_count = 1 WHERE id = $2",
            [errorMessage, jobId]
        );
    } catch (err) {
        console.error(`[Warmup Jobs] Error marking job failed:`, err.message);
    }
}

module.exports = {
    startWarmup,
    pauseWarmup,
    resumeWarmup,
    getUserWarmupAccounts,
    getWarmupStats,
    getUserAggregateStats,
    runWarmupCycle,
    runDailyWarmupCycle,
    calculateDailyTarget,
    updateWarmupMode,
    setNetworkOptIn,
    setNetworkOptOut,
    getNetworkOptStatus,
    processPendingJobs,
    processPendingReplies,
    processWarmupJobs,
    processSpamRescue,
    pollInboxForReplies,
};

/**
 * Update warmup mode for an account
 */
async function updateWarmupMode(warmupAccountId, mode) {
    try {
        const result = await pool.query(
            'UPDATE warmup_accounts SET mode = $1 WHERE id = $2 RETURNING *',
            [mode, warmupAccountId]
        );
        const data = result.rows[0];
        if (!data) throw new Error('Warmup account not found');
        return data;
    } catch (error) {
        throw error;
    }
}

/**
 * Opt in to EmailFlow Network
 */
async function setNetworkOptIn(userId) {
    try {
        const result = await pool.query(
            `INSERT INTO user_settings (user_id, network_opt_in) 
             VALUES ($1, true) 
             ON CONFLICT (user_id) DO UPDATE SET network_opt_in = true 
             RETURNING *`,
            [userId]
        );
        return result.rows[0];
    } catch (error) {
        throw error;
    }
}

/**
 * Opt out of EmailFlow Network
 */
async function setNetworkOptOut(userId) {
    try {
        const result = await pool.query(
            `INSERT INTO user_settings (user_id, network_opt_in) 
             VALUES ($1, false) 
             ON CONFLICT (user_id) DO UPDATE SET network_opt_in = false 
             RETURNING *`,
            [userId]
        );
        return result.rows[0];
    } catch (error) {
        throw error;
    }
}

/**
 * Get network opt-in status for a user
 */
async function getNetworkOptStatus(userId) {
    try {
        const result = await pool.query(
            'SELECT network_opt_in FROM user_settings WHERE user_id = $1',
            [userId]
        );
        const data = result.rows[0];
        return data?.network_opt_in || false;
    } catch (error) {
        throw error;
    }
}
