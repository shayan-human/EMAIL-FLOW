"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useUser } from "@/hooks/use-user";

import { Plus, Mail, Unplug, RefreshCw, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { toast } from "@/components/ui/toast-provider";
import { SimpleConfirmModal } from "@/components/ui/simple-confirm-modal";

interface Account {
    id: string;
    email: string;
    is_active: boolean;
    status: string;
    created_at: string;
    google_access_token: string | null;
    google_refresh_token: string | null;
    sent_today: number;
    last_synced_at: string;
}

// ── Status badge component ────────────────────────────────────────────
function StatusBadge({ status }: { status: "active" | "rate_limited" | "error" | "reauth_required" }) {
    const config = {
        active: { bg: "rgba(22,163,106,0.12)", text: "#16a34a", label: "Active" },
        rate_limited: { bg: "rgba(234,179,8,0.12)", text: "#eab308", label: "Rate Limited" },
        error: { bg: "rgba(239,68,68,0.12)", text: "#ef4444", label: "Error" },
        reauth_required: { bg: "rgba(239,68,68,0.12)", text: "#ef4444", label: "Re-auth Required" },
    };
    const c = config[status] || config.error;
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
            style={{ backgroundColor: c.bg, color: c.text, border: status === 'reauth_required' ? `1px solid ${c.text}40` : 'none' }}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${status === 'reauth_required' ? 'animate-pulse' : ''}`} style={{ backgroundColor: c.text }} />
            {c.label}
        </span>
    );
}

// ── Time ago helper ───────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
    if (!dateStr) return "never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
}

function OAuthSetupGuide() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com';
  const uris = [
    `${origin}/api/auth/callback/google`,
    `${origin}/api/gmail-connect/callback/google`,
  ];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="mb-6 border border-blue-200 rounded-xl bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
          ⚙️ First time setup? Google Developer OAuth Configuration Guide
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-blue-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-blue-500" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            To connect Gmail accounts, you need to configure your Google Cloud project. Follow these steps:
          </p>

          <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-decimal list-inside">
            <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Google Cloud Console</a></li>
            <li>Create a new project (or select an existing one)</li>
            <li>Enable the <strong>Gmail API</strong></li>
            <li>Go to <strong>APIs & Services → Credentials → Create OAuth 2.0 Client ID</strong></li>
            <li>Set application type to <strong>Web Application</strong></li>
            <li>Add the following to <strong>Authorized Redirect URIs</strong>:</li>
          </ol>

          <div className="space-y-2">
            {uris.map((uri) => (
              <div
                key={uri}
                className="flex items-center justify-between gap-2 bg-white dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-4 py-2"
              >
                <code className="text-xs text-blue-800 dark:text-blue-200 break-all">{uri}</code>
                <button
                  onClick={() => copyToClipboard(uri)}
                  className="shrink-0 text-blue-500 hover:text-blue-700 transition-colors"
                >
                  {copied === uri ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>

          <ol start={7} className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-decimal list-inside">
            <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> into your <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">.env</code> file</li>
            <li>Restart the app — you're ready to connect accounts!</li>
          </ol>
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

    const fetchAccounts = async () => {
        try {
            const response = await fetch("/api/accounts", {
                cache: 'no-store', // Avoid caching empty results
                headers: { 'Cache-Control': 'no-cache' }
            });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 401) {
                    console.warn("Unauthorized: Session might still be loading.");
                    return null; // Distinct return for unauthorized
                }
                throw new Error(data.error);
            }
            return data.data || [];
        } catch (err: unknown) {
            console.error(err);
            toast.error("Failed to fetch accounts");
            return [];
        }
    };

    useEffect(() => {
        let cancelled = false;
        if (!isLoaded) return;

        const init = async () => {
            setIsLoading(true);
            try {
                const existing = await fetchAccounts();
                if (cancelled) return;

                // If it's null (unauthorized), we might want to keep loading or wait
                if (existing === null) {
                    // Silent wait, don't set accounts yet
                    return;
                }

                setAccounts(existing);

                // Handle OAuth Success Redirect
                const successParam = searchParams.get("success");
                if (successParam === "account_connected") {
                    toast.success("Gmail account connected successfully!");
                    router.replace("/accounts", { scroll: false });
                }
            } catch (err) {
                console.error("Error in accounts init:", err);
                toast.error("An unexpected error occurred loading accounts.");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        init();
        return () => { cancelled = true; };
    }, [isLoaded, searchParams, router]);

    const handleConnectGmail = async () => {
        setIsConnecting(true);
        window.location.href = "/api/gmail-connect/google?redirect=/accounts";
    };

    const handleDisconnect = async (id: string) => {
        setConfirmModalOpen(false);
        try {
            const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed to disconnect account");
            }
            toast.info("Account removed");
            setAccounts(accounts.filter(acc => acc.id !== id));
        } catch (err: unknown) {
            console.error(err);
            toast.error("Failed to disconnect account");
        }
    };

    const openDisconnectModal = (id: string) => {
        setSelectedAccountId(id);
        setConfirmModalOpen(true);
    };

    // Determine account status
    const getStatus = (acc: Account): "active" | "rate_limited" | "error" | "reauth_required" => {
        if (acc.status === "REAUTH_REQUIRED") return "reauth_required";
        if (!acc.google_access_token && !acc.google_refresh_token) return "error";
        if (!acc.is_active) return "rate_limited";
        return "active";
    };

    // ── Loading state ─────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-semibold tracking-tight text-white">Gmail Accounts</h1>
                </div>
                <div className="space-y-3">
                    {[1, 2].map(i => (
                        <div
                            key={i}
                            className="rounded-[10px] animate-pulse"
                            style={{ backgroundColor: "#141414", border: "1px solid #222222", padding: 20 }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full" style={{ backgroundColor: "#222" }} />
                                <div className="space-y-2 flex-1">
                                    <div className="h-4 w-48 rounded" style={{ backgroundColor: "#222" }} />
                                    <div className="h-3 w-32 rounded" style={{ backgroundColor: "#1a1a1a" }} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── Empty state ───────────────────────────────────────────────────
    if (accounts.length === 0) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-semibold tracking-tight text-white">Gmail Accounts</h1>
                </div>
                <OAuthSetupGuide />
                <div
                    className="rounded-[10px] flex flex-col items-center justify-center py-20 px-6 text-center"
                    style={{ backgroundColor: "#141414", border: "1px solid #222222" }}
                >
                    <div
                        className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
                        style={{ backgroundColor: "#1a1a1a" }}
                    >
                        <Mail className="w-7 h-7" style={{ color: "#6b7280" }} />
                    </div>
                    <p className="text-white font-medium text-[15px]">No Gmail accounts connected</p>
                    <p className="text-[13px] mt-1.5 mb-6" style={{ color: "#6b7280" }}>
                        Connect an account to start sending campaigns. If you already have accounts, click refresh.
                    </p>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleConnectGmail}
                            disabled={isConnecting}
                            className="btn-primary flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            {isConnecting ? "Connecting..." : "Connect Account"}
                        </button>
                        <button
                            onClick={() => {
                                setIsLoading(true);
                                fetchAccounts().then(data => {
                                    if (data !== null) setAccounts(data);
                                    setIsLoading(false);
                                });
                            }}
                            className="px-4 py-2 rounded bg-white/5 border border-white/10 text-white text-[14px] font-medium hover:bg-white/10 transition-all flex items-center gap-2"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Main view ─────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold tracking-tight text-white">Gmail Accounts</h1>
                <button
                    onClick={handleConnectGmail}
                    disabled={isConnecting}
                    className="btn-primary flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    {isConnecting ? "Connecting..." : "Connect Account"}
                </button>
            </div>

            <OAuthSetupGuide />

            {/* Account cards */}
            <div className="space-y-3">
                {accounts.map((acc) => {
                    const status = getStatus(acc);
                    return (
                        <div
                            key={acc.id}
                            className="rounded-[10px] transition-colors duration-200 group"
                            style={{ backgroundColor: "#141414", border: "1px solid #222222", padding: 20 }}
                        >
                            {/* Top row */}
                            <div className="flex items-center justify-between">
                                {/* Left: avatar + info */}
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold uppercase shrink-0"
                                        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                                    >
                                        {acc.email[0]}
                                    </div>
                                    <div>
                                        <p className="text-[14px] font-medium text-white">{acc.email}</p>
                                        <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>
                                            Connected via OAuth
                                        </p>
                                    </div>
                                </div>

                                {/* Right: status + meta */}
                                <div className="flex items-center gap-4">
                                    <div className="text-right hidden sm:block">
                                        <p className="text-[11px]" style={{ color: "#6b7280" }}>
                                            Last synced: {timeAgo(acc.last_synced_at)}
                                        </p>
                                    </div>
                                    <StatusBadge status={status} />
                                </div>
                            </div>

                            {/* Account Health Block */}
                            <div className="mt-4 pt-4 space-y-3" style={{ borderTop: "1px solid #1f1f1f" }}>
                                <div className="flex items-center justify-between font-bold">
                                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                                        {acc.sent_today || 0} / 100 sent today
                                    </span>
                                    {(() => {
                                        const usage = ((acc.sent_today || 0) / 100) * 100;
                                        let statusColor = "#10B981"; // Healthy (Green)
                                        let label = "HEALTHY";

                                        if (usage >= 90) {
                                            statusColor = "#EF4444"; // At Limit (Red)
                                            label = "AT LIMIT";
                                        } else if (usage >= 70) {
                                            statusColor = "#F59E0B"; // Warming (Amber/Primary)
                                            label = "WARMING";
                                        }

                                        return (
                                            <span
                                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] tracking-widest font-bold border"
                                                style={{
                                                    color: statusColor,
                                                    backgroundColor: `${statusColor}10`,
                                                    borderColor: `${statusColor}20`
                                                }}
                                            >
                                                <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: statusColor, boxShadow: `0 0 4px ${statusColor}` }} />
                                                {label}
                                            </span>
                                        );
                                    })()}
                                </div>

                                <div className="w-full h-[4px] bg-[#1e1e1e] rounded-full overflow-hidden">
                                    <div
                                        className="h-full transition-all duration-500"
                                        style={{
                                            width: `${Math.min(((acc.sent_today || 0) / 100) * 100, 100)}%`,
                                            backgroundColor: (acc.sent_today || 0) >= 90 ? "#EF4444" : "#F59E0B"
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Actions row */}
                            <div className="flex items-center justify-between mt-3">
                                <div className="flex items-center gap-4">
                                    {/* Empty or metadata placeholder if needed */}
                                </div>
                                <div className="flex items-center gap-2">
                                    {status === "reauth_required" && (
                                        <button
                                            onClick={handleConnectGmail}
                                            className="px-3 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] font-bold uppercase hover:bg-red-500 hover:text-white transition-all flex items-center gap-1.5"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            Re-auth
                                        </button>
                                    )}
                                    <button
                                        onClick={() => openDisconnectModal(acc.id)}
                                        className="btn-destructive flex items-center gap-1.5 text-[12px] opacity-0 group-hover:opacity-100"
                                    >
                                        <Unplug className="w-3.5 h-3.5" />
                                        Disconnect
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <SimpleConfirmModal
                open={confirmModalOpen}
                title="Disconnect Account"
                message="This will remove the account from the app."
                confirmText="Disconnect"
                cancelText="Cancel"
                variant="warning"
                onConfirm={() => selectedAccountId && handleDisconnect(selectedAccountId)}
                onCancel={() => { setConfirmModalOpen(false); setSelectedAccountId(null); }}
            />
        </div>
    );
}
