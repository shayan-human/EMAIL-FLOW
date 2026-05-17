import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { pool } from "@/lib/db";

// Webhook payload from n8n when an email is sent or a reply is detected
const WebhookPayloadSchema = z.object({
    campaignId: z.string().uuid(),
    event: z.enum(["EMAIL_SENT", "EMAIL_REPLY", "EMAIL_FAILED"]),
    email: z.string().email(),
    timestamp: z.string().datetime().optional(),
    gmailMessageId: z.string().optional(),
    gmailThreadId: z.string().optional(),
    metadata: z.any().optional(),
});

export async function POST(req: Request) {
    try {
        // Basic auth protection for the webhook
        const headersList = await headers();
        const authHeader = headersList.get("authorization");

        // In production, configure n8n to send a Bearer token matching this secret
        const expectedSecret = process.env.CAMPAIGN_API_SECRET;

        if (expectedSecret && (!authHeader || authHeader !== `Bearer ${expectedSecret}`)) {
            return NextResponse.json({ error: "Unauthorized webhook access" }, { status: 401 });
        }

        const body = await req.json();
        const validationResult = WebhookPayloadSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Invalid webhook payload", details: validationResult.error.flatten() },
                { status: 400 }
            );
        }

        const { campaignId, event, email, gmailMessageId, gmailThreadId } = validationResult.data;

        // Execute function strictly as required by non-negotiable rules
        const rpcResult = await pool.query(
            "SELECT public.update_lead_status_from_webhook($1, $2, $3, $4, $5) AS result",
            [
                campaignId,
                email,
                event,
                gmailMessageId || null,
                gmailThreadId || null,
            ]
        );

        const result = rpcResult.rows[0]?.result;
        const parsedResult = typeof result === "string" ? JSON.parse(result) : result;

        if (!parsedResult || parsedResult.success === false) {
            console.error("[Webhook RPC Error]:", parsedResult?.error || "Unknown function execution error");
            return NextResponse.json(
                {
                    error: "Failed to update lead status via RPC",
                    details: parsedResult?.error || "Unknown error"
                },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, message: "Lead status updated via RPC" });

    } catch (error: unknown) {
        console.error("[Webhook Error]:", error);
        const errMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return NextResponse.json(
            { error: "Internal webhook processing error", details: errMessage },
            { status: 500 }
        );
    }
}
