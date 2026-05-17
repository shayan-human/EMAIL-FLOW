const { pool } = require('./db');
const { fetchMessagesByLabel, fetchMessageHeaders, modifyLabels } = require('./gmail-warmup');
const { decrypt } = require('./encryption');
const { maskEmail } = require('./log-utils');

const LABEL_SPAM = 'SPAM';
const LABEL_INBOX = 'INBOX';
const LABEL_IMPORTANT = 'IMPORTANT';

async function getFullAccountData(warmupAccount) {
    const result = await pool.query(
        'SELECT * FROM sender_accounts WHERE id = $1',
        [warmupAccount.gmail_account_id]
    );
    const account = result.rows[0];

    if (!account) {
        throw new Error('Sender account not found');
    }

    return {
        ...account,
        email: account.email,
        google_access_token: decrypt(account.google_access_token),
        google_refresh_token: decrypt(account.google_refresh_token),
    };
}

async function isWarmupSender(email, recipientAccountId) {
    // Determine the sender account from the email string
    const senderResult = await pool.query(
        'SELECT id FROM sender_accounts WHERE email = $1',
        [email.toLowerCase()]
    );
    const senderAcc = senderResult.rows[0];
        
    if (!senderAcc) return null;

    const warmupResult = await pool.query(
        'SELECT id FROM warmup_accounts WHERE gmail_account_id = $1',
        [senderAcc.id]
    );
    const warmupAccount = warmupResult.rows[0];

    if (!warmupAccount) return null;

    // Now find the UNRESCUED warmup email from this exact sender
    const emailResult = await pool.query(
        `SELECT id, from_account_id, to_account_id, gmail_message_id, landed_in_spam, spam_rescued_at 
         FROM warmup_emails 
         WHERE to_account_id = $1 
           AND from_account_id = $2 
           AND (landed_in_spam IS NOT TRUE)
           AND spam_rescued_at IS NULL 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [recipientAccountId, warmupAccount.id]
    );
    const warmupEmail = emailResult.rows;

    if (warmupEmail && warmupEmail.length > 0) {
        return warmupEmail[0];
    }
    
    return null;
}

async function rescueSpamEmail(account, messageId, warmupEmailRecord) {
    console.log(`[Spam Rescue] Rescuing message ${messageId} for account ${maskEmail(account.email)}`);

    await modifyLabels(account, messageId, [], [LABEL_SPAM]);
    console.log(`[Spam Rescue] Removed SPAM label from ${messageId}`);

    await modifyLabels(account, messageId, [LABEL_INBOX]);
    console.log(`[Spam Rescue] Added INBOX label to ${messageId}`);

    await modifyLabels(account, messageId, [LABEL_IMPORTANT]);
    console.log(`[Spam Rescue] Marked ${messageId} as IMPORTANT`);

    const now = new Date().toISOString();
    await pool.query(
        `UPDATE warmup_emails 
         SET landed_in_spam = true, 
             spam_detected_at = $1, 
             spam_rescued_at = $2, 
             marked_important_at = $3 
         WHERE id = $4`,
        [now, now, now, warmupEmailRecord.id]
    );

    console.log(`[Spam Rescue] Updated warmup_email ${warmupEmailRecord.id}`);

    await upsertSpamRescueStats(warmupEmailRecord.to_account_id);

    console.log(`[Spam Rescue] Incremented spam_rescues counter for account ${warmupEmailRecord.to_account_id}`);
}

async function upsertSpamRescueStats(accountId) {
    const today = new Date().toISOString().split('T')[0];

    try {
        const existingResult = await pool.query(
            'SELECT id, spam_rescues FROM warmup_stats WHERE account_id = $1 AND date = $2',
            [accountId, today]
        );
        const existing = existingResult.rows[0];

        if (existing) {
            await pool.query(
                'UPDATE warmup_stats SET spam_rescues = $1 WHERE id = $2',
                [(existing.spam_rescues || 0) + 1, existing.id]
            );
        } else {
            await pool.query(
                'INSERT INTO warmup_stats (account_id, date, spam_rescues) VALUES ($1, $2, $3)',
                [accountId, today, 1]
            );
        }
    } catch (err) {
        console.error(`[Spam Rescue] Failed to upsert stats for account ${accountId}:`, err.message);
    }
}

async function processSpamRescueForAccount(warmupAccount) {
    try {
        const account = await getFullAccountData(warmupAccount);
        console.log(`[Spam Rescue] Checking spam for account ${maskEmail(account.email)}`);

        const spamMessages = await fetchMessagesByLabel(account, LABEL_SPAM, 50);
        console.log(`[Spam Rescue] Found ${spamMessages.length} messages in SPAM for ${maskEmail(account.email)}`);

        if (spamMessages.length === 0) {
            return { accountId: account.id, rescued: 0 };
        }

        let rescuedCount = 0;

        for (const msg of spamMessages) {
            try {
                const headers = await fetchMessageHeaders(account, msg.id);
                const fromHeader = headers.payload?.headers?.find(h => h.name === 'From')?.value || '';

                const senderEmail = fromHeader.replace(/^.*<(.+)>.*$/, '$1').trim();

                const warmupEmailRecord = await isWarmupSender(senderEmail, warmupAccount.id);

                if (warmupEmailRecord) {
                    console.log(`[Spam Rescue] Message ${msg.id} from ${maskEmail(senderEmail)} is a warmup email - rescuing`);
                    await rescueSpamEmail(account, msg.id, warmupEmailRecord);
                    rescuedCount++;
                }
            } catch (msgError) {
                console.error(`[Spam Rescue] Error processing message ${msg.id}:`, msgError.message);
            }
        }

        console.log(`[Spam Rescue] Rescued ${rescuedCount} message(s) for ${maskEmail(account.email)}`);
        return { accountId: account.id, rescued: rescuedCount };

    } catch (error) {
        console.error(`[Spam Rescue] Error processing account ${warmupAccount.id}:`, error.message);
        return { accountId: warmupAccount.id, rescued: 0, error: error.message };
    }
}

async function processSpamRescue() {
    console.log(`[Spam Rescue] === Starting spam rescue cycle at ${new Date().toISOString()} ===`);

    try {
        let accounts = [];
        try {
            const result = await pool.query(
                "SELECT * FROM warmup_accounts WHERE status = $1",
                ['warming']
            );
            accounts = result.rows;
        } catch (error) {
            console.error('[Spam Rescue] Error fetching accounts:', error.message);
            return;
        }

        if (!accounts || accounts.length === 0) {
            console.log('[Spam Rescue] No warming accounts to check');
            return;
        }

        console.log(`[Spam Rescue] Checking ${accounts.length} account(s)`);

        let totalRescued = 0;
        const results = [];

        for (const account of accounts) {
            const result = await processSpamRescueForAccount(account);
            results.push(result);
            totalRescued += result.rescued || 0;
        }

        console.log(`[Spam Rescue] === Cycle complete: ${totalRescued} email(s) rescued ===`);
        return { totalRescued, results };

    } catch (error) {
        console.error('[Spam Rescue] Cycle failed:', error.message);
        return { error: error.message };
    }
}

module.exports = {
    processSpamRescue,
    rescueSpamEmail,
    isWarmupSender,
};
