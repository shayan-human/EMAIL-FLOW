import type { LeadData, SendIntelligencePoint, BestSendDayPoint, ReplyQualityResult, ReplyData } from './types';

export function processChartData(activityData: LeadData[]) {
    // 30D and 7D
    const dailyStats: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailyStats[d.toISOString().split('T')[0]] = 0;
    }

    // 24H
    const hourlyStats: Record<string, number> = {};
    for (let i = 0; i < 24; i++) {
        const d = new Date();
        d.setHours(d.getHours() - i);
        const hourKey = d.toISOString().substring(0, 13); // "YYYY-MM-DDTHH"
        hourlyStats[hourKey] = 0;
    }

    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    activityData.forEach((lead: LeadData) => {
        if (!lead.sent_at) return;

        // Daily
        const dateStr = lead.sent_at.split('T')[0];
        if (dailyStats[dateStr] !== undefined) dailyStats[dateStr]++;

        // Hourly
        const sentDt = new Date(lead.sent_at);
        if (sentDt >= twentyFourHoursAgo) {
            const hourKey = sentDt.toISOString().substring(0, 13);
            if (hourlyStats[hourKey] !== undefined) {
                hourlyStats[hourKey]++;
            }
        }
    });

    const chartData30D = Object.entries(dailyStats)
        .map(([date, count]) => ({
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            sent: count,
            fullDate: date
        }))
        .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

    const chartData7D = chartData30D.slice(-7);

    const chartData24H = Object.entries(hourlyStats)
        .map(([hourKey, count]) => {
            const d = new Date(hourKey + ":00:00Z");
            return {
                date: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }), // "14:00"
                sent: count,
                fullDate: hourKey
            };
        })
        .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

    return { "24H": chartData24H, "7D": chartData7D, "30D": chartData30D };
}

export function processSendIntelligence(leads: LeadData[], timeframe: "24H" | "7D" | "30D" = "7D"): SendIntelligencePoint[] {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const buckets: Record<string, { label: string; sent: number; replies: number }> = {};

    const now = new Date();

    if (timeframe === "24H") {
        for (let i = 0; i < 24; i++) {
            const d = new Date(now);
            d.setHours(d.getHours() - i, 0, 0, 0);
            const key = d.toISOString().substring(0, 13); // YYYY-MM-DDTHH
            buckets[key] = {
                label: d.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false }) + ":00",
                sent: 0,
                replies: 0
            };
        }
    } else {
        const days = timeframe === "30D" ? 30 : 7;
        for (let i = 0; i < days; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            buckets[key] = {
                label: timeframe === "30D" && i % 7 !== 0 && days > 7 ? d.toLocaleDateString('en-US', { day: 'numeric' }) : dayNames[d.getDay()],
                sent: 0,
                replies: 0
            };
        }
    }

    leads.forEach(lead => {
        if (!lead.sent_at) return;
        const sentDate = new Date(lead.sent_at);
        let key = "";

        if (timeframe === "24H") {
            key = sentDate.toISOString().substring(0, 13);
        } else {
            key = sentDate.toISOString().split('T')[0];
        }

        if (buckets[key]) {
            buckets[key].sent++;
            if (lead.status === 'REPLIED') {
                buckets[key].replies++;
            }
        }
    });

    const data = Object.entries(buckets)
        .map(([key, value]) => ({
            key,
            ...value,
            replyRate: value.sent > 0 ? parseFloat(((value.replies / value.sent) * 100).toFixed(1)) : 0
        }))
        .sort((a, b) => a.key.localeCompare(b.key));

    const maxReplies = Math.max(...data.map(d => d.replies));

    return data.map(d => ({
        ...d,
        isHighest: maxReplies > 0 && d.replies === maxReplies
    }));
}

export function processBestSendDay(leads: LeadData[]): BestSendDayPoint[] {
    // Keep for backward compatibility if needed, but we'll likely use processSendIntelligence
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts: Record<string, number> = {
        'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0
    };

    leads.forEach(lead => {
        if (!lead.sent_at || lead.status !== 'REPLIED') return;
        const day = dayNames[new Date(lead.sent_at).getDay()];
        if (counts[day] !== undefined) counts[day]++;
    });

    const data = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
        day,
        replies: counts[day]
    }));

    const maxReplies = Math.max(...data.map(d => d.replies));

    return data.map(d => ({
        ...d,
        isHighest: maxReplies > 0 && d.replies === maxReplies
    }));
}

export function processReplyQuality(replies: ReplyData[]): ReplyQualityResult {
    const positiveKeywords = ['interested', 'yes', 'tell me more', 'sounds good', "let's chat", 'when', 'how', 'love to', 'open to'];
    const negativeKeywords = ['unsubscribe', 'remove', 'not interested', 'stop', "don't contact", 'no thanks'];

    let positive = 0;
    let negative = 0;
    let neutral = 0;

    replies.forEach(reply => {
        const body = (reply.body || "").toLowerCase();

        const isPositive = positiveKeywords.some(kw => body.includes(kw));
        const isNegative = negativeKeywords.some(kw => body.includes(kw));

        if (isPositive) positive++;
        else if (isNegative) negative++;
        else neutral++;
    });

    const total = positive + negative + neutral;

    return {
        positive,
        negative,
        neutral,
        total,
        percentages: total > 0 ? {
            positive: Math.round((positive / total) * 100),
            negative: Math.round((negative / total) * 100),
            neutral: Math.round((neutral / total) * 100)
        } : { positive: 0, negative: 0, neutral: 0 }
    };
}
