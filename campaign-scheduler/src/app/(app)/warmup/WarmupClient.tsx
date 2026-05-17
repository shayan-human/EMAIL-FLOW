"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    ResponsiveContainer,
    Tooltip,
} from "recharts";
import { motion } from "framer-motion";
import { X, Info } from "lucide-react";
import { toast } from "@/components/ui/toast-provider";
import styles from "./warmup.module.css";



interface WarmupAccount {
    id?: string;
    gmail_account_id: string;
    gmail_email: string;
    status: "inactive" | "warming" | "warmed" | "paused";
    mode: "own_only" | "network";
    day_number: number;
    daily_target: number;
    warmup_duration?: number;
    warmup_duration_days?: number;
    warmed_up_at?: string | null;
    today_sent?: number;
    today_received?: number;
    today_replies?: number;
    today_spam_rescues?: number;
}

interface SenderAccount {
    id: string;
    email: string;
    name: string;
}

interface WarmupStats {
    date: string;
    sent: number;
    received: number;
    replies: number;
    spam_rescues: number;
}

interface CombinedAccount extends WarmupAccount {
    senderAccount: SenderAccount;
    todayStats: WarmupStats | null;
}

interface AggregateStats {
    totalAccounts: number;
    warmedUpAccounts: number;
    activeAccounts: number;
    pausedAccounts: number;
    notStartedAccounts: number;
    totalSent: number;
    totalReceived: number;
    totalReplies: number;
    totalSpamRescues: number;
}

const DURATION_OPTIONS = [5, 10, 20, 30, 40];

interface WarmupClientProps {
    senderAccounts: SenderAccount[];
    networkOptIn: boolean;
}

export default function WarmupClient({
    senderAccounts,
    networkOptIn: initialNetworkOptIn,
}: WarmupClientProps) {
    const [accounts, setAccounts] = useState<CombinedAccount[]>([]);
    const [networkOptIn, setNetworkOptIn] = useState(initialNetworkOptIn);
    const [loading, setLoading] = useState(true);
    const [selectedAccount, setSelectedAccount] = useState<CombinedAccount | null>(null);
    const [drawerStats, setDrawerStats] = useState<WarmupStats[]>([]);
    const [loadingStats, setLoadingStats] = useState(false);
    const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
    const [selectedDurations, setSelectedDurations] = useState<Record<string, number>>({});
    const [aggregateData, setAggregateData] = useState<AggregateStats | null>(null);

    const fetchAccounts = useCallback(async () => {
        try {
            const response = await fetch("/api/warmup/accounts");
            const data = await response.json();

            if (data.success) {
                const warmupMap = new Map<string, WarmupAccount>(
                    (data.data || []).map((wa: WarmupAccount) => [wa.gmail_account_id, wa])
                );

                const combined: CombinedAccount[] = (senderAccounts || []).map(
                    (sa: SenderAccount) => {
                        const wa = warmupMap.get(sa.id);
                        const duration = wa?.warmup_duration || 30;
                        return {
                            id: wa?.id || "",
                            gmail_account_id: wa?.gmail_account_id || sa.id,
                            gmail_email: wa?.gmail_email || sa.email,
                            status: wa?.status || "inactive",
                            mode: wa?.mode || "own_only",
                            day_number: wa?.day_number || 0,
                            daily_target: wa?.daily_target || 0,
                            warmup_duration: duration,
                            warmup_duration_days: wa?.warmup_duration || duration,
                            warmed_up_at: wa?.warmed_up_at || null,
                            senderAccount: sa,
                            todayStats: wa ? {
                            date: new Date().toISOString().split('T')[0],
                            sent: wa.today_sent || 0,
                            received: wa.today_received || 0,
                            replies: wa.today_replies || 0,
                            spam_rescues: wa.today_spam_rescues || 0,
                            } : null,
                        };
                    }
                );

                // Sort accounts: WARMING first, NOT_STARTED (inactive) second, others last
                const sortOrder: Record<string, number> = { 'warming': 0, 'inactive': 1 };
                const sorted = combined.sort((a, b) => 
                    (sortOrder[a.status] ?? 2) - (sortOrder[b.status] ?? 2)
                );
                setAccounts(sorted);
                
                const defaultDurations: Record<string, number> = {};
                (senderAccounts || []).forEach((sa: SenderAccount) => {
                    const wa = warmupMap.get(sa.id);
                    defaultDurations[sa.id] = wa?.warmup_duration || 30;
                });
                setSelectedDurations(defaultDurations);

                // Fetch aggregate stats
                try {
                    const aggRes = await fetch("/api/warmup/stats/aggregate");
                    const aggData = await aggRes.json();
                    if (aggData.success) {
                        setAggregateData(aggData.data);
                    }
                } catch (aggError) {
                    console.error("Error fetching aggregate stats:", aggError);
                }
            }
        } catch (error) {
            console.error("Error fetching accounts:", error);
            toast.error("Failed to load warmup accounts");
        } finally {
            setLoading(false);
        }
    }, [senderAccounts]);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const handleDurationChange = (accountId: string, duration: number) => {
        setSelectedDurations(prev => ({ ...prev, [accountId]: duration }));
    };

    const handleStartWarmup = async (account: CombinedAccount) => {
        const duration = selectedDurations[account.senderAccount.id] || 30;
        try {
            const response = await fetch("/api/warmup/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    gmail_account_id: account.senderAccount.id,
                    mode: networkOptIn ? "network" : "own_only",
                    duration: duration,
                }),
            });

            const data = await response.json();

            if (data.success) {
                toast.success("Warmup started!");
                fetchAccounts();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error("Error starting warmup:", error);
            toast.error("Failed to start warmup");
        }
    };

    const handlePauseWarmup = async (account: CombinedAccount) => {
        try {
            const response = await fetch("/api/warmup/pause", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ warmup_account_id: account.id }),
            });

            const data = await response.json();

            if (data.success) {
                toast.success("Warmup paused");
                fetchAccounts();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error("Error pausing warmup:", error);
            toast.error("Failed to pause warmup");
        }
    };

    const handleResumeWarmup = async (account: CombinedAccount) => {
        try {
            const response = await fetch("/api/warmup/resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ warmup_account_id: account.id }),
            });

            const data = await response.json();

            if (data.success) {
                toast.success("Warmup resumed!");
                fetchAccounts();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error("Error resuming warmup:", error);
            toast.error("Failed to resume warmup");
        }
    };

    const handleModeChange = async (account: CombinedAccount, mode: "own_only" | "network") => {
        if (!account.id) {
            toast.error("Please start warmup first to change mode");
            return;
        }

        try {
            const response = await fetch("/api/warmup/mode", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ warmup_account_id: account.id, mode }),
            });

            const data = await response.json();

            if (data.success) {
                toast.success(`Mode changed to ${mode === "network" ? "EmailFlow Network" : "Own Accounts"}`);
                fetchAccounts();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error("Error changing mode:", error);
            toast.error("Failed to change mode");
        }
    };

    const handleNetworkOptInToggle = async () => {
        const nextValue = !networkOptIn;
        try {
            const response = await fetch(nextValue ? "/api/warmup/network-opt-in" : "/api/warmup/network-opt-out", {
                method: "POST",
            });
            const data = await response.json();
            if (data.success) {
                setNetworkOptIn(nextValue);
                toast.success(nextValue ? "Network opt-in enabled" : "Network opt-in disabled");
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error("Error updating network opt-in:", error);
            toast.error("Failed to update network opt-in");
        }
    };

    const openDrawer = async (account: CombinedAccount) => {
        if (!account.id) return;
        
        setSelectedAccount(account);
        setLoadingStats(true);

        try {
            const response = await fetch(
                `/api/warmup/stats/${account.id}?days=14`
            );
            const data = await response.json();

            if (data.success) {
                setDrawerStats(data.data || []);
            }
        } catch (error) {
            console.error("Error fetching stats:", error);
            toast.error("Failed to load stats");
        } finally {
            setLoadingStats(false);
        }
    };

    const closeDrawer = () => {
        setSelectedAccount(null);
        setDrawerStats([]);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "warming":
                return (
                    <span className={`${styles.statusBadge} ${styles.warming}`}>
                        <span className={styles.pulseDot}></span>
                        Warming
                    </span>
                );
            case "warmed":
                return (
                    <span className={`${styles.statusBadge} ${styles.warmed}`}>
                        Warmed Up
                    </span>
                );
            case "paused":
                return (
                    <span className={`${styles.statusBadge} ${styles.paused}`}>
                        Paused
                    </span>
                );
            default:
                return (
                    <span className={`${styles.statusBadge} ${styles.notStarted}`}>
                        Not Started
                    </span>
                );
        }
    };

    const getInitial = (email: string) => {
        return email?.charAt(0).toUpperCase() || "?";
    };

    const getProgressPercent = (day: number, duration: number) => {
        return Math.min((day / duration) * 100, 100);
    };

    const chartData = drawerStats.map((stat) => ({
        date: new Date(stat.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        sent: stat.sent || 0,
    }));

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                    Loading...
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* PART A: Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1>Email Warmup</h1>
                    <p>Build sender reputation automatically across your Gmail accounts.</p>
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.toggleContainer}>
                        <span className={styles.toggleLabel}>EmailFlow Network Opt-In</span>
                        <div
                            className={`${styles.toggle} ${networkOptIn ? styles.active : ""}`}
                            onClick={handleNetworkOptInToggle}
                            role="switch"
                            aria-checked={networkOptIn}
                            tabIndex={0}
                        >
                            <div className={styles.toggleKnob} />
                        </div>
                    </div>
                    <div className={styles.toggleHelper}>
                        Allow your accounts to be used as warmup partners for other EmailFlow users.
                    </div>
                </div>
            </div>

            {/* PART A2: Aggregate Stats Panel */}
            {accounts.length > 0 && (
                <motion.div 
                    className={styles.aggregateStats}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                >
                    <div className={styles.aggregateStatItem}>
                        <span className={styles.aggregateStatValue}>{aggregateData?.totalAccounts ?? accounts.length}</span>
                        <span className={styles.aggregateStatLabel}>Total Accounts</span>
                    </div>
                    <div className={styles.aggregateStatDivider} />
                    <div className={styles.aggregateStatItem}>
                        <span className={styles.aggregateStatValue}>{aggregateData?.warmedUpAccounts ?? 0}</span>
                        <span className={styles.aggregateStatLabel}>Warmed Up</span>
                    </div>
                    <div className={styles.aggregateStatDivider} />
                    <div className={styles.aggregateStatItem}>
                        <span className={styles.aggregateStatValue}>{aggregateData?.activeAccounts ?? 0}</span>
                        <span className={styles.aggregateStatLabel}>Active</span>
                    </div>
                    <div className={styles.aggregateStatDivider} />
                    <div className={styles.aggregateStatItem}>
                        <span className={styles.aggregateStatValue}>{aggregateData?.pausedAccounts ?? 0}</span>
                        <span className={styles.aggregateStatLabel}>Paused</span>
                    </div>
                    <div className={styles.aggregateStatDivider} />
                    <div className={styles.aggregateStatItem}>
                        <span className={styles.aggregateStatValue}>{aggregateData?.totalSent ?? 0}</span>
                        <span className={styles.aggregateStatLabel}>Total Sent</span>
                    </div>
                    <div className={styles.aggregateStatDivider} />
                    <div className={styles.aggregateStatItem}>
                        <span className={styles.aggregateStatValue}>{aggregateData?.totalReceived ?? 0}</span>
                        <span className={styles.aggregateStatLabel}>Total Received</span>
                    </div>
                    <div className={styles.aggregateStatDivider} />
                    <div className={styles.aggregateStatItem}>
                        <span className={styles.aggregateStatValue}>{aggregateData?.totalReplies ?? 0}</span>
                        <span className={styles.aggregateStatLabel}>Total Replies</span>
                    </div>
                    <div className={styles.aggregateStatDivider} />
                    <div className={styles.aggregateStatItem}>
                        <span className={styles.aggregateStatValue}>{aggregateData?.totalSpamRescues ?? 0}</span>
                        <span className={styles.aggregateStatLabel}>Spam Rescues</span>
                    </div>
                </motion.div>
            )}

            {/* PART B: Account Cards Grid */}
            {accounts.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>📧</div>
                    <h3 className={styles.emptyTitle}>No Gmail accounts connected</h3>
                    <p className={styles.emptyText}>
                        Connect a Gmail account to start warming up your sender reputation.
                    </p>
                </div>
            ) : (
                <div className={styles.grid}>
                    {accounts.map((account) => (
                        <div
                            key={account.senderAccount.id}
                            className={styles.card}
                            onClick={() => openDrawer(account)}
                        >
                            <div className={styles.cardTop}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                                    <div className={styles.avatar}>
                                        {getInitial(account.senderAccount.email)}
                                    </div>
                                    <span className={styles.email} title={account.senderAccount.email}>{account.senderAccount.email}</span>
                                </div>
                                {getStatusBadge(account.status)}
                            </div>

                            <div className={styles.progressSection}>
                                <div className={styles.progressLabel}>
                                    Day {account.day_number} / {account.status === "inactive" ? (selectedDurations[account.senderAccount.id] || 30) : (account.warmup_duration || 30)}
                                </div>
                                <div className={styles.progressBar}>
                                    <div
                                        className={styles.progressFill}
                                        style={{ width: `${getProgressPercent(account.day_number, account.status === "inactive" ? (selectedDurations[account.senderAccount.id] || 30) : (account.warmup_duration || 30))}%` }}
                                    ></div>
                                </div>
                            </div>

                            {account.status === "inactive" && (
                                <div className={styles.durationSection}>
                                    <div className={styles.durationLabel}>
                                        Warmup Duration
                                        {selectedDurations[account.senderAccount.id] === 30 && (
                                            <span className={styles.recommendedBadge}>Recommended</span>
                                        )}
                                    </div>
                                    <div className={styles.durationPills}>
                                        {DURATION_OPTIONS.map((duration) => (
                                            <button
                                                key={duration}
                                                className={`${styles.durationPill} ${selectedDurations[account.senderAccount.id] === duration ? styles.selected : ""}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDurationChange(account.senderAccount.id, duration);
                                                }}
                                            >
                                                {duration} Days
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={styles.statsRow}>
                                <div className={styles.statItem}>
                                    <div className={styles.statLabel}>Sent</div>
                                    <div className={styles.statValue}>{account.todayStats?.sent || 0}</div>
                                </div>
                                <div className={styles.statItem}>
                                    <div className={styles.statLabel}>Received</div>
                                    <div className={styles.statValue}>{account.todayStats?.received || 0}</div>
                                </div>
                                <div className={styles.statItem}>
                                    <div className={styles.statLabel}>Replies</div>
                                    <div className={styles.statValue}>{account.todayStats?.replies || 0}</div>
                                </div>
                                <div className={styles.statItem}>
                                    <div className={styles.statLabel}>Spam Rescues</div>
                                    <div className={styles.statValue}>{account.todayStats?.spam_rescues || 0}</div>
                                </div>
                            </div>

                            <div className={styles.modeSection}>
                                <div className={styles.modePills}>
                                    <button
                                        className={`${styles.modePill} ${account.mode === "own_only" ? styles.selected : ""} ${!account.id ? styles.disabled : ""}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleModeChange(account, "own_only");
                                        }}
                                        disabled={!account.id}
                                    >
                                        Own Accounts
                                        <Info 
                                            size={13} 
                                            className={styles.infoIcon} 
                                            onMouseEnter={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setTooltip({ 
                                                    text: "Warmup emails are only exchanged between your own connected Gmail accounts.", 
                                                    x: rect.left + rect.width / 2, 
                                                    y: rect.top 
                                                });
                                            }}
                                            onMouseLeave={() => setTooltip(null)}
                                        />
                                    </button>
                                    <button
                                        className={`${styles.modePill} ${account.mode === "network" ? styles.selected : ""} ${!account.id ? styles.disabled : ""}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleModeChange(account, "network");
                                        }}
                                        disabled={!account.id}
                                    >
                                        EmailFlow Network
                                        <Info 
                                            size={13} 
                                            className={styles.infoIcon}
                                            onMouseEnter={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setTooltip({ 
                                                    text: "Your accounts are paired with other EmailFlow users' accounts for a larger, more realistic warmup network. Your email address may be used as a warmup partner.", 
                                                    x: rect.left + rect.width / 2, 
                                                    y: rect.top 
                                                });
                                            }}
                                            onMouseLeave={() => setTooltip(null)}
                                        />
                                    </button>
                                </div>
                            </div>

                            <button
                                className={`${styles.ctaButton} ${
                                    account.status === "inactive"
                                        ? styles.start
                                        : account.status === "warming"
                                        ? styles.pause
                                        : account.status === "paused"
                                        ? styles.resume
                                        : styles.warmed
                                }`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (account.status === "inactive") {
                                        handleStartWarmup(account);
                                    } else if (account.status === "warming") {
                                        handlePauseWarmup(account);
                                    } else if (account.status === "paused") {
                                        handleResumeWarmup(account);
                                    }
                                }}
                            >
                                {account.status === "inactive"
                                    ? "Start Warmup"
                                    : account.status === "warming"
                                    ? "Pause"
                                    : account.status === "paused"
                                    ? "Resume"
                                    : "Warmed Up ✓"}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* PART C: Stats Drawer */}
            {selectedAccount && (
                <>
                    <div className={styles.drawerOverlay} onClick={closeDrawer}></div>
                    <div className={styles.drawer}>
                        <div className={styles.drawerHeader}>
                            <span className={styles.drawerEmail}>{selectedAccount.senderAccount.email}</span>
                            <button className={styles.closeButton} onClick={closeDrawer}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className={styles.drawerContent}>
                            {selectedAccount.warmed_up_at && (
                                <div className={styles.completedInfo}>
                                    <div className={styles.completedInfoItem}>
                                        <span className={styles.completedInfoLabel}>Warmed Up On</span>
                                        <span className={styles.completedInfoValue}>
                                            {new Date(selectedAccount.warmed_up_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                        </span>
                                    </div>
                                    <div className={styles.completedInfoItem}>
                                        <span className={styles.completedInfoLabel}>Warmup Duration</span>
                                        <span className={styles.completedInfoValue}>{selectedAccount.warmup_duration_days || selectedAccount.warmup_duration || 30} Days</span>
                                    </div>
                                </div>
                            )}
                            <div className={styles.chartSection}>
                                <h3 className={styles.chartTitle}>Sent Volume (Last 14 Days)</h3>
                                <div className={styles.chart}>
                                    {loadingStats ? (
                                        <div className={styles.loading}>
                                            <div className={styles.spinner}></div>
                                            Loading...
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={chartData}>
                                                <XAxis
                                                    dataKey="date"
                                                    stroke="#666666"
                                                    fontSize={10}
                                                    tickLine={false}
                                                    axisLine={false}
                                                />
                                                <YAxis
                                                    stroke="#666666"
                                                    fontSize={10}
                                                    tickLine={false}
                                                    axisLine={false}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: "#1a1a1a",
                                                        border: "1px solid #333333",
                                                        borderRadius: "8px",
                                                        color: "#ffffff",
                                                    }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="sent"
                                                    stroke="#F59E0B"
                                                    strokeWidth={2}
                                                    dot={false}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>

                            <div className={styles.tableSection}>
                                <h3 className={styles.tableTitle}>Daily Stats</h3>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Sent</th>
                                            <th>Received</th>
                                            <th>Replies</th>
                                            <th>Spam</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {drawerStats.map((stat) => (
                                            <tr key={stat.date}>
                                                <td>
                                                    {new Date(stat.date).toLocaleDateString("en-US", {
                                                        month: "short",
                                                        day: "numeric",
                                                    })}
                                                </td>
                                                <td>{stat.sent || 0}</td>
                                                <td>{stat.received || 0}</td>
                                                <td>{stat.replies || 0}</td>
                                                <td>{stat.spam_rescues || 0}</td>
                                            </tr>
                                        ))}
                                        {drawerStats.length === 0 && !loadingStats && (
                                            <tr>
                                                <td colSpan={5} style={{ textAlign: "center", color: "#666" }}>
                                                    No data available
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {tooltip && (
                <div 
                    className={styles.tooltip} 
                    style={{ left: tooltip.x, top: tooltip.y }}
                >
                    {tooltip.text}
                    <div className={styles.tooltipArrow} />
                </div>
            )}
        </div>
    );
}
