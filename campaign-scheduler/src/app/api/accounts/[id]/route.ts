import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";

export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { user } = await auth();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await context.params;

        const result = await pool.query(
            "DELETE FROM sender_accounts WHERE id = $1 AND user_id = $2",
            [id, user.id]
        );

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Account not found or access denied" }, { status: 404 });
        }

        return NextResponse.json({ message: "Account deleted successfully" });
    } catch (error) {
        console.error("[DELETE Account API Error]:", error);
        return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
    }
}
