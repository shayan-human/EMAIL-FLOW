import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";

const BACKEND_URL = process.env.CAMPAIGN_BACKEND_URL;

export async function POST() {
    try {
        const { token } = await auth();
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!BACKEND_URL) {
            return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
        }

        // Fire-and-forget: trigger backend without waiting
        // Backend runs async and can take minutes
        fetch(`${BACKEND_URL}/trigger`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
        }).catch(err => {
            console.error("[API /trigger] Backend call failed:", err);
        });

        // Return immediately - don't wait for backend
        return NextResponse.json({ 
            success: true, 
            message: "Sync started in background",
            note: "Backend processes async. Refresh inbox in a few minutes."
        });
    } catch (error) {
        console.error("[API /trigger]:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
