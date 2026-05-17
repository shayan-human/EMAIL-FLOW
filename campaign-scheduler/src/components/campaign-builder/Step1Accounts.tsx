"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/hooks/use-user";
import { toast } from "@/components/ui/toast-provider";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Mail, CheckCircle, Trash2, RefreshCw, Flame } from "lucide-react";

export interface Account {
    id: string;
    email: string;
    is_active: boolean;
    status: string;
    created_at: string;
    google_access_token: string | null;
    google_refresh_token: string | null;
    warmup_status?: string | null;
}

interface Step1Props {
    onNext: () => void;
}

export function Step1Accounts({ onNext }: Step1Props) {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{
        open: boolean;
        accountId: string | null;
        accountEmail: string;
    }>({ open: false, accountId: null, accountEmail: "" });
    const hasSavedTokens = useRef(false);

    const fetchAccounts = async () => {
        try {
            const res = await fetch("/api/accounts");
            if (!res.ok) {
                throw new Error("Failed to fetch accounts");
            }
            const { data } = await res.json();
            const accountsList = data || [];

            const nonWarming = accountsList.filter((a: Account) => a.warmup_status !== "warming");
            const warming = accountsList.filter((a: Account) => a.warmup_status === "warming");

            return [...nonWarming, ...warming];
        } catch (err: unknown) {
            console.error(err);
            toast.error("Failed to fetch accounts");
            return [];
        }
    };

    // Single merged useEffect: fetch accounts, then check for tokens
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            if (!isLoaded) return; // Wait for auth to be loaded
            setIsLoading(true);

            // 1. Fetch existing accounts first
            const existing = await fetchAccounts();
            if (cancelled) return;
            setAccounts(existing);

            // 2. Check if we just returned from OAuth and need to save tokens
            if (!hasSavedTokens.current) {
                hasSavedTokens.current = true;
                const userAny = user as any;
                if (userAny?.provider_token && user?.email && user?.id) {
                    await saveTokens({ provider_token: userAny.provider_token, provider_refresh_token: userAny.provider_refresh_token, user: { id: user.id, email: user.email } }, existing);
                    if (cancelled) return;
                    // Re-fetch to show the updated/new account
                    const refreshed = await fetchAccounts();
                    if (cancelled) return;
                    setAccounts(refreshed);
                }
            }

            // 3. Handle OAuth Success Redirect
            const successParam = searchParams.get("success");
            if (successParam === "account_connected") {
                toast.success("Gmail account connected successfully!");
                // Remove the query param to prevent infinite loops on reload
                router.replace("/campaigns/new", { scroll: false });
                // Automatically move to the next step if we have accounts
                if (existing.length > 0) {
                    onNext();
                }
            }

            setIsLoading(false);
        };

        init();
        return () => { cancelled = true; };
    }, [searchParams, router, onNext, isLoaded]); // Added isLoaded

    const handleConnectGmail = async () => {
        setIsConnecting(true);
        window.location.href = "/api/gmail-connect/google?redirect=/campaigns/new";
    };

    // Use backend endpoint to upsert tokens
    const saveTokens = async (
        session: { provider_token?: string | null; provider_refresh_token?: string | null; user: { id: string; email?: string } },
        currentAccounts: Account[]
    ) => {
        const providerToken = session.provider_token;
        const providerRefreshToken = session.provider_refresh_token;
        const userEmail = session.user.email;

        if (!providerToken || !userEmail) return;

        try {
            // Find existing to preserve refresh token if new one is missing
            const existing = currentAccounts.find(a => a.email === userEmail);

            const res = await fetch("/api/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: userEmail,
                    google_access_token: providerToken,
                    google_refresh_token: providerRefreshToken || existing?.google_refresh_token || null
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed to save Gmail tokens");
            }

            toast.success(existing ? "Gmail tokens refreshed!" : "Gmail account connected!");
        } catch (err: unknown) {
            console.error(err);
            toast.error("Failed to save Gmail tokens");
        }
    };

    const handleSaveTokens = async () => {
        if (!user) {
            toast.error("No active session. Please sign in first.");
            return;
        }
        const userAny = user as any;
        if (!userAny.provider_token) {
            toast.error("No Gmail access token found. Please reconnect with Google.");
            return;
        }
        await saveTokens({ provider_token: userAny.provider_token, provider_refresh_token: userAny.provider_refresh_token, user: { id: user.id, email: user.email || "" } }, accounts);
        const refreshed = await fetchAccounts();
        setAccounts(refreshed);
    };

    const handleDelete = async () => {
        if (!confirmModal.accountId) return;

        try {
            const res = await fetch(`/api/accounts/${confirmModal.accountId}`, {
                method: "DELETE"
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed to remove account");
            }

            toast.success("Account removed");
            setAccounts(accounts.filter(acc => acc.id !== confirmModal.accountId));
            setConfirmModal({ open: false, accountId: null, accountEmail: "" });
        } catch (err: unknown) {
            console.error(err);
            toast.error("Failed to remove account");
        }
    };

    const openDeleteModal = (id: string, email: string) => {
        setConfirmModal({ open: true, accountId: id, accountEmail: email });
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-heading font-bold text-foreground">Sender Accounts</h2>
                <p className="text-muted-foreground">Connect your Gmail accounts via Google OAuth to send campaigns.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Left Column: List existing accounts */}
                <Card className="border-0 shadow-md ring-1 ring-black/5 flex flex-col h-[450px]">
                    <CardHeader className="bg-primary/5 border-b pb-4 shrink-0">
                        <CardTitle className="text-xl font-heading flex items-center gap-2">
                            <Mail className="h-5 w-5 text-primary" />
                            Connected Accounts
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-full">
                                <span className="animate-pulse text-muted-foreground">Loading accounts...</span>
                            </div>
                        ) : accounts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-6 border-2 border-dashed rounded-lg bg-muted/30">
                                <Mail className="h-10 w-10 text-muted-foreground/50 mb-3" />
                                <p className="text-foreground font-medium">No accounts connected</p>
                                <p className="text-sm text-muted-foreground mt-1 mb-4">Connect your first Gmail account to start sending.</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                        setIsLoading(true);
                                        const results = await fetchAccounts();
                                        setAccounts(results);
                                        setIsLoading(false);
                                    }}
                                    className="flex items-center gap-2"
                                map={null}>
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Check again
                                </Button>
                            </div>
                        ) : (
                            accounts.map((acc) => {
                                const isWarming = acc.warmup_status === "warming";
                                return (
                                <div
                                    key={acc.id}
                                    className={`flex items-center justify-between p-3 rounded-md border bg-card shadow-sm transition-colors ${isWarming ? "opacity-50 cursor-not-allowed border-amber-200 dark:border-amber-800" : "hover:border-primary/30"}`}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className={`flex-shrink-0 p-2 rounded-full ${isWarming ? "bg-amber-100 dark:bg-amber-900/30" : "bg-primary/10"}`}>
                                            <Mail className={`h-4 w-4 ${isWarming ? "text-amber-600 dark:text-amber-400" : "text-primary"}`} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="font-medium text-sm truncate">{acc.email}</p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                                {isWarming ? (
                                                    <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                                                        <Flame className="h-3 w-3" /> Warming Up
                                                    </span>
                                                ) : acc.status === "REAUTH_REQUIRED" ? (
                                                    <span className="flex items-center gap-1 font-bold text-red-600 animate-pulse">
                                                        <CheckCircle className="h-3 w-3" /> Re-auth Required
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-500">
                                                        <CheckCircle className="h-3 w-3" /> Connected via Google
                                                    </span>
                                                )}
                                                <span>•</span>
                                                <span>{new Date(acc.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:text-destructive shrink-0"
                                        onClick={() => !isWarming && openDeleteModal(acc.id, acc.email)}
                                        disabled={isWarming}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                  );
                            })
                        )}
                    </CardContent>
                </Card>

                {/* Right Column: Connect Gmail via OAuth */}
                <Card className="border shadow-md" style={{ backgroundColor: "#141414", borderColor: "#222222" }}>
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl font-heading flex items-center gap-2">
                            <Plus className="h-5 w-5 text-primary" />
                            Add Gmail Account
                        </CardTitle>
                        <CardDescription>
                            Connect a Gmail account via Google OAuth. We&apos;ll securely request permission to send emails on your behalf.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="p-4 bg-muted/50 rounded-lg border space-y-3">
                            <h4 className="font-medium text-sm">How it works:</h4>
                            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                                <li>Click the button below to sign in with Google</li>
                                <li>Grant permission to send emails</li>
                                <li>Your account will appear in the list automatically</li>
                            </ol>
                        </div>

                        <Button
                            onClick={handleConnectGmail}
                            className="w-full mt-2 font-semibold shadow-sm active:scale-95 transition-all"
                            disabled={isConnecting}
                            size="lg"
                        >
                            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            {isConnecting ? "Connecting..." : "Connect Gmail Account"}
                        </Button>

                        <Button
                            variant="outline"
                            onClick={handleSaveTokens}
                            className="w-full"
                        >
                            Refresh Tokens from Current Session
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-end pt-4 border-t mt-8">
                <Button
                    size="lg"
                    onClick={onNext}
                    disabled={accounts.length === 0 || !accounts.some(a => a.status !== 'REAUTH_REQUIRED')}
                    className="px-8 font-bold"
                >
                    {accounts.length === 0
                        ? "Connect an account to continue"
                        : !accounts.some(a => a.status !== 'REAUTH_REQUIRED')
                            ? "Reconnect an account to continue"
                            : "Setup Leads \u2192"}
                </Button>
            </div>

            <ConfirmModal
                isOpen={confirmModal.open}
                title="Remove Account"
                message={`Are you sure you want to remove ${confirmModal.accountEmail}? This cannot be undone.`}
                confirmText="Remove"
                cancelText="Cancel"
                variant="danger"
                onConfirm={handleDelete}
                onCancel={() => setConfirmModal({ open: false, accountId: null, accountEmail: "" })}
            />
        </div>
    );
}
