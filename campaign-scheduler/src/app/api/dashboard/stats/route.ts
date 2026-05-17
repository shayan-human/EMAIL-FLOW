import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { auth } from "@/lib/auth-helper";
import { processChartData, processSendIntelligence, processReplyQuality } from "@/lib/chart-utils";
import type { LeadData } from "@/lib/types";
import { isBounce } from "@/lib/email-utils";

export async function GET(req: Request) {
    const url = new URL(req.url);
    const timeframe = (url.searchParams.get("timeframe") || "7D") as "24H" | "7D" | "30D";

    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 1. Fetch campaigns and active accounts belonging to the user
        const [campaignsResult, accountsResult] = await Promise.all([
            pool.query(
                "SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC",
                [user.id]
            ),
            pool.query(
                "SELECT COUNT(*) AS count FROM sender_accounts WHERE user_id = $1 AND is_active = true",
                [user.id]
            )
        ]);

        const campaignsData = campaignsResult.rows || [];
        const campaignIds = campaignsData.map((c) => c.id);
        const activeAccounts = parseInt(accountsResult.rows[0]?.count) || 0;

        if (campaignIds.length === 0) {
            return NextResponse.json({
                stats: {
                    totalCampaigns: 0,
                    emailsSent: 0,
                    totalReplies: 0,
                    avgReplyRate: "0%",
                    activeAccounts: activeAccounts,
                    bouncedCount: 0,
                    avgReplyTime: "---"
                },
                chartData: { "24H": [], "7D": [], "30D": [] },
                sendIntelligence: [],
                campaigns: []
            });
        }

        // 2. Fetch leads and stats in parallel scoped strictly to the user's campaigns
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const [
            sentRes,
            bouncedRes,
            repliedLeadsRes,
            campaignStatsRes,
            activityRes
        ] = await Promise.all([
            pool.query(
                "SELECT COUNT(*) AS count FROM leads WHERE campaign_id = ANY($1::uuid[]) AND status IN ('SENT', 'REPLIED')",
                [campaignIds]
            ),
            pool.query(
                "SELECT COUNT(*) AS count FROM leads WHERE campaign_id = ANY($1::uuid[]) AND status = 'BOUNCED'",
                [campaignIds]
            ),
            pool.query(
                "SELECT id, status, sent_at, replied_at, email FROM leads WHERE campaign_id = ANY($1::uuid[]) AND status = 'REPLIED'",
                [campaignIds]
            ),
            pool.query(
                "SELECT * FROM campaign_stats WHERE campaign_id = ANY($1::uuid[])",
                [campaignIds]
            ),
            pool.query(
                "SELECT id, sent_at, status FROM leads WHERE campaign_id = ANY($1::uuid[]) AND sent_at >= $2",
                [campaignIds, thirtyDaysAgo.toISOString()]
            )
        ]);

        const sentCount = parseInt(sentRes.rows[0]?.count) || 0;
        let baseBouncedCount = parseInt(bouncedRes.rows[0]?.count) || 0;
        const repliedLeads = repliedLeadsRes.rows || [];
        const activityData = (activityRes.rows || []) as LeadData[];

        // Fetch replies for leads marked as REPLIED to verify they are genuine
        const potentialReplyLeadIds = repliedLeads.map(l => l.id);
        const genuineReplyEmails = new Set<string>();
        let additionalBouncedCount = 0;
        let genuineReplyTimes: number[] = [];
        let allGenuineReplies: any[] = [];

        if (potentialReplyLeadIds.length > 0) {
            const repliesResult = await pool.query(
                "SELECT lead_id, subject, body, sender_email, timestamp, type FROM replies WHERE lead_id = ANY($1::uuid[])",
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

        // 3. Process activity data for charts
        const chartData = processChartData(activityData);
        const sendIntelligence = processSendIntelligence(activityData, timeframe);

        // 4. Process quality from genuine replies
        const replyQuality = processReplyQuality(allGenuineReplies.map(r => ({
            id: r.id,
            body: r.body,
            lead_id: r.lead_id
        })));

        // 5. Enrich campaigns list for the dashboard table
        const campaignStatsMap: Record<string, any> = {};
        if (campaignStatsRes.rows) {
            campaignStatsRes.rows.forEach((s: any) => {
                campaignStatsMap[s.campaign_id] = s;
            });
        }

        const enrichedCampaigns = campaignsData.map((c: any) => {
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

        return NextResponse.json({
            stats: {
                totalCampaigns: campaignIds.length,
                emailsSent: sentCount,
                totalReplies: genuineReplyCount,
                avgReplyRate: `${avgReplyRate}%`,
                activeAccounts: activeAccounts,
                bouncedCount: totalBounced,
                avgReplyTime: avgTime !== null ? `${avgTime}h` : "---"
            },
            chartData,
            sendIntelligence,
            replyQuality,
            campaigns: enrichedCampaigns
        });

    } catch (error) {
        console.error("[GET Dashboard Stats Error]:", error);
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}
