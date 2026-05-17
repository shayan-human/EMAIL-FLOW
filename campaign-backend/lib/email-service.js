const { pool } = require('./db');
const { encrypt, decrypt } = require('./encryption');
const { getValidAccessToken, markReauthRequired } = require('./token-manager');
const { maskEmail } = require('./log-utils');

/**
 * Send an email using the Gmail REST API (HTTPS on port 443).
 * This avoids SMTP port blocking on platforms like Render.
 */
async function sendEmail({
    campaign_id,
    lead_id,
    sender_account,
    to,
    subject,
    body,
    sender_display_name,
    retry_limit = 2
}) {
    const senderEmail = sender_account.email;
    const senderName = sender_display_name || sender_account.name || senderEmail.split('@')[0];

    // Get valid access token (handles refresh if needed)
    const tokenResult = await getValidAccessToken(sender_account);

    if (!tokenResult.accessToken) {
        const errMsg = tokenResult.needsReauth 
            ? `Re-authentication required for ${maskEmail(senderEmail)}. Please reconnect your account.`
            : `Failed to get access token for ${maskEmail(senderEmail)}: ${tokenResult.error}`;
        
        console.error(`[Email Service] ${errMsg}`);
        await logFailure(campaign_id, lead_id, sender_account.id, subject, errMsg);
        return { success: false, error: errMsg, needsReauth: tokenResult.needsReauth };
    }

    let accessToken = tokenResult.accessToken;
    let attempts = 0;
    let lastError = null;

    while (attempts < retry_limit) {
        attempts++;
        try {
            console.log(`[Email Service] Gmail API attempt ${attempts} to ${maskEmail(to)}...`);

            // Build the raw RFC 2822 email message
            const rawMessage = buildRawEmail(senderName, senderEmail, to, subject, body);

            // Send via Gmail API
            const sendRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ raw: rawMessage }),
                }
            );

            if (sendRes.status === 401 && attempts === 1) {
                // Token was revoked or expired during send
                console.log('[Email Service] Access token rejected (401), attempting re-auth...');
                
                const reauthResult = await getValidAccessToken(sender_account);
                
                if (reauthResult.accessToken) {
                    accessToken = reauthResult.accessToken;
                    console.log('[Email Service] Token refreshed, retrying...');
                    continue;
                } else {
                    const errMsg = `Re-authentication required: ${reauthResult.error}`;
                    console.error(`[Email Service] ${errMsg}`);
                    await logFailure(campaign_id, lead_id, sender_account.id, subject, errMsg, attempts - 1);
                    return { success: false, error: errMsg, needsReauth: true };
                }
            }

            if (!sendRes.ok) {
                const errBody = await sendRes.text();
                if (sendRes.status >= 400 && sendRes.status < 500 && sendRes.status !== 429 && sendRes.status !== 401) {
                    // Permanent error (e.g. 400 Invalid Recipient), do not retry
                    throw new Error(`PERMANENT_ERROR: Gmail API error ${sendRes.status}: ${errBody}`);
                }
                throw new Error(`Gmail API error ${sendRes.status}: ${errBody}`);
            }

            const result = await sendRes.json();
            const messageId = result.id;
            const threadId = result.threadId;

            console.log(`[Email Service] Gmail API returned messageId: ${messageId}`);

            // Verify the message was actually created by fetching it
            const verifyRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            if (!verifyRes.ok) {
                const verifyErr = await verifyRes.text();
                console.error(`[Email Service] ❌ Verification FAILED for ${maskEmail(to)}: ${verifyRes.status} - ${verifyErr}`);
                
                // Log as failed even though Gmail API returned success
                await logFailure(campaign_id, lead_id, sender_account.id, subject, `Gmail API success but message not found: ${verifyRes.status}`, attempts - 1);
                return { success: false, error: `Email verification failed: ${verifyRes.status}`, verified: false };
            }

            const verifiedMessage = await verifyRes.json();
            console.log(`[Email Service] ✅ Email VERIFIED for ${maskEmail(to)} (labelIds: ${verifiedMessage.labelIds?.join(', ') || 'none'})`);

            // Check if email was actually sent (not just created as DRAFT)
            const isSent = verifiedMessage.labelIds?.includes('SENT');
            if (!isSent) {
                console.warn(`[Email Service] ⚠️ Message exists but not in SENT folder for ${maskEmail(to)}`);
            }

            // Log Success
            await pool.query(
                'INSERT INTO email_logs (campaign_id, lead_id, sender_account_id, subject, status, gmail_message_id, retry_count) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [campaign_id, lead_id, sender_account.id, subject, 'SENT', messageId, attempts - 1]
            );

            // Update Lead Status — store both message ID and thread ID
            await pool.query(
                'UPDATE leads SET status = $1, sent_at = $2, gmail_message_id = $3, gmail_thread_id = $4 WHERE id = $5',
                ['SENT', new Date().toISOString(), messageId, threadId || null, lead_id]
            );

            console.log(`[Email Service] ✅ Email sent to ${maskEmail(to)} (messageId: ${messageId}, verified: true)`);
            return { success: true, messageId, verified: true };

        } catch (error) {
            lastError = error;
            console.error(`[Email Service] Attempt ${attempts} failed for ${maskEmail(to)}:`, error.message);

            if (error.message.includes('PERMANENT_ERROR') || attempts >= retry_limit) {
                await logFailure(campaign_id, lead_id, sender_account.id, subject, error.message.replace('PERMANENT_ERROR: ', ''), attempts - 1);
                break; // Break out of the retry loop
            }
            
            // Wait 2 seconds before retry to avoid rate limits
            await new Promise(res => setTimeout(res, 2000));
        }
    }

    return { success: false, error: lastError?.message || 'Unknown error' };
}

/**
 * Build a base64url-encoded RFC 2822 email message for the Gmail API.
 */
function buildRawEmail(fromName, fromEmail, to, subject, textBody) {
    const safeSubject = (subject || '')
        .replace(/[\r\n\t]/g, ' ')
        .trim()
        .substring(0, 998);

    const boundary = '----=_Part_' + Date.now();
    const lines = [
        `From: "${fromName}" <${fromEmail}>`,
        `To: ${to}`,
        `Subject: ${safeSubject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        textBody,
        ``,
        `--${boundary}--`,
    ];

    const emailMessage = lines.join('\r\n');
    // Base64url encode the message
    return Buffer.from(emailMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Log a failure to the email_logs table and mark the lead as FAILED.
 */
async function logFailure(campaign_id, lead_id, sender_account_id, subject, errorMessage, retryCount = 0) {
    await pool.query(
        'INSERT INTO email_logs (campaign_id, lead_id, sender_account_id, subject, status, error_message, retry_count) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [campaign_id, lead_id, sender_account_id, subject, 'FAILED', errorMessage, retryCount]
    );

    await pool.query(
        'UPDATE leads SET status = $1 WHERE id = $2',
        ['FAILED', lead_id]
    );
}

module.exports = { sendEmail };
