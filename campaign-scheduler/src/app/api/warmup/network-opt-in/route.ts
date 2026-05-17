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

        const res = await fetch(`${BACKEND_URL}/warmup/network-opt-in`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("[API /warmup/network-opt-in]:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
