const { pool } = require('./db');
const { needsTokenRefresh, forceRefreshToken, markReauthRequired, REFRESH_BUFFER_MINUTES } = require('./token-manager');
const { maskEmail } = require('./log-utils');

/**
 * Proactive Token Refresh Service
 * Runs every 15 minutes to refresh tokens before they expire
 */

async function refreshExpiringTokens() {
    console.log(`[${new Date().toISOString()}] Checking for tokens needing proactive refresh...`);

    try {
        // Fetch accounts that need refresh (expired or expiring soon)
        // Using separate queries for clarity and proper PostgREST syntax
        
        let accountsNeedingRefresh = [];
        try {
            const result = await pool.query(
                'SELECT * FROM sender_accounts WHERE status = $1 AND is_active = true',
                ['CONNECTED']
            );
            accountsNeedingRefresh = result.rows;
        } catch (fetchError) {
            console.error('[Token Refresh] Failed to fetch accounts:', fetchError.message);
            return;
        }

        if (!accountsNeedingRefresh || accountsNeedingRefresh.length === 0) {
            console.log('[Token Refresh] No connected accounts found');
            return;
        }

        // Filter accounts that actually need refresh (in JS, not PostgREST)
        const accountsToRefresh = accountsNeedingRefresh.filter(account => 
            needsTokenRefresh(account)
        );

        if (accountsToRefresh.length === 0) {
            console.log('[Token Refresh] No tokens need refreshing');
            return;
        }

        console.log(`[Token Refresh] Found ${accountsToRefresh.length} account(s) needing token refresh`);

        let successCount = 0;
        let failureCount = 0;
        let reauthCount = 0;

        for (const account of accountsToRefresh) {
            console.log(`[Token Refresh] Proactively refreshing token for ${maskEmail(account.email)}...`);
            
            const result = await forceRefreshToken(account);

            if (result.accessToken) {
                successCount++;
                console.log(`[Token Refresh] ✅ Token refreshed for ${maskEmail(account.email)}`);
            } else if (result.needsReauth) {
                reauthCount++;
                console.warn(`[Token Refresh] ⚠️ Re-auth required for ${maskEmail(account.email)}`);
                if (result.accountDisabled) {
                    console.error(`[Token Refresh] 🔴 Account ${maskEmail(account.email)} AUTO-DISABLED after 3 failures`);
                }
            } else {
                failureCount++;
                console.error(`[Token Refresh] ❌ Temporary failure for ${maskEmail(account.email)}: ${result.error}`);
            }
        }

        console.log(`[Token Refresh] Cycle complete - Success: ${successCount}, Re-auth: ${reauthCount}, Failed: ${failureCount}`);
        
    } catch (error) {
        console.error('[Token Refresh] Proactive refresh cycle failed:', error.message);
    }
}

module.exports = { refreshExpiringTokens };
