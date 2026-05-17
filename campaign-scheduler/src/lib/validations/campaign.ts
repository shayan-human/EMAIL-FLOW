import { z } from 'zod';

export const CampaignSettingsSchema = z.object({
    totalLeads: z.number().int().min(0, "Total leads must be at least 0"),
    activeAccounts: z.number().int().min(1, "Must have at least 1 active account"),
    dailyLimitPerAccount: z.number().int().min(1, "Daily limit must be at least 1"),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)").optional().nullish(),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)").optional().nullish(),
    minDelay: z.number().int().min(1, "Min delay must be at least 1 minute"),
    maxDelay: z.number().int().min(1, "Max delay must be at least 1 minute"),
    skipWeekends: z.boolean(),
    enableSchedule: z.boolean().default(false),
    timezone: z.string().optional().nullish(),
    startDate: z.string().min(1, "Start Date is required"),
    sendingMode: z.enum(["round-robin", "sequential"]).default("round-robin"),
    senderDisplayName: z.string().optional().nullish(),
}).refine(data => {
    if (!data.enableSchedule) return true;
    return data.maxDelay >= data.minDelay;
}, {
    message: "Maximum delay cannot be less than minimum delay",
    path: ["maxDelay"]
}).refine(data => {
    if (!data.enableSchedule || !data.startTime || !data.endTime) return true;
    const [startH, startM] = data.startTime.split(':').map(Number);
    const [endH, endM] = data.endTime.split(':').map(Number);
    return (endH * 60 + endM) > (startH * 60 + startM);
}, {
    message: "End time must be after start time",
    path: ["endTime"]
});

export type CampaignSettings = z.infer<typeof CampaignSettingsSchema>;

export const CampaignPayloadSchema = CampaignSettingsSchema.extend({
    idempotencyKey: z.string().uuid("Invalid idempotency key"),
    subject: z.string().optional().default(""),
    body: z.string().optional().default(""),
    selectedAccountIds: z.array(z.string().uuid()).min(1, "At least one account must be selected"),
    mappedLeads: z.array(z.object({
        email: z.string().min(1, "Email is required"),
        firstName: z.string().optional().nullish(),
        lastName: z.string().optional().nullish(),
        fullName: z.string().optional().nullish(),
        businessName: z.string().optional().nullish(),
        website: z.string().optional().nullish(),
    })).min(1, "At least one valid lead is required"),
    selectedDraftIds: z.array(z.string().uuid()).optional().default([]),
    copyMode: z.enum(["single", "rotate"]).optional().default("single"),
});

export type CampaignPayload = z.infer<typeof CampaignPayloadSchema>;
