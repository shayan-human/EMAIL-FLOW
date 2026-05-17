import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export async function GET() {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch sender accounts scoped to user_id
        const accountsResult = await pool.query(
            "SELECT * FROM sender_accounts WHERE user_id = $1 ORDER BY created_at DESC",
            [user.id]
        );
        const accounts = accountsResult.rows || [];

        const accountIds = accounts.map(a => a.id);

        let warmupStatusMap: Record<string, string> = {};
        if (accountIds.length > 0) {
            const warmupResult = await pool.query(
                "SELECT gmail_account_id, status FROM warmup_accounts WHERE gmail_account_id = ANY($1::uuid[])",
                [accountIds]
            );
            (warmupResult.rows || []).forEach(row => {
                warmupStatusMap[row.gmail_account_id] = row.status;
            });
        }

        // Fetch emails sent today per account
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const sentTodayResult = await pool.query(
            `SELECT sender_account_id, status FROM leads 
             WHERE sent_at >= $1 
             AND status IN ('SENT', 'REPLIED') 
             AND sender_account_id = ANY($2::uuid[])`,
            [startOfDay.toISOString(), accountIds]
        );

        const sentTodayMap: Record<string, number> = {};
        (sentTodayResult.rows || []).forEach(lead => {
            if (lead.sender_account_id) {
                sentTodayMap[lead.sender_account_id] = (sentTodayMap[lead.sender_account_id] || 0) + 1;
            }
        });

        const accountsWithStats = accounts.map(acc => ({
            ...acc,
            google_access_token: "••••••••", // Sanitize
            google_refresh_token: acc.google_refresh_token ? "••••••••" : null, // Sanitize
            sent_today: sentTodayMap[acc.id] || 0,
            last_synced_at: acc.created_at,
            warmup_status: warmupStatusMap[acc.id] || null,
        }));

        return NextResponse.json({ data: accountsWithStats });
    } catch (error) {
        console.error("[GET Accounts API Error]:", error);
        return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { email, google_access_token, google_refresh_token } = body;

        if (!email || !google_access_token) {
            return NextResponse.json(
                { error: "Missing email or access token" },
                { status: 400 }
            );
        }

        // Check if account already exists
        const existingResult = await pool.query(
            "SELECT id, user_id FROM sender_accounts WHERE email = $1 AND user_id = $2 LIMIT 1",
            [email, user.id]
        );
        const existing = existingResult.rows[0];

        if (existing) {
            // Update existing account
            const updateResult = await pool.query(
                `UPDATE sender_accounts 
                 SET google_access_token = $1, 
                     google_refresh_token = $2, 
                     is_active = true 
                 WHERE id = $3 
                 RETURNING *`,
                [
                    encrypt(google_access_token),
                    google_refresh_token ? encrypt(google_refresh_token) : null,
                    existing.id
                ]
            );

            return NextResponse.json(
                { message: "Account updated", data: updateResult.rows[0] },
                { status: 200 }
            );
        }

        // Create new sender account
        const insertResult = await pool.query(
            `INSERT INTO sender_accounts (user_id, email, google_access_token, google_refresh_token) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [
                user.id,
                email,
                encrypt(google_access_token),
                google_refresh_token ? encrypt(google_refresh_token) : null
            ]
        );

        return NextResponse.json(
            { message: "Account connected successfully", data: insertResult.rows[0] },
            { status: 201 }
        );

    } catch (error) {
        console.error("[POST Accounts API Error]:", error);
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }
}
