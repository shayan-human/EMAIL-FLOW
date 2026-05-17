const { pool } = require('./db');
const { getValidAccessToken } = require('./token-manager');

function isBounceEmail(fromHeader, subjectHeader) {
    const fromLower = fromHeader.toLowerCase();
    const subjectLower = subjectHeader.toLowerCase();
    
    const bounceIndicators = [
        'mailer-daemon@',
        'mailer-daemon@googlemail.com',
        'mailer-daemon@google.com',
        'postmaster@',
        'delivery status notification',
        'delivery failed',
        'mail delivery failed',
        'undeliverable',
        'address not found',
        'user unknown',
        'mailbox unavailable',
        'bounced',
        'bounce',
        'returned mail'
    ];
    
    return bounceIndicators.some(indicator => 
        fromLower.includes(indicator) || subjectLower.includes(indicator)
    );
}

function decodeBase64Url(encoded) {
    if (!encoded) return '';
    try {
        const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        const padding = base64.length % 4;
        const padded = padding ? base64 + '='.repeat(4 - padding) : base64;
        return Buffer.from(padded, 'base64').toString('utf-8');
    } catch (e) {
        return '';
    }
}

function extractBody(payload) {
    if (!payload) return '';
    
    if (payload.body && payload.body.data) {
        return decodeBase64Url(payload.body.data);
    }
    
    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                return decodeBase64Url(part.body.data);
            }
            if (part.mimeType === 'text/html' && part.body && part.body.data) {
                const htmlBody = decodeBase64Url(part.body.data);
                return htmlBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
            if (part.parts) {
                const nestedBody = extractBody(part);
                if (nestedBody) return nestedBody;
            }
        }
    }
    
    return '';
}

async function blockEmail(userId, email, reason) {
    if (!userId || !email) return;
    try {
        await pool.query(
            `INSERT INTO blocked_leads (user_id, email, reason) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (user_id, email) 
             DO UPDATE SET reason = EXCLUDED.reason`,
            [userId, email.toLowerCase(), reason || 'bounce']
        );
        console.log(`[Blocklist] ✅ Blocked email: ${email} (reason: ${reason || 'bounce'})`);
    } catch (error) {
        console.error(`[Blocklist] Failed to block email ${email}:`, error.message);
    }
}

async function insertReply(leadId, senderEmail, subject, body, messageId, threadId, timestamp) {
    try {
        await pool.query(
            `INSERT INTO replies (lead_id, sender_email, subject, body, gmail_message_id, gmail_thread_id, timestamp, is_read, type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [leadId, senderEmail, subject, body, messageId, threadId, timestamp, false, 'incoming']
        );
        console.log(`[Reply Service] ✅ Reply inserted for lead ${leadId}`);
        return true;
    } catch (error) {
        if (error.code === '23505') {
            console.log(`[Reply Service] Reply already exists for message ${messageId}, skipping`);
            return false;
        }
        console.error(`[Reply Service] Failed to insert reply:`, error.message);
        return false;
    }
}

async function fetchMessageBody(accessToken, messageId) {
    try {
        const response = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );
        
        if (!response.ok) {
            console.error(`[Reply Service] Failed to fetch message body: ${response.status}`);
            return { from: '', subject: '', body: '', timestamp: new Date().toISOString() };
        }
        
        const msgData = await response.json();
        const headers = msgData.payload?.headers || [];
        
        const fromHeader = headers.find(h => h.name === 'From')?.value || '';
        const subjectHeader = headers.find(h => h.name === 'Subject')?.value || '';
        const rawTimestamp = msgData.internalDate ? parseInt(msgData.internalDate) : Date.now();
        const timestamp = new Date(rawTimestamp).toISOString();
        
        const body = extractBody(msgData.payload);
        
        return {
            from: fromHeader,
            subject: subjectHeader,
            body: body,
            timestamp: timestamp
        };
    } catch (err) {
        console.error(`[Reply Service] Error fetching message body:`, err.message);
        return { from: '', subject: '', subject: 'No Subject', body: '', timestamp: new Date().toISOString() };
    }
}

async function checkReplies() {
    console.log(`[${new Date().toISOString()}] Checking for replies...`);

    try {
        let leads = [];
        try {
            const result = await pool.query(
                `SELECT l.*, 
                        sa.id AS sa_id, sa.email AS sa_email, sa.name AS sa_name, 
                        sa.google_access_token AS sa_google_access_token, 
                        sa.google_refresh_token AS sa_google_refresh_token, 
                        sa.token_expires_at AS sa_token_expires_at,
                        sa.status AS sa_status, sa.is_active AS sa_is_active,
                        sa.user_id AS sa_user_id
                 FROM leads l
                 INNER JOIN sender_accounts sa ON l.sender_account_id = sa.id
                 WHERE l.status = 'SENT' AND l.gmail_thread_id IS NOT NULL`
            );
            leads = result.rows.map(row => {
                return {
                    ...row,
                    sender_accounts: {
                        id: row.sa_id,
                        email: row.sa_email,
                        name: row.sa_name,
                        google_access_token: row.sa_google_access_token,
                        google_refresh_token: row.sa_google_refresh_token,
                        token_expires_at: row.sa_token_expires_at,
                        status: row.sa_status,
                        is_active: row.sa_is_active,
                        user_id: row.sa_user_id
                    }
                };
            });
        } catch (leadsError) {
            console.error('[Reply Service] Failed to fetch leads:', leadsError.message);
            return;
        }
        if (!leads || leads.length === 0) {
            console.log('No sent leads found to check for replies.');
            return;
        }

        console.log(`Checking ${leads.length} leads for replies...`);

        for (const lead of leads) {
            const threadId = lead.gmail_thread_id;
            const account = lead.sender_accounts;

            const tokenResult = await getValidAccessToken(account);

            if (!tokenResult.accessToken) {
                console.warn(`[Reply Service] Cannot get token for ${account.email}: ${tokenResult.error}`);
                if (tokenResult.needsReauth) {
                    console.warn(`[Reply Service] Account ${account.email} needs re-authentication`);
                }
                continue;
            }

            const accessToken = tokenResult.accessToken;

            try {
                let response = await fetch(
                    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=minimal`,
                    {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    }
                );

                if (response.status === 401) {
                    console.log(`[Reply Service] Token rejected for ${account.email}, retrying...`);
                    const retryResult = await getValidAccessToken(account);
                    
                    if (!retryResult.accessToken) {
                        console.warn(`[Reply Service] Cannot get fresh token for ${account.email}`);
                        continue;
                    }

                    response = await fetch(
                        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=minimal`,
                        {
                            headers: { Authorization: `Bearer ${retryResult.accessToken}` },
                        }
                    );
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[Reply Service] Gmail API error ${response.status} for thread ${threadId}: ${errorText}`);
                    continue;
                }

                const data = await response.json();
                const messages = data.messages || [];
                const messageCount = messages.length;

                if (messageCount > 1) {
                    const latestMessageId = messages[messages.length - 1].id;
                    
                    const msgDetails = await fetchMessageBody(accessToken, latestMessageId);
                    const { from: fromHeader, subject: subjectHeader, body: emailBody, timestamp: emailTimestamp } = msgDetails;

                    const isBounce = isBounceEmail(fromHeader, subjectHeader);

                    if (isBounce) {
                        console.log(`[Reply Service] Classified as BOUNCE for lead ${lead.email} (from: ${fromHeader}, subject: ${subjectHeader})`);
                        await blockEmail(lead.user_id || lead.sender_accounts?.user_id, lead.email, `Bounce: ${subjectHeader}`);
                    } else {
                        console.log(`[Reply Service] Detected REPLY for lead ${lead.email} (from: ${fromHeader}, subject: ${subjectHeader})`);
                        
                        const inserted = await insertReply(
                            lead.id,
                            fromHeader,
                            subjectHeader,
                            emailBody,
                            latestMessageId,
                            threadId,
                            emailTimestamp
                        );

                        if (inserted) {
                            try {
                                await pool.query(
                                    'SELECT public.update_lead_status_from_webhook($1, $2, $3, $4, $5)',
                                    [lead.campaign_id, lead.email, 'EMAIL_REPLY', latestMessageId, threadId]
                                );
                                console.log(`[Reply Service] ✅ Lead status updated to REPLIED for ${lead.email}`);
                            } catch (rpcError) {
                                console.error(`[Reply Service] Failed to update lead ${lead.id}:`, rpcError.message);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`[Reply Service] Error checking thread ${threadId}:`, err.message);
            }
        }

    } catch (error) {
        console.error('[Reply Service] Failed:', error.message);
    }
}

module.exports = { checkReplies };
