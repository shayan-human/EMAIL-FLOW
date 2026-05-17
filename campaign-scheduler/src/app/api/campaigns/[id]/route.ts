import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { auth } from "@/lib/auth-helper";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: campaignId } = await params;
        const body = await request.json();
        const { name, status } = body;

        // 1. Verify ownership
        const ownershipResult = await pool.query(
            "SELECT user_id FROM campaigns WHERE id = $1",
            [campaignId]
        );
        const campaign = ownershipResult.rows[0];

        if (!campaign) {
            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }

        if (campaign.user_id !== user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 2. Perform update
        const updateResult = await pool.query(
            `UPDATE campaigns 
             SET name = COALESCE($1, name), 
                 status = COALESCE($2, status) 
             WHERE id = $3 
             RETURNING *`,
            [name || null, status || null, campaignId]
        );

        return NextResponse.json({ success: true, campaign: updateResult.rows[0] });
    } catch (error) {
        console.error("[PATCH Campaign Error]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: campaignId } = await params;

        // 1. Verify ownership
        const ownershipResult = await pool.query(
            "SELECT user_id FROM campaigns WHERE id = $1",
            [campaignId]
        );
        const campaign = ownershipResult.rows[0];

        if (!campaign) {
            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }

        if (campaign.user_id !== user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 2. Delete campaign
        await pool.query(
            "DELETE FROM campaigns WHERE id = $1",
            [campaignId]
        );

        return NextResponse.json({ success: true, message: "Campaign deleted successfully" });
    } catch (error) {
        console.error("[DELETE Campaign Error]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
