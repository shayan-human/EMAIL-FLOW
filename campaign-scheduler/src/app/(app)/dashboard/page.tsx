import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";
import DashboardClient from "./DashboardClient";
import { redirect } from "next/navigation";
import { processChartData, processBestSendDay, processReplyQuality } from "@/lib/chart-utils";
import type { LeadData, ReplyData } from "@/lib/types";
import { isBounce } from "@/lib/email-utils";

export default async function DashboardPage() {
    const { user } = await auth();

    if (!user) {
        return null;
    }

    // 1. Initial parallel fetch for campaigns and core stats
    const [campaignsRes, accountsRes] = await Promise.all([
        pool.query(
            "SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC",
            [user.id]
        ),
        pool.query(
            "SELECT COUNT(*) AS count FROM sender_accounts WHERE user_id = $1 AND is_active = true",
            [user.id]
        )
    ]);

    const campaignsData = campaignsRes.rows || [];
    const campaignIds = campaignsData.map((c: any) => c.id);
    const activeAccounts = parseInt(accountsRes.rows[0].count) || 0;

    // Initial default values
    let stats = {
        totalCampaigns: campaignsData.length,
        emailsSent: 0,
        totalReplies: 0,
        avgReplyRate: "0%",
        activeAccounts,
        bouncedCount: 0,
        avgReplyTime: "---",
    };
    let chartData: Record<string, any[]> = { "24H": [], "7D": [], "30D": [] };
    let bestSendDay: any[] = [];
    let replyQuality: any = { positive: 0, negative: 0, neutral: 0, total: 0, percentages: { positive: 0, negative: 0, neutral: 0 } };
    let initialCampaigns: any[] = [];

    if (campaignIds.length > 0) {
        // 2. Fetch Aggregated Statistics in parallel
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [
            sentRes,
            bouncedRes,
            repliedLeadsRes,
            campaignStatsRes,
            activityRes
        ] = await Promise.all([
            // Exact counts for the main cards - bypasses row limits
            pool.query(
                "SELECT COUNT(*) AS count FROM leads WHERE campaign_id = ANY($1) AND status IN ('SENT', 'REPLIED')",
                [campaignIds]
            ),

            pool.query(
                "SELECT COUNT(*) AS count FROM leads WHERE campaign_id = ANY($1) AND status = 'BOUNCED'",
                [campaignIds]
            ),

            // Only fetch actual lead rows for status = 'REPLIED' to filter them
            pool.query(
                "SELECT id, status, sent_at, replied_at, email FROM leads WHERE campaign_id = ANY($1) AND status = 'REPLIED'",
                [campaignIds]
            ),

            // Get per-campaign counts for the table
            pool.query(
                "SELECT * FROM campaign_stats WHERE campaign_id = ANY($1)",
                [campaignIds]
            ),

            // Get activity data for chart
            pool.query(
                "SELECT id, sent_at, status FROM leads WHERE campaign_id = ANY($1) AND sent_at >= $2",
                [campaignIds, thirtyDaysAgo.toISOString()]
            )
        ]);

        const sentCount = parseInt(sentRes.rows[0].count) || 0;
        let baseBouncedCount = parseInt(bouncedRes.rows[0].count) || 0;
        const repliedLeads = repliedLeadsRes.rows || [];

        // Fetch replies for leads marked as REPLIED to verify they are genuine
        const potentialReplyLeadIds = repliedLeads.map(l => l.id);
        const genuineReplyEmails = new Set<string>();
        let additionalBouncedCount = 0;
        let genuineReplyTimes: number[] = [];
        let allGenuineReplies: any[] = [];

        if (potentialReplyLeadIds.length > 0) {
            const repliesResult = await pool.query(
                "SELECT lead_id, subject, body, sender_email, timestamp, type FROM replies WHERE lead_id = ANY($1)",
                [potentialReplyLeadIds]
            );

            const replies = repliesResult.rows || [];
            
            const repliesByLead: Record<string, any[]> = {};
            replies.forEach(r => {
                if (!repliesByLead[r.lead_id]) repliesByLead[r.lead_id] = [];
                repliesByLead[r.lead_id].push(r);
            });

            repliedLeads.forEach(lead => {
                const leadReplies = repliesByLead[lead.id] || [];
                const genuineReplies = leadReplies.filter(r => 
                    r.type === 'incoming' && !isBounce(r.subject, r.body, r.sender_email)
                );

                if (genuineReplies.length > 0) {
                    genuineReplyEmails.add(lead.email);
                    allGenuineReplies.push(...genuineReplies);
                    
                    const earliestReply = genuineReplies.sort((a, b) => 
                        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    )[0];

                    if (lead.sent_at && earliestReply.timestamp) {
                        const timeDiff = (new Date(earliestReply.timestamp).getTime() - new Date(lead.sent_at).getTime()) / (1000 * 60 * 60);
                        if (timeDiff > 0) genuineReplyTimes.push(timeDiff);
                    }
                } else {
                    // This was marked REPLIED but only contains bounces
                    additionalBouncedCount++;
                }
            });
        }

        const genuineReplyCount = genuineReplyEmails.size;
        const totalBounced = baseBouncedCount + additionalBouncedCount;
        const avgReplyRate = sentCount > 0 ? Math.round((genuineReplyCount / sentCount) * 100) : 0;
        const avgTime = genuineReplyTimes.length > 0
            ? Math.round(genuineReplyTimes.reduce((a, b) => a + b, 0) / genuineReplyTimes.length)
            : null;

        stats = {
            ...stats,
            emailsSent: sentCount,
            totalReplies: genuineReplyCount,
            avgReplyRate: `${avgReplyRate}%`,
            bouncedCount: totalBounced,
            avgReplyTime: avgTime !== null ? `${avgTime}h` : "---"
        };

        // Enrich campaigns for the table
        const campaignStatsMap: Record<string, any> = {};
        if (campaignStatsRes.rows) {
            campaignStatsRes.rows.forEach((s: any) => {
                campaignStatsMap[s.campaign_id] = s;
            });
        }

        initialCampaigns = campaignsData.map((c: any) => {
            const s = campaignStatsMap[c.id] || {};
            const sent = s.total_sent || 0;
            return {
                ...c,
                sent_count: sent,
                reply_count: s.total_replied || 0,
                completion_rate: c.total_leads > 0 ? Math.round((sent / c.total_leads) * 100) : 0,
                reply_rate: s.reply_rate || 0,
            };
        });

        // Generate Chart Data
        const activityData = (activityRes.rows || []) as LeadData[];
        chartData = processChartData(activityData);
        bestSendDay = processBestSendDay(activityData);

        // Reply Quality Data - only use genuine replies
        replyQuality = processReplyQuality(allGenuineReplies.map(r => ({
            id: r.id,
            body: r.body,
            lead_id: r.lead_id
        })));
    }

    return (
        <DashboardClient
            user={user}
            initialCampaigns={initialCampaigns}
            initialStats={stats}
            initialChartData={chartData}
            initialBestSendDay={bestSendDay}
            initialReplyQuality={replyQuality}
        />
    );
}
