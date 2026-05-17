import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";

const BACKEND_URL = process.env.CAMPAIGN_BACKEND_URL;

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { token } = await auth();
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!BACKEND_URL) {
            return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
        }

        const { id } = await params;
        const url = new URL(request.url);
        const days = url.searchParams.get("days") || "14";

        const res = await fetch(`${BACKEND_URL}/warmup/stats/${id}?days=${days}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("[API /warmup/stats]:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
