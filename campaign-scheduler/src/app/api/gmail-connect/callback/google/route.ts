import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export async function GET(req: Request) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.redirect(new URL("/", req.url));
        }

        const { searchParams } = new URL(req.url);
        const code = searchParams.get("code");
        const redirectPath = searchParams.get("state") || "/accounts";

        const origin = new URL(req.url).origin;
        const redirectUri = `${origin}/api/gmail-connect/callback/google`;

        console.log(`[OAuth Callback] Code: ${code ? "present" : "missing"}, Redirect Path: ${redirectPath}, URI: ${redirectUri}`);

        if (!code) {
            return NextResponse.redirect(new URL(`${redirectPath}?error=no_code`, req.url));
        }

        // Exchange authorization code for tokens
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
            }),
        });

        if (!tokenResponse.ok) {
            const errData = await tokenResponse.text();
            console.error("[Google Token Exchange Error]:", errData);
            return NextResponse.redirect(new URL(`${redirectPath}?error=token_exchange_failed`, req.url));
        }

        const tokens = await tokenResponse.json();
        const accessToken = tokens.access_token;
        const refreshToken = tokens.refresh_token;
        const expiresIn = tokens.expires_in || 3600;

        // Calculate token expiration time (buffer of 5 minutes)
        const tokenExpiresAt = new Date(Date.now() + (expiresIn - 300) * 1000).toISOString();

        // Get the user's email from Google
        const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!userInfoResponse.ok) {
            return NextResponse.redirect(new URL(`${redirectPath}?error=failed_to_get_email`, req.url));
        }

        const userInfo = await userInfoResponse.json();
        const email = userInfo.email;
        const name = userInfo.name;

        if (!email) {
            return NextResponse.redirect(new URL(`${redirectPath}?error=no_email`, req.url));
        }

        // Check if sender account already exists for this email and user
        const existingCheck = await pool.query(
            "SELECT id FROM sender_accounts WHERE email = $1 AND user_id = $2 LIMIT 1",
            [email, user.id]
        );
        const existing = existingCheck.rows[0];

        const encryptedAccess = encrypt(accessToken);
        const encryptedRefresh = refreshToken ? encrypt(refreshToken) : null;
        if (existing) {
            if (encryptedRefresh) {
                await pool.query(
                    `UPDATE sender_accounts 
                     SET google_access_token = $1, 
                         google_refresh_token = $2, 
                         is_active = true, 
                         status = 'CONNECTED', 
                         token_expires_at = $3
                     WHERE id = $4 AND user_id = $5`,
                    [encryptedAccess, encryptedRefresh, tokenExpiresAt, existing.id, user.id]
                );
            } else {
                await pool.query(
                    `UPDATE sender_accounts 
                     SET google_access_token = $1, 
                         is_active = true, 
                         status = 'CONNECTED', 
                         token_expires_at = $2
                     WHERE id = $3 AND user_id = $4`,
                    [encryptedAccess, tokenExpiresAt, existing.id, user.id]
                );
            }
        } else {
            await pool.query(
                `INSERT INTO sender_accounts 
                    (user_id, email, name, google_access_token, google_refresh_token, is_active, status, token_expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    user.id,
                    email,
                    name || null,
                    encryptedAccess,
                    encryptedRefresh,
                    true,
                    'CONNECTED',
                    tokenExpiresAt
                ]
            );
        }


        return NextResponse.redirect(new URL(`${redirectPath}?success=account_connected`, req.url));

    } catch (error) {
        console.error("[Google OAuth Callback Error]:", error);
        return NextResponse.redirect(new URL("/accounts?error=unknown", req.url));
    }
}
