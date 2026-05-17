/**
 * Gmail API Helper
 * Uses OAuth tokens stored in sender_accounts to send emails via Gmail API.
 */

interface SendEmailOptions {
    to: string;
    subject: string;
    body: string;
    accessToken: string;
    refreshToken?: string | null;
    fromEmail: string;
    threadId?: string;
}

interface GmailError {
    error?: {
        code: number;
        message: string;
    };
}

/**
 * Refresh the Google access token using the refresh token
 */
async function refreshAccessToken(refreshToken: string): Promise<string> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to refresh token: ${err}`);
    }

    const data = await response.json();
    return data.access_token;
}

/**
 * Create a MIME email message as base64url encoded string
 */
function createMimeMessage(to: string, from: string, subject: string, body: string): string {
    const mimeMessage = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/html; charset=utf-8`,
        `MIME-Version: 1.0`,
        "",
        body,
    ].join("\r\n");

    // Base64url encode
    return Buffer.from(mimeMessage)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/**
 * Send an email via Gmail API
 */
export async function sendGmailEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; threadId?: string; error?: string; newAccessToken?: string }> {
    const { to, subject, body, accessToken, refreshToken, fromEmail, threadId } = options;

    let token = accessToken;

    // Try sending with current token
    const raw = createMimeMessage(to, fromEmail, subject, body);

    let response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            raw,
            ...(threadId ? { threadId } : {})
        }),
    });

    // If 401 and we have a refresh token, try refreshing
    if (response.status === 401 && refreshToken) {
        try {
            token = await refreshAccessToken(refreshToken);

            // Retry with refreshed token
            response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    raw,
                    ...(threadId ? { threadId } : {})
                }),
            });
        } catch (refreshError) {
            return {
                success: false,
                error: `Token refresh failed: ${refreshError instanceof Error ? refreshError.message : "Unknown error"}`,
            };
        }
    }

    if (!response.ok) {
        const errorData: GmailError = await response.json().catch(() => ({}));
        return {
            success: false,
            error: errorData.error?.message || `Gmail API error: ${response.status}`,
        };
    }

    const data = await response.json();
    return {
        success: true,
        messageId: data.id,
        threadId: data.threadId,
        newAccessToken: token !== accessToken ? token : undefined,
    };
}
