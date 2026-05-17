const { getValidAccessToken } = require('./token-manager');
const { encrypt, decrypt } = require('./encryption');

/**
 * Send a warmup email using Gmail API
 */
async function sendWarmupEmail(account, toEmail, subject, body) {
    const senderEmail = account.email;
    const senderName = account.name || senderEmail.split('@')[0];

    // Get valid access token
    const tokenResult = await getValidAccessToken(account);
    
    if (!tokenResult.accessToken) {
        throw new Error(`Failed to get access token for ${senderEmail}: ${tokenResult.error}`);
    }

    const accessToken = tokenResult.accessToken;

    // Build raw email
    const rawMessage = buildRawEmail(senderName, senderEmail, toEmail, subject, body);

    // Send via Gmail API
    const sendRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw: rawMessage }),
        }
    );

    if (!sendRes.ok) {
        const errBody = await sendRes.text();
        throw new Error(`Gmail API error ${sendRes.status}: ${errBody}`);
    }

    const result = await sendRes.json();
    
    return {
        messageId: result.id,
        threadId: result.threadId,
    };
}

/**
 * Fetch message details from Gmail API
 */
async function fetchMessage(account, messageId) {
    const tokenResult = await getValidAccessToken(account);
    
    if (!tokenResult.accessToken) {
        throw new Error(`Failed to get access token: ${tokenResult.error}`);
    }

    const accessToken = tokenResult.accessToken;

    const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gmail API error ${response.status}: ${errBody}`);
    }

    return await response.json();
}

/**
 * Modify message labels in Gmail
 */
async function modifyLabels(account, messageId, addLabels = [], removeLabels = []) {
    const tokenResult = await getValidAccessToken(account);
    
    if (!tokenResult.accessToken) {
        throw new Error(`Failed to get access token: ${tokenResult.error}`);
    }

    const accessToken = tokenResult.accessToken;

    const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                addLabelIds: addLabels,
                removeLabelIds: removeLabels,
            }),
        }
    );

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gmail API error ${response.status}: ${errBody}`);
    }

    return await response.json();
}

/**
 * Send a reply as a properly threaded email
 * Uses In-Reply-To, References, and threadId for correct Gmail threading
 */
async function sendReply(account, toEmail, replyText, originalSubject, threadId, referencesChain) {
    const senderEmail = account.email;
    const senderName = account.name || senderEmail.split('@')[0];

    const tokenResult = await getValidAccessToken(account);
    
    if (!tokenResult.accessToken) {
        throw new Error(`Failed to get access token: ${tokenResult.error}`);
    }

    const accessToken = tokenResult.accessToken;

    // Add Re: prefix to subject
    const subject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;

    // Build the raw email with threading headers
    // NOTE: replyText is the email body; referencesChain is used for In-Reply-To/References headers.
    const rawMessage = buildRawReplyEmail(senderName, senderEmail, toEmail, subject, replyText, referencesChain);

    // We now fetch the recipient's actual threadId, so passing threadId is correct and required for threading
    const requestBody = { raw: rawMessage };
    if (threadId) {
        requestBody.threadId = threadId;
    }

    const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        }
    );

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gmail API error ${response.status}: ${errBody}`);
    }

    const result = await response.json();
    
    return {
        messageId: result.id,
        threadId: result.threadId,
    };
}

/**
 * Build a base64url-encoded RFC 2822 email message (for initial sends)
 */
function buildRawEmail(fromName, fromEmail, to, subject, textBody) {
    const boundary = '----=_Part_' + Date.now();
    const lines = [
        `From: "${fromName}" <${fromEmail}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
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
    return Buffer.from(emailMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Build a base64url-encoded RFC 2822 reply email with threading headers
 */
function buildRawReplyEmail(fromName, fromEmail, to, subject, textBody, referencesChain) {
    const boundary = '----=_Part_' + Date.now();
    const lines = [
        `From: "${fromName}" <${fromEmail}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
    ];

    // Add threading headers if we have the chain
    if (referencesChain) {
        const chain = String(referencesChain).trim();
        // Extract the last message-id token for In-Reply-To
        const lastAngleBracketId = chain.match(/<[^>]+>\s*$/);
        const lastToken = chain.split(/\s+/).filter(Boolean).slice(-1)[0];
        const inReplyTo = (lastAngleBracketId ? lastAngleBracketId[0].trim() : (lastToken || chain)).trim();

        lines.push(`In-Reply-To: ${inReplyTo}`);
        lines.push(`References: ${chain}`);
    }

    lines.push(
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
    );

    const emailMessage = lines.join('\r\n');
    return Buffer.from(emailMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Fetch RFC Message-ID header from a sent Gmail message
 * This is needed for In-Reply-To and References headers in replies
 */
async function fetchRfcMessageId(account, gmailMessageId) {
    const tokenResult = await getValidAccessToken(account);
    
    if (!tokenResult.accessToken) {
        console.error(`[Gmail Warmup] Failed to get access token for RFC Message-ID fetch`);
        return null;
    }

    try {
        const response = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}?format=full`,
            {
                headers: {
                    'Authorization': `Bearer ${tokenResult.accessToken}`,
                },
            }
        );

        if (!response.ok) {
            console.error(`[Gmail Warmup] Failed to fetch message ${gmailMessageId}: ${response.status}`);
            return null;
        }

        const msg = await response.json();
        const messageIdHeader = msg.payload?.headers?.find(h => h.name === 'Message-ID' || h.name === 'Message-Id');
        
        return messageIdHeader?.value || null;
    } catch (error) {
        console.error(`[Gmail Warmup] Error fetching RFC Message-ID:`, error.message);
        return null;
    }
}

/**
 * Fetch messages by label ID (e.g. 'SPAM', 'INBOX', 'SENT')
 * Returns messages with basic metadata for spam rescue checking
 */
async function fetchMessagesByLabel(account, labelId, maxResults = 50) {
    const tokenResult = await getValidAccessToken(account);
    
    if (!tokenResult.accessToken) {
        throw new Error(`Failed to get access token: ${tokenResult.error}`);
    }

    const accessToken = tokenResult.accessToken;

    const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${labelId}&maxResults=${maxResults}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gmail API error ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    return data.messages || [];
}

/**
 * Fetch message with full headers (for sender/recipient extraction)
 */
async function fetchMessageHeaders(account, messageId) {
    const tokenResult = await getValidAccessToken(account);
    
    if (!tokenResult.accessToken) {
        throw new Error(`Failed to get access token: ${tokenResult.error}`);
    }

    const accessToken = tokenResult.accessToken;

    const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gmail API error ${response.status}: ${errBody}`);
    }

    return await response.json();
}

/**
 * Find a message by its RFC Message-ID header
 * Used to get threadId when processing replies
 */
async function findMessageByRfcId(account, rfcMessageId) {
    const tokenResult = await getValidAccessToken(account);
    
    if (!tokenResult.accessToken) {
        throw new Error('Failed to get access token');
    }

    const accessToken = tokenResult.accessToken;
    
    const rawId = String(rfcMessageId || '').trim();
    const normalizedId = (rawId.startsWith('<') && rawId.endsWith('>'))
        ? rawId.slice(1, -1)
        : rawId;
    // Gmail search operator is `rfc822msgid:` (not `rfc-msgid:`)
    const query = `rfc822msgid:${normalizedId}`;
    const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=1`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Gmail API error ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.messages || data.messages.length === 0) {
        return null;
    }

    const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.messages[0].id}?format=full`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!msgResponse.ok) {
        throw new Error(`Failed to fetch message ${data.messages[0].id}`);
    }

    return await msgResponse.json();
}

module.exports = {
    sendWarmupEmail,
    fetchMessage,
    modifyLabels,
    sendReply,
    fetchRfcMessageId,
    fetchMessagesByLabel,
    fetchMessageHeaders,
    findMessageByRfcId,
};
