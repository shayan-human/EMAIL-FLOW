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
            `SELECT id, name, color, created_at 
             FROM draft_folders 
             WHERE user_id = $1 
             ORDER BY name ASC`,
            [user.id]
        );

        return NextResponse.json({ data: result.rows || [] });
    } catch (error) {
        console.error("[GET Folders API Error]:", error);
        return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, color } = body;

        if (!name) {
            return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
        }

        const result = await pool.query(
            `INSERT INTO draft_folders (user_id, name, color) 
             VALUES ($1, $2, $3) 
             RETURNING id, name, color, created_at`,
            [
                user.id,
                name,
                color || "#F59E0B"
            ]
        );

        return NextResponse.json({ data: result.rows[0] }, { status: 201 });
    } catch (error) {
        console.error("[POST Folders API Error]:", error);
        return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
    }
}
