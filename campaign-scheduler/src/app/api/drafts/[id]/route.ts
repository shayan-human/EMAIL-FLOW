import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { name, subject, body: draftBody, folder_id } = body;

        const updateFields: string[] = [];
        const values: any[] = [];
        let valIdx = 1;

        if (name !== undefined) {
            updateFields.push(`name = $${valIdx}`);
            values.push(name);
            valIdx++;
        }
        if (subject !== undefined) {
            updateFields.push(`subject = $${valIdx}`);
            values.push(subject);
            valIdx++;
        }
        if (draftBody !== undefined) {
            updateFields.push(`body = $${valIdx}`);
            values.push(draftBody);
            valIdx++;
        }
        if (folder_id !== undefined) {
            updateFields.push(`folder_id = $${valIdx}`);
            values.push(folder_id);
            valIdx++;
        }

        if (updateFields.length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        updateFields.push(`updated_at = $${valIdx}`);
        values.push(new Date().toISOString());
        valIdx++;

        // Append ID and User ID parameters for WHERE clause
        values.push(id);
        const idIdx = valIdx;
        valIdx++;

        values.push(user.id);
        const userIdIdx = valIdx;

        const queryText = `
            UPDATE drafts 
            SET ${updateFields.join(", ")} 
            WHERE id = $${idIdx} AND user_id = $${userIdIdx} 
            RETURNING id, name, subject, body, created_at, folder_id, updated_at
        `;

        const result = await pool.query(queryText, values);

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Draft not found or access denied" }, { status: 404 });
        }

        return NextResponse.json({ data: result.rows[0] });
    } catch (error) {
        console.error("[PATCH Draft API Error]:", error);
        return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        const result = await pool.query(
            "DELETE FROM drafts WHERE id = $1 AND user_id = $2",
            [id, user.id]
        );

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Draft not found or access denied" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[DELETE Draft API Error]:", error);
        return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
    }
}
