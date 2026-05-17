"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@/hooks/use-user";
import { toast } from "@/components/ui/toast-provider";
import { SimpleConfirmModal } from "@/components/ui/simple-confirm-modal";
import Link from "next/link";
import {
    Plus,
    Megaphone,
    MoreHorizontal,
    Eye,
    Pause,
    Trash2,
} from "lucide-react";

interface CampaignRow {
    id: string;
    name: string;
    status: string;
    total_leads: number;
    subject: string | null;
    created_at: string;
    sent_count: number;
    reply_count: number;
    reply_rate: number;
}

const TABS = [
    { key: "All", label: "All" },
    { key: "RUNNING", label: "Active" },
    { key: "COMPLETED", label: "Completed" },
    { key: "PAUSED", label: "Paused" },
] as const;

// ── Status badge ──────────────────────────────────────────────────────
function StatusBadge({ status, completion = 0 }: { status: string, completion?: number }) {
    const displayStatus = completion === 100 && status === 'RUNNING' ? 'COMPLETED' : status;
    const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
        DRAFT: { bg: "rgba(113,113,122,0.12)", text: "#71717a", dot: "#71717a", label: "Draft" },
        RUNNING: { bg: "rgba(22,163,106,0.12)", text: "#16a34a", dot: "#16a34a", label: "Active" },
        PAUSED: { bg: "rgba(234,179,8,0.12)", text: "#eab308", dot: "#eab308", label: "Paused" },
        COMPLETED: { bg: "rgba(113,113,122,0.12)", text: "#71717a", dot: "#71717a", label: "Completed" },
    };
    const c = config[displayStatus] || config.DRAFT;
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
            style={{ backgroundColor: c.bg, color: c.text }}
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
            {c.label}
        </span>
    );
}

// ── Three-dot action menu ─────────────────────────────────────────────
function ActionMenu({
    campaign,
    onPause,
    onDelete,
}: {
    campaign: CampaignRow;
    onPause: (id: string, status: string) => void;
    onDelete: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        if (open) document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: "#6b7280" }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#fff";
                    e.currentTarget.style.backgroundColor = "#1f1f1f";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#6b7280";
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
            >
                <MoreHorizontal className="w-4 h-4" />
            </button>

            {open && (
                <div
                    className="absolute right-0 top-full mt-1 w-36 rounded-lg py-1 z-50 shadow-xl"
                    style={{ backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a" }}
                >
                    <Link
                        href={`/campaigns/${campaign.id}`}
                        className="flex items-center gap-2 px-3 py-2 text-[12px] text-white/80 hover:bg-white/[0.06] transition-colors"
                        onClick={() => setOpen(false)}
                    >
                        <Eye className="w-3.5 h-3.5" /> View
                    </Link>
                    {(campaign.status === "RUNNING" || campaign.status === "PAUSED" || campaign.status === "DRAFT") && (
                        <button
                            onClick={() => {
                                onPause(campaign.id, campaign.status === "RUNNING" ? "PAUSED" : "RUNNING");
                                setOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/80 hover:bg-white/[0.06] transition-colors"
                        >
                            <Pause className="w-3.5 h-3.5" />
                            {campaign.status === "RUNNING" ? "Pause" : "Resume"}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            onDelete(campaign.id);
                            setOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] transition-colors btn-destructive"
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.08)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Progress bar ──────────────────────────────────────────────────────
function ProgressBar({ value }: { value: number }) {
    return (
        <div className="w-full rounded-full overflow-hidden" style={{ height: 6, backgroundColor: "#222222" }}>
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(value, 100)}%`, backgroundColor: "#F59E0B" }}
            />
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function CampaignsPage() {
    const { user, isLoaded } = useUser();
    const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>("All");
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

    const fetchCampaigns = async () => {
        if (!isLoaded) return;
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/campaign");
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            const campaignsList = data.campaigns || [];
            const leadsList = data.leads || [];

            // Count sent/replied per campaign in memory
            const sentMap: Record<string, number> = {};
            const repliedMap: Record<string, number> = {};
            for (const lead of leadsList) {
                if (lead.status === "SENT" || lead.status === "REPLIED") {
                    sentMap[lead.campaign_id] = (sentMap[lead.campaign_id] || 0) + 1;
                }
                if (lead.status === "REPLIED") {
                    repliedMap[lead.campaign_id] = (repliedMap[lead.campaign_id] || 0) + 1;
                }
            }

            const enriched: CampaignRow[] = campaignsList.map((c: any) => {
                const sent = sentMap[c.id] || 0;
                const replied = repliedMap[c.id] || 0;
                const replyRate = sent > 0 ? Math.round((replied / sent) * 100) : 0;
                return { ...c, sent_count: sent, reply_count: replied, reply_rate: replyRate };
            });

            setCampaigns(enriched);
        } catch (err) {
            console.error("Error fetching campaigns:", err);
            toast.error("Failed to load campaigns.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCampaigns();
    }, [isLoaded, user?.id]);

    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            const res = await fetch(`/api/campaigns/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus })
            });
            if (!res.ok) throw new Error("Failed to update status");
            toast.success(`Campaign ${newStatus.toLowerCase()}`);
            setCampaigns(campaigns.map(c => c.id === id ? { ...c, status: newStatus } : c));
        } catch {
            toast.error("Failed to update campaign status");
        }
    };

    const handleDelete = async (id: string) => {
        setConfirmModalOpen(false);
        try {
            const res = await fetch(`/api/campaigns/${id}`, {
                method: "DELETE"
            });
            if (!res.ok) throw new Error("Failed to delete campaign");
            toast.success("Campaign deleted");
            setCampaigns(campaigns.filter(c => c.id !== id));
        } catch {
            toast.error("Failed to delete campaign");
        }
    };

    const openDeleteModal = (id: string) => {
        setSelectedCampaignId(id);
        setConfirmModalOpen(true);
    };

    const filtered = filter === "All" ? campaigns : campaigns.filter(c => c.status === filter);

    const displayName = (name: string) => {
        if (!name || name.startsWith("Campaign-")) return "Untitled Campaign";
        return name;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold tracking-tight text-white">Campaigns</h1>
                <Link
                    href="/campaigns/new"
                    className="btn-primary flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    New Campaign
                </Link>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-6" style={{ borderBottom: "1px solid #1f1f1f" }}>
                {TABS.map((tab) => {
                    const isActive = filter === tab.key;
                    const count = tab.key === "All"
                        ? campaigns.length
                        : campaigns.filter(c => c.status === tab.key).length;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            className="relative pb-3 text-[13px] font-medium transition-colors"
                            style={{ color: isActive ? "#fff" : "#6b7280" }}
                        >
                            {tab.label}{count > 0 ? ` (${count})` : ""}
                            {isActive && (
                                <span
                                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                                    style={{ backgroundColor: "#F59E0B" }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                        <div
                            key={i}
                            className="rounded-[10px] animate-pulse"
                            style={{ backgroundColor: "#141414", border: "1px solid #222222", padding: 20, height: 56 }}
                        />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                /* Empty state */
                <div
                    className="rounded-[10px] flex flex-col items-center justify-center py-16"
                    style={{ backgroundColor: "#141414", border: "1px solid #222222" }}
                >
                    <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#1a1a1a" }}>
                        <Megaphone className="w-6 h-6" style={{ color: "#6b7280" }} />
                    </div>
                    <p className="text-white font-medium text-[14px]">
                        {filter === "All" ? "No campaigns yet" : "No campaigns found"}
                    </p>
                    <p className="text-[12px] mt-1" style={{ color: "#6b7280" }}>
                        {filter === "All"
                            ? "Create your first campaign to get started."
                            : `No campaigns with "${TABS.find(t => t.key === filter)?.label}" status.`}
                    </p>
                    {filter === "All" && (
                        <Link
                            href="/campaigns/new"
                            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                            style={{ backgroundColor: "#F59E0B", color: "#0f0f0f" }}
                        >
                            <Plus className="w-4 h-4" />
                            Create your first campaign
                        </Link>
                    )}
                </div>
            ) : (
                /* Table */
                <div
                    className="rounded-[10px]"
                    style={{ backgroundColor: "#141414", border: "1px solid #222222" }}
                >
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                                <th className="text-left py-3 px-4 text-[11px] font-medium uppercase tracking-wider rounded-tl-[10px]" style={{ color: "#6b7280" }}>Campaign Name</th>
                                <th className="text-left py-3 px-4 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#6b7280" }}>Status</th>
                                <th className="text-right py-3 px-4 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#6b7280" }}>Sent</th>
                                <th className="text-right py-3 px-4 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#6b7280" }}>Replies</th>
                                <th className="text-right py-3 px-4 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#6b7280" }}>Reply Rate</th>
                                <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#6b7280", width: 140 }}>Completion</th>
                                <th className="text-center py-3 px-4 text-[11px] font-medium uppercase tracking-wider rounded-tr-[10px]" style={{ color: "#6b7280", width: 60 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((c) => {
                                const completionRate = c.total_leads > 0
                                    ? Math.round((c.sent_count / c.total_leads) * 100)
                                    : 0;
                                return (
                                    <tr
                                        key={c.id}
                                        className="transition-colors"
                                        style={{ borderBottom: "1px solid #1a1a1a" }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1a1a1a")}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                                    >
                                        <td className="py-3 px-4">
                                            <p className="text-[13px] font-medium text-white">{displayName(c.name)}</p>
                                            <p className="text-[11px] mt-0.5" style={{ color: "#555" }}>
                                                {new Date(c.created_at).toLocaleDateString()}
                                            </p>
                                        </td>
                                        <td className="py-3 px-4"><StatusBadge status={c.status} completion={completionRate} /></td>
                                        <td className="py-3 px-4 text-right tabular-nums text-white text-[13px]">
                                            {c.sent_count}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-[13px]">
                                            <span style={{ color: c.reply_count > 0 ? "#F59E0B" : "#6b7280" }}>
                                                {c.reply_count}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-[13px]">
                                            <span style={{ color: c.reply_rate > 0 ? "#16a34a" : "#6b7280" }}>
                                                {c.reply_rate}%
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <ProgressBar value={completionRate} />
                                                <span className="text-[11px] tabular-nums shrink-0" style={{ color: "#6b7280" }}>
                                                    {completionRate}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <ActionMenu
                                                campaign={c}
                                                onPause={handleStatusChange}
                                                onDelete={openDeleteModal}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <SimpleConfirmModal
                open={confirmModalOpen}
                title="Delete Campaign"
                message="Are you sure you want to delete this campaign? Your leads and send history will also be permanently removed."
                confirmText="Delete Campaign"
                cancelText="Cancel"
                variant="danger"
                onConfirm={() => selectedCampaignId && handleDelete(selectedCampaignId)}
                onCancel={() => { setConfirmModalOpen(false); setSelectedCampaignId(null); }}
            />
        </div>
    );
}
