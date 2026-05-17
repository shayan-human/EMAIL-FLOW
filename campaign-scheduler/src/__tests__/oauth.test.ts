import { describe, it, expect } from 'vitest';

function buildPayload(user: any, email: string, name: string, accessToken: string, refreshToken: string | null) {
    const payload: any = {
        user_id: user.id,
        email,
        name: name || null,
        google_access_token: "encrypted-access",
        is_active: true,
        status: 'CONNECTED',
    };

    if (refreshToken) {
        payload.google_refresh_token = "encrypted-refresh";
    }

    return payload;
}

describe('OAuth Payload Builder', () => {
    const mockUser = { id: 'user-123' };

    it('should include refresh token if present', () => {
        const payload = buildPayload(mockUser, 'test@gmail.com', 'Test', 'access', 'refresh');
        expect(payload.google_refresh_token).toBeDefined();
        expect(payload.google_refresh_token).toBe('encrypted-refresh');
    });

    it('should NOT include refresh token if null', () => {
        const payload = buildPayload(mockUser, 'test@gmail.com', 'Test', 'access', null);
        expect(payload.google_refresh_token).toBeUndefined();
    });
});
