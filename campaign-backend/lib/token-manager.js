const { pool } = require('./db');
const { encrypt, decrypt } = require('./encryption');
const { google } = require('googleapis');
const { maskEmail } = require('./log-utils');

const REFRESH_BUFFER_MINUTES = 15;
const MAX_REFRESH_FAILURES = 3;

/**
 * Unified Token Manager using official googleapis library
 * Handles: refresh, validation, failure tracking, re-auth detection
 */

// Create OAuth2 client (reusable)
function createOAuth2Client() {
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    
    return new google.auth.OAuth2(clientId, clientSecret, '');
}

/**
 * Check if token needs refresh (expired or expiring soon)
 */
function needsTokenRefresh(account) {
    if (!account.token_expires_at) {
        return true;
    }

    const expiresAt = new Date(account.token_expires_at);
    const bufferMs = REFRESH_BUFFER_MINUTES * 60 * 1000;
    const threshold = new Date(Date.now() + bufferMs);

    return expiresAt < threshold;
}

/**
 * Mark account as needing re-authentication
 */
async function markReauthRequired(accountId, email, reason) {
    // Fetch current failure count to avoid relying on caller state
    let previousCount = 0;
    try {
        const result = await pool.query(
            'SELECT refresh_failure_count FROM sender_accounts WHERE id = $1',
            [accountId]
        );
        previousCount = result.rows[0]?.refresh_failure_count || 0;
    } catch (err) {
        console.error('[Token Manager] Failed to select failure count:', err.message);
        previousCount = 0;
    }

    const currentCount = previousCount + 1;
    
    console.error(`[Token Manager] Re-auth required for ${maskEmail(email)}: ${reason} (failure #${currentCount})`);

    const updateData = {
        status: 'REAUTH_REQUIRED',
        refresh_failure_count: currentCount,
        last_token_refresh_at: new Date().toISOString()
    };

    const now = new Date().toISOString();
    if (currentCount >= MAX_REFRESH_FAILURES) {
        await pool.query(
            'UPDATE sender_accounts SET status = $1, refresh_failure_count = $2, last_token_refresh_at = $3, is_active = false WHERE id = $4',
            ['REAUTH_REQUIRED', currentCount, now, accountId]
        );
    } else {
        await pool.query(
            'UPDATE sender_accounts SET status = $1, refresh_failure_count = $2, last_token_refresh_at = $3 WHERE id = $4',
            ['REAUTH_REQUIRED', currentCount, now, accountId]
        );
    }

    return currentCount >= MAX_REFRESH_FAILURES;
}

/**
 * Update account with new token and expiry
 */
async function updateAccountToken(accountId, accessToken, expiresIn, email) {
    // Ensure we have a reasonable expiry time (minimum 5 minutes)
    const minExpiryMs = 5 * 60 * 1000;
    const actualExpiresInMs = Math.max(expiresIn * 1000, minExpiryMs);
    const expiresAt = new Date(Date.now() + actualExpiresInMs - 300000).toISOString(); // 5 min buffer

    console.log(`[Token Manager] Token for ${maskEmail(email)} will expire at: ${expiresAt} (${Math.round(actualExpiresInMs/60000)} mins)`);

    await pool.query(
        'UPDATE sender_accounts SET google_access_token = $1, token_expires_at = $2, status = $3, refresh_failure_count = 0, last_token_refresh_at = $4 WHERE id = $5',
        [encrypt(accessToken), expiresAt, 'CONNECTED', new Date().toISOString(), accountId]
    );
}

/**
 * Main function: Get valid access token for account
 * Uses googleapis library for automatic token refresh
 */
async function getValidAccessToken(account) {
    const accountId = account.id;
    const email = account.email;
    const refreshToken = decrypt(account.google_refresh_token);

    if (!refreshToken) {
        console.error(`[Token Manager] No refresh token for ${maskEmail(email)}`);
        return { error: 'NO_REFRESH_TOKEN', needsReauth: true };
    }

    if (!needsTokenRefresh(account)) {
        return { accessToken: decrypt(account.google_access_token) };
    }

    console.log(`[Token Manager] Token expiring for ${maskEmail(email)}, refreshing via googleapis...`);
    
    const maxRefreshAttempts = 3;
    
    for (let attempts = 0; attempts < maxRefreshAttempts; attempts++) {
        try {
            const oauth2Client = createOAuth2Client();
            oauth2Client.setCredentials({
                refresh_token: refreshToken
            });

            const tokenInfo = await oauth2Client.getAccessToken();
            
            if (!tokenInfo.token) {
                throw new Error('No access token returned');
            }

            let expiresIn = 3600;
            try {
                const tokenResponse = await oauth2Client.getTokenInfo(tokenInfo.token);
                if (tokenResponse.expiry_date) {
                    expiresIn = Math.floor((tokenResponse.expiry_date - Date.now()) / 1000);
                    console.log(`[Token Manager] Token expires in: ${Math.floor(expiresIn/60)} minutes`);
                    
                    if (expiresIn < 300) {
                        console.error(`[Token Manager] ⚠️ Token expires too soon (${expiresIn}s). Marking for re-auth.`);
                        await markReauthRequired(accountId, email, `Token expires in only ${expiresIn} seconds`);
                        return { error: 'TOKEN_EXPIRES_TOO_SOON', needsReauth: true };
                    }
                }
            } catch (infoErr) {
                console.warn(`[Token Manager] Could not get token info: ${infoErr.message}, using default expiry`);
            }
            
            await updateAccountToken(accountId, tokenInfo.token, expiresIn, email);
            
            console.log(`[Token Manager] ✅ Token refreshed for ${maskEmail(email)} (attempt ${attempts + 1})`);
            return { accessToken: tokenInfo.token };

        } catch (err) {
            console.error(`[Token Manager] Refresh attempt ${attempts + 1} failed for ${maskEmail(email)}:`, err.message);
            
            if (err.message?.includes('invalid_grant') || 
                err.message?.includes('Token revoked') ||
                err.message?.includes('unauthorized_client') ||
                err.message?.includes('NO_REFRESH_TOKEN')) {
                
                const disabled = await markReauthRequired(accountId, email, err.message);
                return { error: err.message, needsReauth: true, accountDisabled: disabled };
            }
            
            if (attempts === maxRefreshAttempts - 1) {
                return { error: err.message, needsReauth: false };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        }
    }
    
    return { error: 'Max refresh attempts reached', needsReauth: false };
}

/**
 * Force refresh token (for proactive refresh service)
 */
async function forceRefreshToken(account) {
    const email = account.email;
    const accountId = account.id;
    const refreshToken = decrypt(account.google_refresh_token);

    if (!refreshToken) {
        await markReauthRequired(accountId, email, 'NO_REFRESH_TOKEN');
        return { error: 'NO_REFRESH_TOKEN', needsReauth: true };
    }

    try {
        const oauth2Client = createOAuth2Client();
        oauth2Client.setCredentials({
            refresh_token: refreshToken
        });

        const tokenInfo = await oauth2Client.getAccessToken();
        
        if (!tokenInfo.token) {
            throw new Error('No access token returned');
        }

        const expiresIn = 3600;
        await updateAccountToken(accountId, tokenInfo.token, expiresIn, email);
        
        return { accessToken: tokenInfo.token };

    } catch (err) {
        console.error(`[Token Manager] Force refresh failed for ${maskEmail(email)}:`, err.message);
        
        if (err.message?.includes('invalid_grant') || 
            err.message?.includes('Token revoked') ||
            err.message?.includes(' unauthorized_client')) {
            
            await markReauthRequired(accountId, email, err.message);
            return { error: err.message, needsReauth: true };
        }

        return { error: err.message, needsReauth: false };
    }
}

module.exports = {
    needsTokenRefresh,
    markReauthRequired,
    updateAccountToken,
    getValidAccessToken,
    forceRefreshToken,
    REFRESH_BUFFER_MINUTES,
    MAX_REFRESH_FAILURES
};
