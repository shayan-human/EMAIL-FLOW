import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { user } = await auth();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Perform atomic UPDATE scoped strictly to replies owned by the user's campaigns
        const result = await pool.query(
            `UPDATE replies
             SET is_read = true
             FROM leads l
             JOIN campaigns c ON l.campaign_id = c.id
             WHERE replies.lead_id = l.id
               AND replies.id = $1
               AND c.user_id = $2`,
            [id, user.id]
        );

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Reply not found or access denied" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[POST Inbox Read Error]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
