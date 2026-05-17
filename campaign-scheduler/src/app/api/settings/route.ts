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
            "SELECT * FROM user_settings WHERE user_id = $1 LIMIT 1",
            [user.id]
        );

        return NextResponse.json({ data: result.rows[0] || null });
    } catch (error) {
        console.error("[GET Settings API Error]:", error);
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        
        // Allowed fields for settings
        const allowedFields = [
            "theme",
            "reply_notifications",
            "bounce_notifications",
            "timezone",
            "send_window_from",
            "send_window_to",
            "send_window_enabled",
            "display_name"
        ];

        // Check if settings row already exists
        const existingCheck = await pool.query(
            "SELECT id FROM user_settings WHERE user_id = $1 LIMIT 1",
            [user.id]
        );

        if (existingCheck.rows.length > 0) {
            // Build dynamic update query to preserve other fields
            const updates: string[] = [];
            const values: any[] = [];
            let valIdx = 1;

            for (const field of allowedFields) {
                if (body[field] !== undefined) {
                    updates.push(`${field} = $${valIdx}`);
                    values.push(body[field]);
                    valIdx++;
                }
            }

            if (updates.length > 0) {
                updates.push(`updated_at = $${valIdx}`);
                values.push(new Date().toISOString());
                valIdx++;

                values.push(user.id);
                const queryText = `
                    UPDATE user_settings 
                    SET ${updates.join(", ")} 
                    WHERE user_id = $${valIdx} 
                    RETURNING *
                `;

                const updateResult = await pool.query(queryText, values);
                return NextResponse.json({ message: "Settings updated", data: updateResult.rows[0] });
            }

            return NextResponse.json({ message: "No updates provided" });
        } else {
            // Insert new default row with provided values
            const fields = ["user_id"];
            const placeholders = ["$1"];
            const values = [user.id];
            let valIdx = 2;

            for (const field of allowedFields) {
                if (body[field] !== undefined) {
                    fields.push(field);
                    placeholders.push(`$${valIdx}`);
                    values.push(body[field]);
                    valIdx++;
                }
            }

            const queryText = `
                INSERT INTO user_settings (${fields.join(", ")}) 
                VALUES (${placeholders.join(", ")}) 
                RETURNING *
            `;

            const insertResult = await pool.query(queryText, values);
            return NextResponse.json({ message: "Settings created", data: insertResult.rows[0] }, { status: 201 });
        }
    } catch (error) {
        console.error("[POST Settings API Error]:", error);
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
