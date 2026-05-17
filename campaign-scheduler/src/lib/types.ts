export interface LeadData {
    id?: string;
    sent_at?: string | null;
    replied_at?: string | null;
    status?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
}

export interface ReplyData {
    id?: string;
    body?: string | null;
    lead_id?: string;
}

export interface ChartPoint {
    date: string;
    sent: number;
    fullDate?: string;
    hourKey?: string;
    replyRate?: number;
    isHighest?: boolean;
}

export interface SendIntelligencePoint {
    key: string;
    label: string;
    sent: number;
    replies: number;
    replyRate: number;
    isHighest?: boolean;
}

export interface BestSendDayPoint {
    day: string;
    replies: number;
    isHighest?: boolean;
}

export interface ReplyQualityResult {
    positive: number;
    negative: number;
    neutral: number;
    total: number;
    percentages: {
        positive: number;
        negative: number;
        neutral: number;
    };
}

export interface CampaignStats {
    id: string;
    status?: string;
    name?: string;
    subject?: string;
    body?: string;
    total_leads?: number;
    leads_sent?: number;
    user_id?: string;
}
