import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { auth } from "@/lib/auth-helper";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { user } = await auth();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: campaignId } = await params;

        // 1. Verify ownership and fetch campaign metadata with connected sender accounts
        const campaignResult = await pool.query(
            `SELECT c.*,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'sender_account', json_build_object(
                                    'id', sa.id,
                                    'email', sa.email,
                                    'name', sa.name,
                                    'status', sa.status
                                )
                            )
                        ) FILTER (WHERE sa.id IS NOT NULL),
                        '[]'::json
                    ) AS sender_accounts
             FROM campaigns c
             LEFT JOIN campaign_accounts ca ON ca.campaign_id = c.id
             LEFT JOIN sender_accounts sa ON sa.id = ca.sender_account_id
             WHERE c.id = $1
             GROUP BY c.id`,
            [campaignId]
        );
        const campaign = campaignResult.rows[0];

        if (!campaign) {
            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }

        if (campaign.user_id !== user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 2. Fetch stats and recent activity in parallel
        const [leadsRes, statsRes, repliesRes] = await Promise.all([
            pool.query(
                "SELECT id, email, status, sent_at, replied_at FROM leads WHERE campaign_id = $1 ORDER BY sent_at DESC NULLS LAST",
                [campaignId]
            ),
            pool.query(
                "SELECT * FROM campaign_stats WHERE campaign_id = $1 LIMIT 1",
                [campaignId]
            ),
            pool.query(
                "SELECT * FROM leads WHERE campaign_id = $1 AND status = 'REPLIED' ORDER BY replied_at DESC LIMIT 5",
                [campaignId]
            )
        ]);

        const leads = leadsRes.rows || [];
        const stats = statsRes.rows[0] || { total_sent: 0, total_replied: 0, reply_rate: 0 };
        const recentReplies = repliesRes.rows || [];

        // 3. Process activity data for chart (last 30 days)
        const dailyStats: Record<string, number> = {};
        for (let i = 0; i < 30; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            dailyStats[dateStr] = 0;
        }

        leads.forEach(lead => {
            if (lead.sent_at) {
                const dateStr = lead.sent_at.split('T')[0];
                if (dailyStats[dateStr] !== undefined) {
                    dailyStats[dateStr]++;
                }
            }
        });

        const chartData = Object.entries(dailyStats)
            .map(([date, count]) => ({
                date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                sent: count,
                fullDate: date
            }))
            .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

        return NextResponse.json({
            campaign,
            stats: {
                sent: stats.total_sent || 0,
                replied: stats.total_replied || 0,
                replyRate: stats.reply_rate || 0,
                completion: campaign.total_leads > 0
                    ? Math.round(((stats.total_sent || 0) / campaign.total_leads) * 100)
                    : 0,
                delivered: stats.total_sent || 0,
            },
            chartData,
            leads,
            recentReplies
        });

    } catch (error) {
        console.error("[GET Campaign Detail Stats Error]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
