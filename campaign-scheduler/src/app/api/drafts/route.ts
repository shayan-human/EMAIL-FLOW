import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";

export async function GET() {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const result = await pool.query(
            `SELECT id, name, subject, body, created_at, folder_id 
             FROM drafts 
             WHERE user_id = $1 
             ORDER BY updated_at DESC`,
            [user.id]
        );

        return NextResponse.json({ data: result.rows || [] });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[GET Drafts API Error]:", message);
        return NextResponse.json({ error: "Failed to fetch drafts", details: message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, subject, body: draftBody, folder_id } = body;

        if (!name) {
            return NextResponse.json({ error: "Draft name is required" }, { status: 400 });
        }

        const result = await pool.query(
            `INSERT INTO drafts (user_id, name, subject, body, folder_id) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, name, subject, body, created_at, folder_id`,
            [
                user.id,
                name,
                subject || "",
                draftBody || "",
                folder_id || null
            ]
        );

        return NextResponse.json({ data: result.rows[0] }, { status: 201 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[POST Drafts API Error]:", message);
        return NextResponse.json({ error: "Failed to create draft", details: message }, { status: 500 });
    }
}
