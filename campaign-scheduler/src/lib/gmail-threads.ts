/**
 * Gmail Threads API Helper
 * Used for polling Gmail threads to detect replies to sent campaign emails.
 */

interface ThreadMessage {
    id: string;
    threadId: string;
}

interface GmailThread {
    id: string;
    messages: ThreadMessage[];
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
 * Get a Gmail thread by ID to check for replies.
 * Returns the number of messages in the thread.
 * If messages > 1, there's at least one reply.
 */
export async function getGmailThread(
    accessToken: string,
    refreshToken: string | null,
    threadId: string
): Promise<{ messageCount: number; error?: string }> {
    let token = accessToken;

    let response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=minimal`,
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    // If 401 and we have a refresh token, try refreshing
    if (response.status === 401 && refreshToken) {
        try {
            token = await refreshAccessToken(refreshToken);
            response = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=minimal`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
        } catch (refreshError) {
            return {
                messageCount: 0,
                error: `Token refresh failed: ${refreshError instanceof Error ? refreshError.message : "Unknown error"}`,
            };
        }
    }

    if (!response.ok) {
        return {
            messageCount: 0,
            error: `Gmail API error: ${response.status}`,
        };
    }

    const data: GmailThread = await response.json();
    return { messageCount: data.messages?.length || 0 };
}
