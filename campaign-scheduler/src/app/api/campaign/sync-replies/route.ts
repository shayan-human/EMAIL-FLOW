import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";

/**
 * POST /api/campaign/sync-replies
 * 
 * Hybrid reply sync using pg pool:
 * - Uses gmail_thread_id when available (fast, reliable)
 * - Falls back to email + date search for leads without thread IDs
 * - Saves refreshed tokens back to DB
 */
export async function POST() {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 1. Fetch user's campaigns
        const campaignsResult = await pool.query(
            "SELECT id, subject FROM campaigns WHERE user_id = $1",
            [user.id]
        );
        const campaigns = campaignsResult.rows || [];

        if (campaigns.length === 0) {
            return NextResponse.json({ message: "No campaigns found", synced: 0, repliesFound: 0 });
        }

        const campaignIds = campaigns.map(c => c.id);

        // Fetch user's accounts and leads in parallel
        const [accountsRes, leadsRes] = await Promise.all([
            pool.query(
                "SELECT id, email, google_access_token, google_refresh_token FROM sender_accounts WHERE user_id = $1 AND is_active = true",
                [user.id]
            ),
            pool.query(
                `SELECT id, campaign_id, email, gmail_thread_id, sent_at, sender_account_id 
                 FROM leads 
                 WHERE campaign_id = ANY($1::uuid[]) 
                 AND status IN ('SENT', 'REPLIED')`,
                [campaignIds]
            )
        ]);

        const senderAccounts = accountsRes.rows || [];
        const sentLeads = leadsRes.rows || [];

        if (sentLeads.length === 0) {
            return NextResponse.json({ message: "No leads to sync", synced: 0, repliesFound: 0 });
        }

        // Build sender account map for quick token lookup
        const senderTokenMap: Record<string, { accessToken: string; refreshToken: string | null }> = {};
        for (const sa of senderAccounts) {
            senderTokenMap[sa.id] = {
                accessToken: decrypt(sa.google_access_token),
                refreshToken: sa.google_refresh_token ? decrypt(sa.google_refresh_token) : null,
            };
        }

        // 2. Check leads for replies in parallel batches of 5
        const BATCH_SIZE = 5;
        let repliesFound = 0;
        let synced = 0;
        const errors: string[] = [];
        const repliedLeadIds: string[] = [];

        for (let i = 0; i < sentLeads.length; i += BATCH_SIZE) {
            const batch = sentLeads.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(async (lead) => {
                    const senderId = lead.sender_account_id;
                    if (!senderId) return { leadId: lead.id, replied: false, error: "no sender account linked" };

                    const tokens = senderTokenMap[senderId];
                    if (!tokens) return { leadId: lead.id, replied: false, error: `tokens not found for account ${senderId}` };

                    try {
                        let hasReply: boolean;

                        if (lead.gmail_thread_id) {
                            hasReply = await checkReplyByThread(
                                tokens.accessToken,
                                tokens.refreshToken,
                                lead.gmail_thread_id,
                                senderId,
                                lead.id
                            );
                        } else {
                            hasReply = await checkReplyByEmail(
                                tokens.accessToken,
                                tokens.refreshToken,
                                lead.email,
                                lead.sent_at,
                                senderId,
                                lead.id
                            );
                        }

                        return { leadId: lead.id, replied: hasReply, error: null };
                    } catch (err) {
                        return {
                            leadId: lead.id,
                            replied: false,
                            error: err instanceof Error ? err.message : "Unknown",
                        };
                    }
                })
            );

            for (const result of results) {
                if (result.status === "fulfilled") {
                    const { leadId, replied, error } = result.value;
                    synced++;
                    if (replied) {
                        repliedLeadIds.push(leadId);
                        repliesFound++;
                    }
                    if (error) errors.push(error);
                }
            }
        }

        // 3. Batch update all replied leads at once
        if (repliedLeadIds.length > 0) {
            await pool.query(
                `UPDATE leads 
                 SET status = 'REPLIED', 
                     replied_at = $1, 
                     reply_count = 1 
                 WHERE id = ANY($2::uuid[])`,
                [new Date().toISOString(), repliedLeadIds]
            );
        }

        // 4. Update campaign_stats efficiently
        const leadCountsRes = await pool.query(
            `SELECT campaign_id, status 
             FROM leads 
             WHERE campaign_id = ANY($1::uuid[]) 
             AND status IN ('SENT', 'REPLIED')`,
            [campaignIds]
        );
        const leadCounts = leadCountsRes.rows || [];

        const statsToUpdate: Record<string, { sent: number; replied: number }> = {};
        campaignIds.forEach(id => statsToUpdate[id] = { sent: 0, replied: 0 });

        leadCounts.forEach(lc => {
            if (statsToUpdate[lc.campaign_id]) {
                statsToUpdate[lc.campaign_id].sent++;
                if (lc.status === "REPLIED") {
                    statsToUpdate[lc.campaign_id].replied++;
                }
            }
        });

        for (const [campaignId, counts] of Object.entries(statsToUpdate)) {
            const replyRate = counts.sent > 0 ? Math.round((counts.replied / counts.sent) * 10000) / 100 : 0;
            await pool.query(
                `INSERT INTO campaign_stats (campaign_id, total_sent, total_replied, reply_rate, last_synced_at)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (campaign_id) DO UPDATE SET
                     total_sent = EXCLUDED.total_sent,
                     total_replied = EXCLUDED.total_replied,
                     reply_rate = EXCLUDED.reply_rate,
                     last_synced_at = EXCLUDED.last_synced_at`,
                [
                    campaignId,
                    counts.sent,
                    counts.replied,
                    replyRate,
                    new Date().toISOString()
                ]
            );
        }

        // 5. Sync Bounces
        let bouncesFound = 0;
        try {
            for (const sa of senderAccounts) {
                if (sa.google_access_token) {
                    const count = await syncBounces(
                        decrypt(sa.google_access_token),
                        sa.google_refresh_token ? decrypt(sa.google_refresh_token) : null,
                        sa.id,
                        user.id
                    );
                    bouncesFound += count;
                }
            }
        } catch (bounceErr) {
            console.warn("[Bounce Sync Error]:", bounceErr);
        }

        return NextResponse.json({
            message: "Reply sync completed",
            synced,
            repliesFound,
            bouncesFound,
            campaignsUpdated: campaignIds.length,
            errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        });

    } catch (error: unknown) {
        console.error("[Sync Replies Error]:", error);
        return NextResponse.json(
            { error: "Internal Server Error", message: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}

// ── FAST PATH: Check reply via thread ID ──────────────────────────────
async function checkReplyByThread(
    accessToken: string,
    refreshToken: string | null,
    threadId: string,
    senderAccountId: string,
    leadId: string
): Promise<boolean> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`;

    const { response, token } = await gmailFetchWithRefresh(url, accessToken, refreshToken, senderAccountId);

    if (!response.ok) {
        if (response.status === 404) return false;
        const errText = await response.text().catch(() => "");
        throw new Error(`Gmail thread API ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const messages = data.messages || [];

    if (messages.length <= 1) return false;

    let newRepliesFound = false;
    const senderAccResult = await pool.query(
        "SELECT email FROM sender_accounts WHERE id = $1 LIMIT 1",
        [senderAccountId]
    );
    const senderAcc = senderAccResult.rows[0];

    for (let i = 1; i < messages.length; i++) {
        const msg = messages[i];

        const headers = msg.payload?.headers || [];
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "";

        if (senderAcc && fromHeader.toLowerCase().includes(senderAcc.email.toLowerCase())) continue;

        const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "(No Subject)";
        const body = extractBody(msg);
        const timestamp = new Date(parseInt(msg.internalDate)).toISOString();

        try {
            await pool.query(
                `INSERT INTO replies (lead_id, subject, body, sender_email, timestamp, gmail_message_id, gmail_thread_id, is_read)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    leadId,
                    subject,
                    body,
                    fromHeader,
                    timestamp,
                    msg.id,
                    threadId,
                    false
                ]
            );
            newRepliesFound = true;
        } catch (dbErr: any) {
            // Unique constraint on gmail_message_id is handled gracefully
            if (dbErr.code !== '23505') {
                console.warn("[Replies db save error]:", dbErr);
            }
        }
    }

    return newRepliesFound;
}

// ── FALLBACK: Check reply via email search ────────────────────────────
async function checkReplyByEmail(
    accessToken: string,
    refreshToken: string | null,
    leadEmail: string,
    sentAt: string | null,
    senderAccountId: string,
    leadId: string
): Promise<boolean> {
    const afterDate = sentAt ? formatGmailDate(sentAt) : null;
    const query = afterDate
        ? `from:${leadEmail} after:${afterDate}`
        : `from:${leadEmail} newer_than:30d`;

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`;

    const { response, token } = await gmailFetchWithRefresh(url, accessToken, refreshToken, senderAccountId);

    if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Gmail API ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const messages = data.messages || [];
    if (messages.length === 0) return false;

    let newRepliesFound = false;
    for (const m of messages) {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`;
        const msgRes = await fetch(msgUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!msgRes.ok) continue;

        const msg = await msgRes.json();
        const headers = msg.payload?.headers || [];
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "";
        const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "(No Subject)";
        const body = extractBody(msg);
        const internalDate = parseInt(msg.internalDate);

        if (sentAt && new Date(internalDate) <= new Date(sentAt)) continue;

        // Skip if this exact Gmail message already credited to another lead
        const existingCheck = await pool.query(
            "SELECT id FROM replies WHERE gmail_message_id = $1 LIMIT 1",
            [msg.id]
        );
        if (existingCheck.rows.length > 0) continue;

        const timestamp = new Date(internalDate).toISOString();

        try {
            await pool.query(
                `INSERT INTO replies (lead_id, subject, body, sender_email, timestamp, gmail_message_id, gmail_thread_id, is_read)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    leadId,
                    subject,
                    body,
                    fromHeader,
                    timestamp,
                    msg.id,
                    msg.threadId,
                    false
                ]
            );
            newRepliesFound = true;
            
            // Update lead with threadId securely
            await pool.query(
                "UPDATE leads SET gmail_thread_id = $1 WHERE id = $2",
                [msg.threadId, leadId]
            );
        } catch (dbErr: any) {
            if (dbErr.code !== '23505') {
                console.warn("[Replies fallback save error]:", dbErr);
            }
        }
    }

    return newRepliesFound;
}

function extractBody(message: any): string {
    const decodeBase64 = (data: string) => {
        const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
        return Buffer.from(base64, "base64").toString();
    };

    const payload = message.payload;
    if (!payload) return "";

    let body = "";
    if (payload.parts) {
        const part = payload.parts.find((p: any) => p.mimeType === "text/plain") ||
            payload.parts.find((p: any) => p.mimeType === "text/html") ||
            payload.parts[0];

        if (part && part.body && part.body.data) {
            body = decodeBase64(part.body.data);
        } else if (part && part.parts) {
            const subPart = part.parts.find((p: any) => p.mimeType === "text/plain") || part.parts[0];
            if (subPart && subPart.body && subPart.body.data) {
                body = decodeBase64(subPart.body.data);
            }
        }
    } else if (payload.body && payload.body.data) {
        body = decodeBase64(payload.body.data);
    }

    return body;
}

// ── Gmail fetch with automatic token refresh + DB save ────────────────
async function gmailFetchWithRefresh(
    url: string,
    accessToken: string,
    refreshToken: string | null,
    senderAccountId: string
): Promise<{ response: Response; token: string }> {
    let token = accessToken;
    let response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401 && refreshToken) {
        try {
            token = await refreshAccessToken(refreshToken);

            await pool.query(
                "UPDATE sender_accounts SET google_access_token = $1 WHERE id = $2",
                [encrypt(token), senderAccountId]
            );

            response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch (err) {
            console.error("[Token Refresh Secure Update Failed]:", err);
        }
    }

    return { response, token };
}

// ── Helpers ───────────────────────────────────────────────────────────
function formatGmailDate(isoDate: string): string {
    const d = new Date(isoDate);
    d.setDate(d.getDate() - 1);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });

    if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);
    const data = await response.json();
    return data.access_token;
}

// ── BOUNCE DETECTION: Check for delivery failures ─────────────────────
async function syncBounces(
    accessToken: string,
    refreshToken: string | null,
    senderAccountId: string,
    userId: string
): Promise<number> {
    const query = `from:mailer-daemon@googlemail.com OR subject:"Delivery Status Notification" OR subject:"Mail Delivery Subsystem" newer_than:30d`;
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`;

    const { response, token } = await gmailFetchWithRefresh(url, accessToken, refreshToken, senderAccountId);
    if (!response.ok) return 0;

    const data = await response.json();
    const messages = data.messages || [];
    if (messages.length === 0) return 0;

    let bouncesCount = 0;

    for (const m of messages) {
        // Skip if this bounce message already credited
        const existingCheck = await pool.query(
            "SELECT id FROM replies WHERE gmail_message_id = $1 LIMIT 1",
            [m.id]
        );
        if (existingCheck.rows.length > 0) continue;

        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`;
        const msgRes = await fetch(msgUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!msgRes.ok) continue;

        const msg = await msgRes.json();
        const body = extractBody(msg);
        const headers = msg.payload?.headers || [];
        const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "";

        // Extract failed recipient email from body or specific header
        let failedEmail = "";
        const failedHeader = headers.find((h: any) => h.name.toLowerCase() === "x-failed-recipient")?.value;
        if (failedHeader) {
            failedEmail = failedHeader.trim();
        } else {
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
            const matches = body.match(emailRegex);
            if (matches && matches.length > 0) {
                failedEmail = matches.find(email => !email.includes("google") && !email.includes("mailer-daemon")) || "";
            }
        }

        if (failedEmail) {
            // Securely join leads with campaigns to verify ownership before bounce mapping
            const leadsResult = await pool.query(
                `SELECT l.id, l.campaign_id 
                 FROM leads l
                 JOIN campaigns c ON l.campaign_id = c.id
                 WHERE l.email = $1 
                 AND l.status IN ('SENT', 'PENDING') 
                 AND c.user_id = $2`,
                [failedEmail, userId]
            );
            const leads = leadsResult.rows || [];

            if (leads.length > 0) {
                const leadIds = leads.map((l: any) => l.id);
                
                await pool.query(
                    "UPDATE leads SET status = 'BOUNCED' WHERE id = ANY($1::uuid[])",
                    [leadIds]
                );

                bouncesCount++;
                
                // Save bounce reply
                try {
                    await pool.query(
                        `INSERT INTO replies (lead_id, subject, body, sender_email, timestamp, gmail_message_id, is_read)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [
                            leads[0].id,
                            `BOUNCE: ${subject}`,
                            body.slice(0, 1000),
                            "mailer-daemon@googlemail.com",
                            new Date(parseInt(msg.internalDate)).toISOString(),
                            msg.id,
                            true
                        ]
                    );
                } catch (dbErr: any) {
                    if (dbErr.code !== '23505') {
                        console.warn("[Replies bounce save error]:", dbErr);
                    }
                }
            }
        }
    }

    return bouncesCount;
}
