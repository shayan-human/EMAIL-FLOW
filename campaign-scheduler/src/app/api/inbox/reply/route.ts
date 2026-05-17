import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";
import { sendGmailEmail } from "@/lib/gmail";
import { encrypt, decrypt } from "@/lib/encryption";

export async function POST(req: Request) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const payload = await req.json();
        const { leadId, gmailThreadId: reqThreadId, subject, body, senderAccountId } = payload;

        if (!leadId || !body) {
            console.error("[Reply API] Missing required fields:", { leadId: !!leadId, body: !!body });
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // 1. Get lead and ensure it belongs to the user's campaign
        const leadResult = await pool.query(
            `SELECT 
                l.email,
                l.sender_account_id,
                l.sender_account_email,
                l.gmail_thread_id
             FROM leads l
             JOIN campaigns c ON l.campaign_id = c.id
             WHERE l.id = $1 AND c.user_id = $2`,
            [leadId, user.id]
        );
        const lead = leadResult.rows[0];

        if (!lead) {
            console.error("[Reply API Error]: Failed to fetch lead or access denied");
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        let gmailThreadId = reqThreadId || lead.gmail_thread_id;

        if (!gmailThreadId) {
            console.log(`[Reply API]: Thread ID missing on lead ${leadId}, checking replies table...`);
            
            const repliesResult = await pool.query(
                `SELECT r.gmail_thread_id 
                 FROM replies r
                 JOIN leads l ON r.lead_id = l.id
                 JOIN campaigns c ON l.campaign_id = c.id
                 WHERE r.lead_id = $1 AND c.user_id = $2 AND r.gmail_thread_id IS NOT NULL 
                 LIMIT 1`,
                [leadId, user.id]
            );
            const lastReply = repliesResult.rows[0];

            if (lastReply?.gmail_thread_id) {
                gmailThreadId = lastReply.gmail_thread_id;
                
                // Backfill lead gmail_thread_id securely
                await pool.query(
                    `UPDATE leads l
                     SET gmail_thread_id = $1
                     FROM campaigns c
                     WHERE l.campaign_id = c.id AND l.id = $2 AND c.user_id = $3`,
                    [gmailThreadId, leadId, user.id]
                );
            }
        }

        if (!gmailThreadId) {
            return NextResponse.json({ error: "Missing thread ID: Please sync your inbox first" }, { status: 400 });
        }

        let activeSenderAccountId = senderAccountId || lead.sender_account_id;

        if (!activeSenderAccountId) {
            if (lead.sender_account_email) {
                console.log(`[Reply API]: Falling back to email lookup for lead ${leadId}`);
                
                const fallbackResult = await pool.query(
                    "SELECT id FROM sender_accounts WHERE email = $1 AND user_id = $2 LIMIT 1",
                    [lead.sender_account_email, user.id]
                );
                const fallbackAcc = fallbackResult.rows[0];

                if (fallbackAcc) {
                    activeSenderAccountId = fallbackAcc.id;
                    // Link it in DB securely for future efficiency
                    await pool.query(
                        `UPDATE leads l
                         SET sender_account_id = $1
                         FROM campaigns c
                         WHERE l.campaign_id = c.id AND l.id = $2 AND c.user_id = $3`,
                        [activeSenderAccountId, leadId, user.id]
                    );
                }
            }
        }

        if (!activeSenderAccountId) {
            return NextResponse.json({ error: "No sender account associated with this lead" }, { status: 400 });
        }

        // 2. Get sender account credentials
        const senderResult = await pool.query(
            "SELECT email, google_access_token, google_refresh_token FROM sender_accounts WHERE id = $1 AND user_id = $2",
            [activeSenderAccountId, user.id]
        );
        const sender = senderResult.rows[0];

        if (!sender) {
            console.error("[Reply API Error]: Failed to fetch sender account");
            return NextResponse.json({ error: "Sender account not found" }, { status: 404 });
        }

        // 3. Send email via Gmail API
        const response = await sendGmailEmail({
            to: lead.email,
            subject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`,
            body: body,
            accessToken: decrypt(sender.google_access_token || ""),
            refreshToken: sender.google_refresh_token ? decrypt(sender.google_refresh_token) : null,
            fromEmail: sender.email,
            threadId: gmailThreadId,
        });

        if (!response.success) {
            console.error("[Reply API Error]: Gmail send failed", response.error);
            return NextResponse.json({ error: response.error }, { status: 500 });
        }

        // 4. Update the sender account with the new access token if it was refreshed
        if (response.newAccessToken) {
            await pool.query(
                "UPDATE sender_accounts SET google_access_token = $1 WHERE id = $2 AND user_id = $3",
                [encrypt(response.newAccessToken), activeSenderAccountId, user.id]
            );
        }

        // 5. Save the outgoing reply to the database
        try {
            await pool.query(
                `INSERT INTO replies (lead_id, subject, body, sender_email, type, gmail_message_id, is_read, timestamp)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    leadId,
                    subject.startsWith("Re: ") ? subject : `Re: ${subject}`,
                    body,
                    sender.email,
                    'outgoing',
                    response.messageId,
                    true,
                    new Date().toISOString()
                ]
            );
        } catch (insertError) {
            console.warn("[Reply API]: Failed to save outgoing reply to DB", insertError);
        }

        // 6. Return success
        return NextResponse.json({
            success: true,
            messageId: response.messageId,
            threadId: response.threadId
        });

    } catch (error) {
        console.error("[Reply API Error]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
