import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";

export async function GET() {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get all unique emails from leads across all user's campaigns using JOIN scoping
        const leadsResult = await pool.query(
            `SELECT DISTINCT l.email 
             FROM leads l
             JOIN campaigns c ON l.campaign_id = c.id
             WHERE c.user_id = $1`,
            [user.id]
        );
        const existingLeads = leadsResult.rows || [];

        // Get all blocked emails scoped strictly by user_id
        const blockedResult = await pool.query(
            `SELECT email 
             FROM blocked_leads 
             WHERE user_id = $1`,
            [user.id]
        );
        const blockedLeads = blockedResult.rows || [];

        const existingEmails = new Set(
            existingLeads.map(l => l.email?.toLowerCase()).filter(Boolean)
        );
        
        const blockedEmails = new Set(
            blockedLeads.map(l => l.email?.toLowerCase()).filter(Boolean)
        );

        return NextResponse.json({
            existingEmails: Array.from(existingEmails),
            blockedEmails: Array.from(blockedEmails),
            totalExisting: existingEmails.size,
            totalBlocked: blockedEmails.size
        });
    } catch (error) {
        console.error('[Leads API] Error:', error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
