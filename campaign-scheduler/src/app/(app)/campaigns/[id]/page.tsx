"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast-provider";
import Link from "next/link";
import {
    ArrowLeft,
    RefreshCw,
    Pause,
    Play,
    Trash2,
    Calendar,
    Mail,
    User,
    Clock,
    CheckCircle2,
    ChevronRight,
    ExternalLink,
    Eye,
    Copy,
    Check
} from "lucide-react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";
import { motion } from "framer-motion";

interface Lead {
    id: string;
    email: string;
    status: string;
    sent_at: string | null;
    replied_at: string | null;
}

interface CampaignDetail {
    id: string;
    name: string;
    status: string;
    subject: string;
    body: string | null;
    total_leads: number;
    created_at: string;
    daily_limit: number;
    user_id: string;
    sender_accounts: any[];
}

export default function CampaignDetailPage() {
    const params = useParams();
    const router = useRouter();
    const campaignId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
    const [stats, setStats] = useState({
        sent: 0,
        delivered: 0,
        replied: 0,
        replyRate: 0,
        completion: 0
    });
    const [chartData, setChartData] = useState<any[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [recentReplies, setRecentReplies] = useState<any[]>([]);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState("");
    const [showMessageModal, setShowMessageModal] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopyId = () => {
        if (campaign?.id) {
            navigator.clipboard.writeText(campaign.id);
            setCopied(true);
            toast.success("Campaign ID copied!");
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const fetchData = async () => {
        try {
            const res = await fetch(`/api/campaigns/${campaignId}/stats`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setCampaign(data.campaign);
            setEditedName(data.campaign.name);
            setStats(data.stats);
            setChartData(data.chartData || []);
            setLeads(data.leads || []);
            setRecentReplies(data.recentReplies || []);
        } catch (err) {
            console.error("Error fetching campaign details:", err);
            toast.error("Failed to load campaign data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (campaignId) fetchData();
    }, [campaignId]);

    const handleStatusToggle = async () => {
        if (!campaign) return;
        const newStatus = campaign.status === "RUNNING" ? "PAUSED" : "RUNNING";
        setSyncing(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus })
            });

            if (!res.ok) throw new Error("Failed to update status");
            toast.success(`Campaign ${newStatus === "PAUSED" ? "paused" : "resumed"}`);
            setCampaign({ ...campaign, status: newStatus });
        } catch {
            toast.error("Failed to update status");
        } finally {
            setSyncing(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this campaign? This action cannot be undone.")) return;
        try {
            const res = await fetch(`/api/campaigns/${campaignId}`, {
                method: "DELETE"
            });

            if (!res.ok) throw new Error("Failed to delete campaign");
            toast.success("Campaign deleted");
            router.push("/campaigns");
        } catch {
            toast.error("Failed to delete campaign");
        }
    };

    const handleNameUpdate = async () => {
        if (!campaign || editedName === campaign.name) {
            setIsEditingName(false);
            return;
        }
        try {
            const res = await fetch(`/api/campaigns/${campaignId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: editedName })
            });

            if (!res.ok) throw new Error("Failed to update name");
            setCampaign({ ...campaign, name: editedName });
            toast.success("Name updated");
        } catch {
            toast.error("Failed to update name");
            setEditedName(campaign.name);
        } finally {
            setIsEditingName(false);
        }
    };

    if (loading) return <div className="p-8"><div className="animate-pulse space-y-4">
        <div className="h-4 w-32 bg-zinc-800 rounded"></div>
        <div className="h-8 w-64 bg-zinc-800 rounded"></div>
        <div className="grid grid-cols-5 gap-4 h-24">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="bg-zinc-800 rounded-lg"></div>)}
        </div>
    </div></div>;

    if (!campaign) return <div className="p-8 text-center text-muted-foreground">Campaign not found.</div>;

    const statCards = [
        { label: "Emails Sent", value: stats.sent },
        { label: "Delivered", value: stats.delivered },
        { label: "Replies Received", value: stats.replied },
        { label: "Reply Rate", value: `${stats.replyRate}%` },
        { label: "Completion", value: `${stats.completion}%` },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header section */}
            <div className="flex items-start justify-between">
                <div className="space-y-1">
                    <Link
                        href="/campaigns"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-white transition-colors group mb-1"
                    >
                        <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                        Campaigns
                    </Link>
                    <div className="flex items-center gap-3">
                        {isEditingName ? (
                            <input
                                autoFocus
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                onBlur={handleNameUpdate}
                                onKeyDown={(e) => e.key === "Enter" && handleNameUpdate()}
                                className="text-2xl font-semibold bg-transparent border-b border-amber-500 outline-none text-white px-0"
                            />
                        ) : (
                            <h1
                                onClick={() => setIsEditingName(true)}
                                className="text-2xl font-semibold tracking-tight text-white cursor-pointer hover:text-amber-500 transition-colors"
                            >
                                {campaign.name || "Untitled Campaign"}
                            </h1>
                        )}
                        <StatusBadge status={campaign.status} />
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Created on {new Date(campaign.created_at).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <button 
                            onClick={handleCopyId}
                            className="flex items-center gap-1 hover:text-amber-500 transition-colors"
                        >
                            <span className="font-mono">ID: {campaign.id.slice(0, 8)}...</span>
                            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleStatusToggle}
                        disabled={syncing}
                        className="btn-secondary h-9 px-4 text-xs flex items-center gap-2"
                    >
                        {campaign.status === "RUNNING" ? (
                            <><Pause className="w-3.5 h-3.5" /> Pause Campaign</>
                        ) : (
                            <><Play className="w-3.5 h-3.5" /> Resume Campaign</>
                        )}
                    </button>
                    <button
                        onClick={handleDelete}
                        className="btn-destructive h-9 px-4 text-xs flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                    <button
                        onClick={() => { setLoading(true); fetchData(); }}
                        className="p-2 rounded-md border border-[#222] bg-[#141414] hover:border-amber-500 transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            {/* Stat Cards Row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {statCards.map((stat) => (
                    <div
                        key={stat.label}
                        className="rounded-[10px] transition-all duration-200 cursor-default group"
                        style={{
                            backgroundColor: "#141414",
                            border: "1px solid #222222",
                            padding: 24,
                        }}
                    >
                        <p className="text-[12px] font-medium text-muted-foreground group-hover:text-amber-500 transition-colors">
                            {stat.label}
                        </p>
                        <p className="text-2xl font-semibold text-white mt-1">
                            {stat.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* Two Column Section */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                {/* Left Column: Activity & Leads Table */}
                <div className="lg:col-span-6 space-y-6">
                    {/* Activity Chart */}
                    <div className="rounded-[10px] bg-[#141414] border border-[#222222] overflow-hidden">
                        <div className="px-6 py-5 border-b border-[#222222]">
                            <h3 className="text-sm font-medium text-white">Email Activity</h3>
                        </div>
                        <div className="p-6">
                            <div className="h-[240px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="0" stroke="#1f1f1f" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: "#6b7280", fontSize: 11 }}
                                            dy={10}
                                        />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: "#6b7280", fontSize: 11 }}
                                        />
                                        <Tooltip
                                            content={({ active, payload, label }) => {
                                                if (active && payload && payload.length) {
                                                    return (
                                                        <div className="rounded-lg bg-[#1f1f1f] border border-[#333] px-3 py-2 text-xs shadow-xl">
                                                            <p className="font-medium text-white mb-1">{label}</p>
                                                            <p className="text-amber-500 font-semibold">{payload[0].value} emails sent</p>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="sent"
                                            stroke="#F59E0B"
                                            strokeWidth={2}
                                            dot={{ r: 0 }}
                                            activeDot={{ r: 4, fill: "#F59E0B", stroke: "#141414", strokeWidth: 2 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Leads Table */}
                    <div className="rounded-[10px] bg-[#141414] border border-[#222222] overflow-hidden">
                        <div className="px-6 py-5 border-b border-[#222222] flex items-center justify-between">
                            <h3 className="text-sm font-medium text-white">Target Leads</h3>
                            <span className="text-[11px] text-muted-foreground">{leads.length} leads total</span>
                        </div>
                        {(() => {
                            const sent = leads.filter(l => l.status === 'SENT' || l.status === 'REPLIED').length;
                            const failed = leads.filter(l => l.status === 'FAILED').length;
                            const blocked = leads.filter(l => l.status === 'BLOCKED').length;
                            const pending = leads.filter(l => l.status === 'PENDING').length;
                            return (
                                <div className="px-6 py-2 border-b border-[#1f1f1f] text-[11px]">
                                    <span className="text-muted-foreground">
                                        {sent} sent ·{' '}
                                        {failed > 0 ? (
                                            <span style={{ color: '#ff4444' }}>{failed} failed</span>
                                        ) : (
                                            '0 failed'
                                        )}
                                        {blocked > 0 ? (
                                            <> · <span style={{ color: '#ff4444' }}>{blocked} blocked</span></>
                                        ) : null}
                                        {' · '}{pending} pending
                                    </span>
                                </div>
                            );
                        })()}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[#1f1f1f]">
                                        <th className="text-left py-3 px-6 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Email Address</th>
                                        <th className="text-left py-3 px-6 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                                        <th className="text-left py-3 px-6 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sent At</th>
                                        <th className="text-right py-3 px-6 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Replied</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leads.length > 0 ? leads.map((lead) => (
                                        <tr
                                            key={lead.id}
                                            className="hover:bg-white/[0.02] transition-colors border-b border-[#1a1a1a] last:border-0"
                                        >
                                            <td className="py-3 px-6 text-white text-[13px]">{lead.email}</td>
                                            <td className="py-3 px-6">
                                                <LeadStatusBadge status={lead.status} />
                                            </td>
                                            <td className="py-3 px-6 text-muted-foreground text-[12px]">
                                                {lead.sent_at ? new Date(lead.sent_at).toLocaleString() : "—"}
                                            </td>
                                            <td className="py-3 px-6 text-right">
                                                {lead.status === "REPLIED" ? (
                                                    <span className="inline-flex items-center gap-1 text-amber-500 font-medium text-[12px]">
                                                        Yes
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground text-[12px]">No</span>
                                                )}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4} className="py-12 text-center text-muted-foreground text-xs italic">
                                                No leads found for this campaign.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right Column: Settings & Mini Inbox */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Settings Card */}
                    <div className="rounded-[10px] bg-[#141414] border border-[#222222] overflow-hidden">
                        <div className="px-6 py-5 border-b border-[#222222] flex items-center justify-between">
                            <h3 className="text-sm font-medium text-white uppercase tracking-wider">Campaign Settings</h3>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold tracking-tighter uppercase">Locked</span>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="space-y-3">
                                <label className="text-[11px] font-medium text-muted-foreground uppercase flex items-center gap-2">
                                    <User className="w-3 h-3" /> Sending Accounts
                                </label>
                                <div className="space-y-1.5">
                                    {(campaign.sender_accounts || []).map((acc: any) => (
                                        <div key={acc.sender_account.id} className="flex items-center gap-2 p-2 rounded bg-white/[0.03] border border-white/[0.05]">
                                            <div className="relative">
                                                <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-[10px]">
                                                    {acc.sender_account.email.charAt(0).toUpperCase()}
                                                </div>
                                                {acc.sender_account.status === 'REAUTH_REQUIRED' && (
                                                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-[#141414] animate-pulse" />
                                                )}
                                            </div>
                                            <span className={`text-[11px] truncate ${acc.sender_account.status === 'REAUTH_REQUIRED' ? 'text-red-400 font-medium' : 'text-white/90'}`}>
                                                {acc.sender_account.email}
                                                {acc.sender_account.status === 'REAUTH_REQUIRED' && " (Needs Re-auth)"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">Daily Limit</label>
                                    <div className="flex items-center gap-2 text-white">
                                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                                        <span className="text-sm font-medium">{campaign.daily_limit} / account</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">Subject Line</label>
                                    <div className="flex items-center gap-2 text-white truncate">
                                        <Mail className="w-3.5 h-3.5 text-amber-500" />
                                        <span className="text-sm font-medium truncate italic">&ldquo;{campaign.subject}&rdquo;</span>
                                    </div>
                                </div>
                            </div>

                            {/* View Message Button */}
                            <div className="pt-4 mt-2 border-t border-[#222222]">
                                <button
                                    onClick={() => setShowMessageModal(true)}
                                    className="w-full flex items-center justify-between px-3 py-2 rounded-[8px] border border-transparent hover:border-amber-500/30 transition-all group"
                                >
                                    <div className="flex items-center gap-2">
                                        <Eye className="w-4 h-4 text-amber-500" />
                                        <span className="text-[13px] text-white">View Message</span>
                                    </div>
                                    <span className="text-[12px] px-2 py-1 rounded-[8px] h-7 flex items-center border transition-all cursor-pointer"
                                        style={{ borderColor: "#222222", color: "#888888" }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = "#F59E0B";
                                            e.currentTarget.style.color = "#FFFFFF";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = "#222222";
                                            e.currentTarget.style.color = "#888888";
                                        }}
                                    >
                                        Preview
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Replies Mini List */}
                    <div className="rounded-[10px] bg-[#141414] border border-[#222222] overflow-hidden">
                        <div className="px-6 py-5 border-b border-[#222222] flex items-center justify-between">
                            <h3 className="text-sm font-medium text-white flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Recent Replies
                            </h3>
                            <Link href="/inbox" className="text-[11px] text-amber-500 font-medium hover:underline flex items-center gap-0.5 group">
                                Open Inbox <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </Link>
                        </div>
                        <div className="divide-y divide-[#1a1a1a]">
                            {recentReplies.length > 0 ? recentReplies.map((reply: any) => (
                                <Link
                                    key={reply.id}
                                    href={`/inbox?threadId=${reply.gmail_thread_id}`}
                                    className="block p-4 hover:bg-white/[0.02] transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[12px] font-medium text-white/90 group-hover:text-amber-500 transition-colors">{reply.email}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {new Date(reply.replied_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <span className="truncate">Replied to {campaign.name.slice(0, 15)}...</span>
                                        <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </Link>
                            )) : (
                                <div className="p-10 text-center text-muted-foreground text-xs italic">
                                    No replies received yet.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Message Modal */}
            {showMessageModal && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowMessageModal(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setShowMessageModal(false);
                    }}
                    tabIndex={0}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full max-w-[560px] rounded-[12px] overflow-hidden"
                        style={{ backgroundColor: "#141414", border: "1px solid #222222" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between p-6 pb-4">
                            <div>
                                <h2 className="text-[18px] font-bold text-white">Campaign Message</h2>
                                <p className="text-[13px] mt-1" style={{ color: "#888888" }}>{campaign.name}</p>
                            </div>
                            <button
                                onClick={() => setShowMessageModal(false)}
                                className="p-1 transition-colors"
                                style={{ color: "#888888" }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "#FFFFFF")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "#888888")}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Divider */}
                        <div style={{ borderTop: "1px solid #222222" }} />

                        {/* Subject */}
                        <div className="px-6 py-4">
                            <label className="text-[11px] uppercase tracking-wider" style={{ color: "#888888" }}>Subject</label>
                            <p className="text-[15px] font-bold text-white mt-1">{campaign.subject}</p>
                        </div>

                        {/* Divider */}
                        <div style={{ borderTop: "1px solid #222222" }} />

                        {/* Body */}
                        <div className="px-6 py-4">
                            <label className="text-[11px] uppercase tracking-wider" style={{ color: "#888888" }}>Message Body</label>
                            {campaign.body ? (
                                <div 
                                    className="mt-2 text-[14px] text-white overflow-y-auto"
                                    style={{ 
                                        lineHeight: 1.8, 
                                        whiteSpace: "pre-wrap", 
                                        maxHeight: 360,
                                        scrollbarColor: "#222222 #141414"
                                    }}
                                >
                                    {campaign.body}
                                </div>
                            ) : (
                                <p className="mt-2 text-[14px] italic" style={{ color: "#888888" }}>
                                    No message body was saved for this campaign.
                                </p>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 pb-6 flex justify-center">
                            <button
                                onClick={() => setShowMessageModal(false)}
                                className="px-6 py-2 rounded-[8px] text-white text-[14px] transition-all"
                                style={{ border: "1px solid #222222" }}
                                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#F59E0B")}
                                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#222222")}
                            >
                                Close
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
        DRAFT: { bg: "bg-zinc-800/50", text: "text-zinc-400", label: "Draft" },
        RUNNING: { bg: "bg-amber-500/10", text: "text-amber-500", label: "Active" },
        PAUSED: { bg: "bg-zinc-800/50", text: "text-zinc-400", label: "Paused" },
        COMPLETED: { bg: "bg-emerald-500/10", text: "text-emerald-500", label: "Completed" },
    };
    const c = config[status] || config.DRAFT;
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${c.bg} ${c.text} border border-white/[0.03]`}>
            {c.label}
        </span>
    );
}

function LeadStatusBadge({ status }: { status: string }) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
        PENDING: { bg: "bg-zinc-800", text: "text-zinc-500", label: "Pending" },
        SENT: { bg: "bg-emerald-500/10", text: "text-emerald-500", label: "Sent" },
        REPLIED: { bg: "bg-amber-500/10", text: "text-amber-500", label: "Replied" },
        FAILED: { bg: "#2a1010", text: "#ff4444", label: "Failed" },
        BLOCKED: { bg: "#2a1010", text: "#ff4444", label: "Blocked" },
    };
    const c = config[status] || config.PENDING;
    return (
        <span 
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium leading-none"
            style={{ backgroundColor: c.bg, color: c.text }}
        >
            {c.label}
        </span>
    );
}
