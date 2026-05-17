"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    BarChart,
    Bar,
    Cell,
    LabelList
} from "recharts";
import {
    Megaphone,
    ArrowUpRight,
    RefreshCw,
    Plus,
    SlidersHorizontal,
    Check
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/components/ui/toast-provider";
import { handleSessionExpired } from "@/lib/session-utils";

interface CampaignWithStats {
    id: string;
    name: string;
    status: string;
    total_leads: number;
    created_at: string;
    sent_count: number;
    reply_count: number;
    completion_rate: number;
    reply_rate: number;
}

interface DashboardClientProps {
    user: { id: string; email?: string };
    initialCampaigns: CampaignWithStats[];
    initialStats: any;
    initialChartData: Record<string, any[]>;
    initialBestSendDay: any[];
    initialReplyQuality: any;
}

function StatusBadge({ status, completion = 0 }: { status: string, completion?: number }) {
    const displayStatus = completion === 100 && status === 'RUNNING' ? 'COMPLETED' : status;

    if (displayStatus === 'COMPLETED') {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide" style={{ color: "#10B981", backgroundColor: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#10B981", boxShadow: "0 0 4px #10B981" }} />
                COMPLETED
            </span>
        );
    }

    if (displayStatus === 'RUNNING') {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide" style={{ color: "#F59E0B", backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#F59E0B", boxShadow: "0 0 4px #F59E0B" }} />
                RUNNING
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide" style={{ color: "#888", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#888" }} />
            {displayStatus}
        </span>
    );
}

export default function DashboardClient({ user, initialCampaigns, initialStats, initialChartData, initialBestSendDay, initialReplyQuality }: DashboardClientProps) {
    const [campaigns, setCampaigns] = useState<CampaignWithStats[]>(initialCampaigns);
    const [statsData, setStatsData] = useState(initialStats);
    const [chartDataMaster, setChartDataMaster] = useState<Record<string, any[]>>(initialChartData);
    const [bestSendDayData, setBestSendDayData] = useState<any[]>(initialBestSendDay);
    const [replyQualityData, setReplyQualityData] = useState<any>(initialReplyQuality);
    const [activeTimeframe, setActiveTimeframe] = useState<"24H" | "7D" | "30D">("30D");
    const [intelligenceTimeframe, setIntelligenceTimeframe] = useState<"24H" | "7D" | "30D">("7D");
    const [intelligenceData, setIntelligenceData] = useState<any[]>(initialBestSendDay);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [lastSynced, setLastSynced] = useState<Date | null>(null);
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
    const [visibleCards, setVisibleCards] = useState<string[]>([
        "Total Campaigns",
        "Emails Sent",
        "Total Replies",
        "Avg Reply Rate",
        "Active Accounts",
        "Bounced",
        "Avg Reply Time"
    ]);
    const customizeRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        const saved = localStorage.getItem("dashboard_visible_cards");
        if (saved) {
            try { setVisibleCards(JSON.parse(saved)); } catch (e) { }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("dashboard_visible_cards", JSON.stringify(visibleCards));
    }, [visibleCards]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (customizeRef.current && !customizeRef.current.contains(event.target as Node)) {
                setIsCustomizeOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/dashboard/stats");
            if (res.status === 401) {
                await handleSessionExpired();
                throw new Error("Session expired");
            }
            if (!res.ok) throw new Error("Failed to fetch dashboard stats");
            const data = await res.json();

            if (data.stats) {
                setStatsData(data.stats);
                setChartDataMaster(data.chartData || { "24H": [], "7D": [], "30D": [] });
                setBestSendDayData(data.sendIntelligence || []);
                setIntelligenceData(data.sendIntelligence || []);
                setReplyQualityData(data.replyQuality || { positive: 0, negative: 0, neutral: 0, total: 0, percentages: { positive: 0, negative: 0, neutral: 0 } });
            }

            if (data.campaigns) {
                setCampaigns(data.campaigns);
            }
        } catch (err) {
            console.error("Error in dashboard fetchData:", err);
        } finally {
            setLoading(false);
        }
    }, [user.id]);

    const fetchIntelligence = useCallback(async (tf: "24H" | "7D" | "30D") => {
        try {
            const res = await fetch(`/api/dashboard/stats?timeframe=${tf}`).then(res => res.json());
            if (res.sendIntelligence) {
                setIntelligenceData(res.sendIntelligence);
            }
        } catch (err) {
            console.error("Error fetching intelligence data:", err);
        }
    }, []);

    useEffect(() => {
        if (intelligenceTimeframe) {
            fetchIntelligence(intelligenceTimeframe);
        }
    }, [intelligenceTimeframe, fetchIntelligence]);

    const autoSync = useCallback(async () => {
        try {
            const response = await fetch("/api/campaign/sync-replies", { method: "POST" });
            if (response.ok) {
                setLastSynced(new Date());
                await fetchData();
            }
        } catch { }
    }, [fetchData]);

    useEffect(() => {
        fetchData();
        const pollInterval = setInterval(fetchData, 60 * 1000);
        const syncInterval = setInterval(autoSync, 5 * 60 * 1000);
        return () => {
            clearInterval(pollInterval);
            clearInterval(syncInterval);
        };
    }, [fetchData, autoSync]);

    const handleSyncReplies = async () => {
        setSyncing(true);
        toast.info("Syncing replies...");
        try {
            const response = await fetch("/api/campaign/sync-replies", { method: "POST" });
            if (!response.ok) throw new Error("Sync failed");
            setLastSynced(new Date());
            toast.success("Replies synced successfully");
            await fetchData();
        } catch (err) {
            toast.error("Failed to sync replies");
        } finally {
            setSyncing(false);
        }
    };

    const allStatCards = [
        { label: "Total Campaigns", value: statsData.totalCampaigns },
        { label: "Emails Sent", value: statsData.emailsSent },
        { label: "Total Replies", value: statsData.totalReplies },
        { label: "Avg Reply Rate", value: statsData.avgReplyRate },
        { label: "Active Accounts", value: statsData.activeAccounts },
        { label: "Bounced", value: statsData.bouncedCount, color: statsData.bouncedCount > 0 ? "#EF4444" : "#888" },
        { label: "Avg Reply Time", value: statsData.avgReplyTime },
    ];

    const statCards = allStatCards.filter(card => visibleCards.includes(card.label));

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
                    <p className="text-zinc-500 text-[13px] mt-1">Your campaign performance at a glance.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative" ref={customizeRef}>
                        <button
                            onClick={() => setIsCustomizeOpen(!isCustomizeOpen)}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <SlidersHorizontal className="w-4 h-4" />
                            Customize
                        </button>

                        {isCustomizeOpen && (
                            <div
                                className="absolute right-0 mt-2 w-64 rounded-xl shadow-2xl z-50 p-4 animate-in fade-in zoom-in duration-200"
                                style={{
                                    backgroundColor: "#141414",
                                    border: "1px solid #222222",
                                    boxShadow: "0 10px 40px rgba(0,0,0,0.6)"
                                }}
                            >
                                <h3 className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-4">Visible Metrics</h3>
                                <div className="space-y-1">
                                    {allStatCards.map(card => {
                                        const isVisible = visibleCards.includes(card.label);
                                        return (
                                            <button
                                                key={card.label}
                                                onClick={() => {
                                                    if (isVisible) {
                                                        setVisibleCards(prev => prev.filter(c => c !== card.label));
                                                    } else {
                                                        setVisibleCards(prev => [...prev, card.label]);
                                                    }
                                                }}
                                                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group"
                                                style={{ backgroundColor: isVisible ? "rgba(245,158,11,0.05)" : "transparent" }}
                                            >
                                                <span className="text-sm" style={{ color: isVisible ? "#fff" : "#888" }}>
                                                    {card.label}
                                                </span>
                                                <div
                                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isVisible ? "bg-[#F59E0B] border-[#F59E0B]" : "border-[#333] group-hover:border-[#444]"}`}
                                                >
                                                    {isVisible && <Check className="w-3 h-3 text-black stroke-[3]" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col items-end">
                        <button
                            onClick={handleSyncReplies}
                            disabled={syncing}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                            {syncing ? "Syncing..." : "Sync Replies"}
                        </button>
                        {lastSynced && (
                            <span className="text-[10px] text-[#6b7280] mt-1.5">
                                Last synced {lastSynced.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                    <Link
                        href="/campaigns/new"
                        className="btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        New Campaign
                    </Link>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="flex flex-wrap gap-4">
                {statCards.map((stat: any) => (
                    <div
                        key={stat.label}
                        className="rounded-[10px] transition-all duration-200 cursor-default"
                        style={{
                            backgroundColor: "#141414",
                            border: "1px solid #222222",
                            padding: 24,
                            minWidth: "160px",
                            flex: statCards.length < 4 ? "1 1 0px" : "1 1 200px"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#F59E0B")}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#222222")}
                    >
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            {stat.label}
                        </p>
                        <p className="text-3xl font-bold mt-2" style={{ color: stat.color || "white" }}>
                            {stat.value}
                        </p>
                    </div>
                ))}
            </div>

            {campaigns.length === 0 && (
                <p className="text-center italic mt-6 text-zinc-500">
                    No activity yet. Connect a Gmail account and launch your first campaign to see data here.
                </p>
            )}

            <EmailActivityChart
                data={chartDataMaster[activeTimeframe] || []}
                activeTimeframe={activeTimeframe}
                onTimeframeChange={(tf) => setActiveTimeframe(tf as "24H" | "7D" | "30D")}
            />

            <div
                className="rounded-[16px]"
                style={{ backgroundColor: "#141414", border: "1px solid #222", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}
            >
                <div className="px-6 py-5 flex items-center justify-between border-b" style={{ borderColor: "#222" }}>
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#F59E0B", boxShadow: "0 0 8px #F59E0B" }} />
                        <h2 className="text-[16px] font-semibold text-white">Campaign Performance</h2>
                        <span className="text-[12px] px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a" }}>
                            Top 5
                        </span>
                    </div>
                </div>

                <div>
                    {campaigns.length === 0 ? (
                        <div className="py-12 text-center">
                            <Megaphone className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                            <p className="text-foreground font-medium">No campaigns yet</p>
                            <Link href="/campaigns/new" className="inline-flex items-center gap-1 text-sm text-amber-500 font-medium mt-3 hover:underline">
                                Create campaign <ArrowUpRight className="w-3 h-3" />
                            </Link>
                        </div>
                    ) : (
                        <div className="overflow-x-auto text-[13px]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr style={{ backgroundColor: "#111" }}>
                                        <th className="py-3 px-6 font-semibold uppercase tracking-[0.1em] text-[10px] text-zinc-600 rounded-tl-[16px]">Rank</th>
                                        <th className="py-3 px-6 font-semibold uppercase tracking-[0.1em] text-[10px] text-zinc-600">Campaign</th>
                                        <th className="py-3 px-6 font-semibold uppercase tracking-[0.1em] text-[10px] text-zinc-600">Status</th>
                                        <th className="py-3 px-6 font-semibold uppercase tracking-[0.1em] text-[10px] text-zinc-600">Sent</th>
                                        <th className="py-3 px-6 font-semibold uppercase tracking-[0.1em] text-[10px] text-zinc-600">Replies</th>
                                        <th className="py-3 px-6 font-semibold uppercase tracking-[0.1em] text-[10px] text-zinc-600">Reply Rate</th>
                                        <th className="py-3 px-6 font-semibold uppercase tracking-[0.1em] text-[10px] text-zinc-600 rounded-tr-[16px]">Completion</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...campaigns]
                                        .sort((a, b) => (b.reply_count || 0) - (a.reply_count || 0))
                                        .slice(0, 5)
                                        .map((c, i) => {
                                            const isTop2 = i < 2;
                                            const isHighReply = c.reply_rate >= 50;
                                            return (
                                                <tr
                                                    key={c.id}
                                                    className="border-t cursor-pointer"
                                                    style={{ borderColor: "#1A1A1A", transition: "background-color 150ms ease" }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(245,158,11,0.02)"}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                                    onClick={() => router.push(`/campaigns/${c.id}`)}
                                                >
                                                    <td className="py-4 px-6">
                                                        <div className="flex items-center justify-center w-[26px] h-[26px] rounded-[7px] text-[11px] font-bold"
                                                            style={isTop2 ? { backgroundColor: "rgba(245,158,11,0.1)", color: "#F59E0B" } : { backgroundColor: "#181818", color: "#666" }}>
                                                            #{i + 1}
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-[7px] h-[7px]"
                                                                style={isHighReply ? { backgroundColor: "#F59E0B" } : { backgroundColor: "transparent", border: "1px solid #333" }}
                                                            />
                                                            <span className="font-mono text-zinc-300 hover:text-white transition-colors">
                                                                {c.name}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <StatusBadge status={c.status} completion={c.completion_rate} />
                                                    </td>
                                                    <td className="py-4 px-6 font-mono text-zinc-500">
                                                        {c.sent_count}
                                                    </td>
                                                    <td className="py-4 px-6 font-mono" style={{ color: c.reply_count > 0 ? "#F59E0B" : "#555" }}>
                                                        {c.reply_count}
                                                    </td>
                                                    <td className="py-4 px-6 font-mono font-medium" style={{ color: c.reply_rate >= 50 ? "#10B981" : c.reply_rate > 0 ? "#F59E0B" : "#444" }}>
                                                        {c.reply_rate}%
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <div className="flex items-center gap-3">
                                                            <span className="font-mono text-[11px]" style={{ color: c.completion_rate === 100 ? "#F59E0B" : "#888", width: "30px" }}>
                                                                {c.completion_rate}%
                                                            </span>
                                                            <div className="w-[60px] h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: "#1e1e1e" }}>
                                                                <div
                                                                    className="h-full rounded-full transition-all duration-500"
                                                                    style={{
                                                                        width: `${c.completion_rate}%`,
                                                                        backgroundColor: c.completion_rate === 100 ? "#F59E0B" : "#555",
                                                                        boxShadow: c.completion_rate === 100 ? "0 0 6px rgba(245,158,11,0.5)" : "none"
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {campaigns.length > 0 && (
                    <div className="px-6 py-3 border-t flex items-center justify-between" style={{ borderColor: "#1A1A1A", backgroundColor: "#0f0f0f" }}>
                        <span className="text-[11px] text-zinc-600">
                            Showing {campaigns.length} total campaigns
                        </span>
                        <div className="flex items-center justify-center w-[20px] h-[20px] rounded text-amber-500 text-[10px] font-bold" style={{ backgroundColor: "rgba(245,158,11,0.1)" }}>
                            1
                        </div>
                    </div>
                )}
            </div>

            {/* Send Intelligence Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <h2 className="text-sm font-semibold text-white tracking-wide uppercase opacity-50">Send Intelligence</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SendIntelligenceChart
                        data={intelligenceData}
                        timeframe={intelligenceTimeframe}
                        onTimeframeChange={setIntelligenceTimeframe}
                    />
                    <ReplyQualityCard data={replyQualityData} />
                </div>
            </div>
        </div>
    );
}

import { Line } from "recharts";

function SendIntelligenceChart({ data, timeframe, onTimeframeChange }: { data: any[], timeframe: string, onTimeframeChange: (tf: "24H" | "7D" | "30D") => void }) {
    return (
        <div
            className="rounded-[12px] p-6 space-y-6 flex flex-col"
            style={{
                backgroundColor: "#141414",
                border: "1px solid #222222"
            }}
        >
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#F59E0B" }} />
                        <h3 className="text-[13px] font-semibold text-[#f0f0f0]">Send Intelligence</h3>
                    </div>
                    <p className="text-[12px] text-[#555]">Sent vs Replies comparison</p>
                </div>
                <div className="flex gap-1.5 bg-[#0f0f0f] p-1 rounded-lg border border-[#222]">
                    {(["24H", "7D", "30D"] as const).map((tf) => (
                        <button
                            key={tf}
                            onClick={() => onTimeframeChange(tf)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-200 ${timeframe === tf ? 'bg-[#F59E0B] text-black shadow-lg shadow-amber-500/10' : 'text-[#555] hover:text-[#888]'}`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-[200px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 20, right: 0, left: -35, bottom: 0 }} barGap={4}>
                        <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.03)" vertical={false} />
                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "#444", fontSize: 10, fontWeight: 600 }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "#444", fontSize: 10, fontWeight: 600 }}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                            content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    const sent = payload.find(p => p.dataKey === 'sent')?.value || 0;
                                    const replies = payload.find(p => p.dataKey === 'replies')?.value || 0;
                                    const rate = payload.find(p => p.dataKey === 'replyRate')?.value || 0;
                                    return (
                                        <div className="bg-[#1a1a1a] border border-[#333] p-3 rounded-lg shadow-2xl backdrop-blur-md">
                                            <p className="text-[11px] font-bold text-white mb-2 pb-2 border-b border-[#333]">{label}</p>
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between gap-8">
                                                    <span className="text-[10px] text-zinc-500 font-medium">Sent</span>
                                                    <span className="text-[10px] text-white font-mono">{sent}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-8">
                                                    <span className="text-[10px] text-zinc-500 font-medium">Replies</span>
                                                    <span className="text-[10px] text-amber-500 font-mono font-bold">{replies}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-8 pt-1.5 mt-1.5 border-t border-[#333]">
                                                    <span className="text-[10px] text-zinc-500 font-medium">Reply Rate</span>
                                                    <span className="text-[10px] text-emerald-500 font-mono font-bold">{rate}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Bar dataKey="sent" fill="#2a2a2a" radius={[3, 3, 0, 0]} barSize={timeframe === "30D" ? 6 : timeframe === "7D" ? 14 : 10} />
                        <Bar dataKey="replies" fill="#F59E0B" radius={[3, 3, 0, 0]} barSize={timeframe === "30D" ? 6 : timeframe === "7D" ? 14 : 10} />
                        <Line
                            type="monotone"
                            dataKey="replyRate"
                            stroke="#10B981"
                            strokeWidth={1.5}
                            dot={false}
                            yAxisId={0}
                            opacity={0.3}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm bg-[#2a2a2a]" />
                    <span className="text-[10px] text-zinc-500 font-medium">Sent</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm bg-[#F59E0B]" />
                    <span className="text-[10px] text-zinc-500 font-medium">Replies</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-5 h-[1.5px] bg-[#10B981] opacity-50" />
                    <span className="text-[10px] text-zinc-500 font-medium">Rate %</span>
                </div>
            </div>
        </div>
    );
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg px-3 py-2 text-xs shadow-lg" style={{ backgroundColor: "#1f1f1f", border: "1px solid #333" }}>
            <p className="font-medium text-white">{label}</p>
            <p className="text-amber-500">{payload[0].value} emails sent</p>
        </div>
    );
}

function EmailActivityChart({ data, activeTimeframe, onTimeframeChange }: { data: any[], activeTimeframe: string, onTimeframeChange: (tf: string) => void }) {
    return (
        <div className="glass-panel rounded-xl flex flex-col gap-6 p-8">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-white">EMAILS SENT</h3>
                </div>
                <div className="flex gap-2">
                    {["24H", "7D", "30D"].map((tf) => (
                        <button
                            key={tf}
                            onClick={() => onTimeframeChange(tf)}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${activeTimeframe === tf ? 'bg-primary/10 text-primary' : 'hover:bg-white/5 text-slate-500 cursor-pointer'}`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 relative min-h-[300px]">
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 10, fontWeight: "bold" }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 10, fontWeight: "bold" }} dx={-10} />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />
                        <Area
                            type="monotone"
                            dataKey="sent"
                            stroke="var(--color-primary)"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorSent)"
                            activeDot={{ r: 4, fill: "#0a0705", stroke: "var(--color-primary)", strokeWidth: 2 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function ReplyQualityCard({ data }: { data: any }) {
    const { positive = 0, negative = 0, neutral = 0, total = 0, percentages = { positive: 0, negative: 0, neutral: 0 } } = data || {};

    return (
        <div
            className="rounded-[12px] p-6 space-y-6 flex flex-col justify-between h-full"
            style={{
                backgroundColor: "#141414",
                border: "1px solid #222222"
            }}
        >
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#F59E0B" }} />
                    <h3 className="text-[13px] font-semibold text-[#f0f0f0]">Reply Quality</h3>
                </div>
                <p className="text-[12px] text-[#555]">Breakdown of reply intent</p>
            </div>

            <div className="space-y-6">
                {/* Stacked Bar */}
                <div className="w-full h-[32px] rounded-lg overflow-hidden flex bg-[#1a1a1a]">
                    {percentages.positive > 0 && (
                        <div
                            className="h-full transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
                            style={{ width: `${percentages.positive}%`, backgroundColor: "#10B981" }}
                            title={`Positive: ${positive}`}
                        >
                            {percentages.positive > 10 && `${percentages.positive}%`}
                        </div>
                    )}
                    {percentages.neutral > 0 && (
                        <div
                            className="h-full transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-black overflow-hidden"
                            style={{ width: `${percentages.neutral}%`, backgroundColor: "#F59E0B" }}
                            title={`Neutral: ${neutral}`}
                        >
                            {percentages.neutral > 10 && `${percentages.neutral}%`}
                        </div>
                    )}
                    {percentages.negative > 0 && (
                        <div
                            className="h-full transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
                            style={{ width: `${percentages.negative}%`, backgroundColor: "#EF4444" }}
                            title={`Negative: ${negative}`}
                        >
                            {percentages.negative > 10 && `${percentages.negative}%`}
                        </div>
                    )}
                </div>

                {/* Counts Legend */}
                <div className="flex items-center gap-4 text-[11px] font-medium">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#10B981]">Positive</span>
                        <span className="text-white opacity-90">{positive}</span>
                    </div>
                    <span className="text-zinc-800 text-xs">·</span>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#F59E0B]">Neutral</span>
                        <span className="text-white opacity-90">{neutral}</span>
                    </div>
                    <span className="text-zinc-800 text-xs">·</span>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#EF4444]">Negative</span>
                        <span className="text-white opacity-90">{negative}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
