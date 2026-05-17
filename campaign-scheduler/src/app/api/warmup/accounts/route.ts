import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";

const BACKEND_URL = process.env.CAMPAIGN_BACKEND_URL;

export async function GET() {
    try {
        const { token } = await auth();
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!BACKEND_URL) {
            return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
        }

        const res = await fetch(`${BACKEND_URL}/warmup/accounts`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("[API /warmup/accounts]:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
