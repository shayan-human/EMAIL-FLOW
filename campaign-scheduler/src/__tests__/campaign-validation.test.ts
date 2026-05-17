import { describe, it, expect } from 'vitest';
import { CampaignPayloadSchema } from '@/lib/validations/campaign';
import { v4 as uuidv4 } from 'uuid';

// A minimal valid payload that should always pass
const validPayload = {
    idempotencyKey: uuidv4(),
    subject: 'Hello {{firstName}}',
    body: 'Hi there!',
    selectedAccountIds: [uuidv4()],
    mappedLeads: [{ email: 'test@example.com' }],
    totalLeads: 1,
    activeAccounts: 1,
    dailyLimitPerAccount: 40,
    startTime: '09:00',
    endTime: '17:00',
    minDelay: 5,
    maxDelay: 10,
    skipWeekends: true,
    enableSchedule: false,
    timezone: 'Asia/Kolkata',
    startDate: '2026-03-11',
    sendingMode: 'round-robin' as const,
};

describe('CampaignPayloadSchema — Guardrail Tests', () => {
    it('accepts a valid payload', () => {
        const result = CampaignPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
    });

    it('rejects minDelay of 0 (parseInt fallback bug)', () => {
        const result = CampaignPayloadSchema.safeParse({ ...validPayload, minDelay: 0 });
        expect(result.success).toBe(false);
    });

    it('rejects maxDelay of 0 (parseInt fallback bug)', () => {
        const result = CampaignPayloadSchema.safeParse({ ...validPayload, maxDelay: 0 });
        expect(result.success).toBe(false);
    });

    it('rejects dailyLimitPerAccount of 0 (parseInt fallback bug)', () => {
        const result = CampaignPayloadSchema.safeParse({ ...validPayload, dailyLimitPerAccount: 0 });
        expect(result.success).toBe(false);
    });

    it('rejects empty selectedAccountIds', () => {
        const result = CampaignPayloadSchema.safeParse({ ...validPayload, selectedAccountIds: [] });
        expect(result.success).toBe(false);
    });

    it('rejects empty mappedLeads', () => {
        const result = CampaignPayloadSchema.safeParse({ ...validPayload, mappedLeads: [] });
        expect(result.success).toBe(false);
    });

    it('accepts non-strict email format for resilience', () => {
        const result = CampaignPayloadSchema.safeParse({
            ...validPayload,
            mappedLeads: [{ email: 'not-an-email-but-resilient' }],
        });
        expect(result.success).toBe(true);
    });

    it('accepts minDelay of 1 (minimum valid)', () => {
        const result = CampaignPayloadSchema.safeParse({ ...validPayload, minDelay: 1, maxDelay: 1 });
        expect(result.success).toBe(true);
    });
});
