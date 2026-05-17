import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";
import { isBounce } from "@/lib/email-utils";

export async function GET() {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch all replies, their leads, and campaign information in a single query scoped to the user
        const result = await pool.query(
            `SELECT 
                r.id AS reply_id,
                r.lead_id,
                r.subject AS reply_subject,
                r.body AS reply_body,
                r.sender_email AS reply_sender_email,
                r.timestamp AS reply_timestamp,
                r.type AS reply_type,
                r.is_read AS reply_is_read,
                r.gmail_message_id AS reply_gmail_message_id,
                l.id AS lead_id,
                l.email AS lead_email,
                l.first_name AS lead_first_name,
                l.last_name AS lead_last_name,
                l.business_name AS lead_business_name,
                l.website AS lead_website,
                l.phone AS lead_phone,
                l.custom_fields AS lead_custom_fields,
                l.gmail_thread_id AS lead_gmail_thread_id,
                l.sender_account_id AS lead_sender_account_id,
                l.sender_account_email AS lead_sender_account_email,
                l.status AS lead_status,
                c.id AS campaign_id,
                c.name AS campaign_name
             FROM replies r
             JOIN leads l ON r.lead_id = l.id
             JOIN campaigns c ON l.campaign_id = c.id
             WHERE c.user_id = $1
             ORDER BY r.timestamp ASC`,
            [user.id]
        );

        const repliesData = (result.rows || []).map(row => ({
            id: row.reply_id,
            lead_id: row.lead_id,
            subject: row.reply_subject,
            body: row.reply_body,
            sender_email: row.reply_sender_email,
            timestamp: row.reply_timestamp,
            type: row.reply_type,
            is_read: row.reply_is_read,
            gmail_message_id: row.reply_gmail_message_id,
            lead: {
                id: row.lead_id,
                email: row.lead_email,
                first_name: row.lead_first_name,
                last_name: row.lead_last_name,
                business_name: row.lead_business_name,
                website: row.lead_website,
                phone: row.lead_phone,
                custom_fields: row.lead_custom_fields,
                gmail_thread_id: row.lead_gmail_thread_id,
                sender_account_id: row.lead_sender_account_id,
                sender_account_email: row.lead_sender_account_email,
                campaign_id: row.campaign_id,
                status: row.lead_status
            },
            campaign_name: row.campaign_name,
            campaign_id: row.campaign_id
        }));

        // Group messages by contact email (unified thread)
        const threadMap: Record<string, any> = {};

        repliesData.forEach((r: any) => {
            const email = r.lead?.email;
            if (!email) return;

            const isThisMessageBounce = isBounce(r.subject, r.body, r.sender_email);
            const isIncoming = r.type === 'incoming';

            if (!threadMap[email]) {
                threadMap[email] = {
                    email: email,
                    contactEmail: email,
                    contactName: `${r.lead?.first_name || ""} ${r.lead?.last_name || ""}`.trim() || email,
                    campaignName: r.campaign_name || "Unknown Campaign",
                    campaignId: r.campaign_id,
                    leadId: r.lead?.id,
                    company: r.lead?.business_name,
                    website: r.lead?.website,
                    phone: r.lead?.phone,
                    customFields: r.lead?.custom_fields,
                    senderAccountId: r.lead?.sender_account_id,
                    senderAccountEmail: r.lead?.sender_account_email,
                    gmailThreadId: r.lead?.gmail_thread_id || r.gmail_thread_id,
                    subject: r.subject,
                    messages: [],
                    lastMessageAt: r.timestamp,
                    lastMessagePreview: "",
                    isRead: true,
                    status: r.lead?.status,
                    // Initial state: true if lead is BOUNCED, or if this first message is a bounce
                    isBounced: r.lead?.status === 'BOUNCED' || isThisMessageBounce,
                    hasGenuineReply: isIncoming && !isThisMessageBounce
                };
            }

            // Update genuine reply flag
            if (isIncoming && !isThisMessageBounce) {
                threadMap[email].hasGenuineReply = true;
                threadMap[email].isBounced = false; // If we have a genuine reply, it's not a "Bounced" thread
            }

            // If the thread was marked bounced but we find a genuine message, unmark it
            if (threadMap[email].hasGenuineReply) {
                threadMap[email].isBounced = false;
            } else if (isThisMessageBounce || r.lead?.status === 'BOUNCED') {
                // Only mark as bounced if we still haven't seen a genuine reply
                threadMap[email].isBounced = true;
            }

            // Always update the thread metadata with the LATEST message's context
            const currentLastAt = new Date(threadMap[email].lastMessageAt).getTime();
            const messageAt = new Date(r.timestamp).getTime();

            if (messageAt >= currentLastAt) {
                threadMap[email].campaignName = r.campaign_name || "Unknown Campaign";
                threadMap[email].campaignId = r.campaign_id;
                threadMap[email].leadId = r.lead?.id;
                threadMap[email].company = r.lead?.business_name;
                threadMap[email].website = r.lead?.website;
                threadMap[email].phone = r.lead?.phone;
                threadMap[email].customFields = r.lead?.custom_fields;
                threadMap[email].senderAccountId = r.lead?.sender_account_id;
                threadMap[email].senderAccountEmail = r.lead?.sender_account_email;
                if (r.lead?.gmail_thread_id) {
                    threadMap[email].gmailThreadId = r.lead?.gmail_thread_id;
                }
                threadMap[email].lastMessageAt = r.timestamp;
                threadMap[email].lastMessagePreview = r.body.slice(0, 100) + (r.body.length > 100 ? "..." : "");
                threadMap[email].subject = r.subject;
            }

            const message = {
                id: r.id,
                type: r.type || "incoming",
                senderEmail: r.sender_email,
                subject: r.subject,
                body: r.body,
                timestamp: r.timestamp,
                isRead: r.is_read,
                gmailMessageId: r.gmail_message_id,
            };

            threadMap[email].messages.push(message);
            if (!r.is_read) {
                threadMap[email].isRead = false;
            }
        });

        // Convert map to array and sort by latest message
        const threads = Object.values(threadMap).sort((a: any, b: any) =>
            new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
        );

        return NextResponse.json({ threads });
    } catch (error) {
        console.error("[Fetch Inbox Error]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
