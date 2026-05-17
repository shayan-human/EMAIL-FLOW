"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PenTool, KeySquare, HelpCircle, ArrowLeft, ArrowRight, UserCircle2, User, Sparkles, X, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast-provider";
import { Account } from "./Step1Accounts";
import { useUser } from "@/hooks/use-user";
import { RotateDraftsSelector } from "@/components/campaign-builder/RotateDraftsSelector";
import { generateEmailContent } from "@/lib/openrouter";

interface Step3Props {
    onNext: (subject: string, body: string, selectedAccountIds: string[], senderDisplayName?: string, selectedDraftIds?: string[], copyMode?: "single" | "rotate") => void;
    onBack: () => void;
}

const PERSONALIZATION_OPTIONS = [
    { label: 'First Name', tag: '{{firstName}}' },
    { label: 'Last Name', tag: '{{lastName}}' },
    { label: 'Full Name', tag: '{{fullName}}' },
    { label: 'Business Name', tag: '{{businessName}}' },
    { label: 'Email', tag: '{{email}}' },
    { label: 'Website', tag: '{{website}}' },
];

export function Step3Copy({ onNext, onBack }: Step3Props) {
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");

    const [copyMode, setCopyMode] = useState<"single" | "rotate">("single");
    const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);

    // Popup state
    const [activePopup, setActivePopup] = useState<'subject' | 'body' | null>(null);
    const [slashIndex, setSlashIndex] = useState<number | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const subjectContainerRef = useRef<HTMLDivElement>(null);
    const bodyContainerRef = useRef<HTMLDivElement>(null);

    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
    const [sendNameMode, setSendNameMode] = useState<'account' | 'custom'>('account');
    const [customSenderName, setCustomSenderName] = useState('');
    const { user, isLoaded } = useUser();

    // AI Assist state
    const [showAIPanel, setShowAIPanel] = useState(false);
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiType, setAiType] = useState<"subject" | "body" | "both">("both");
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (isLoaded && user) {
            fetchAccounts();
        }
    }, [isLoaded, user]);

    // Handle click outside for popup
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (activePopup === 'subject' && subjectContainerRef.current && !subjectContainerRef.current.contains(event.target as Node)) {
                setActivePopup(null);
            } else if (activePopup === 'body' && bodyContainerRef.current && !bodyContainerRef.current.contains(event.target as Node)) {
                setActivePopup(null);
            }
        }
        if (activePopup) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [activePopup]);

    const fetchAccounts = async () => {
        if (!user) return;
        setIsLoadingAccounts(true);
        try {
            const res = await fetch("/api/accounts");
            if (!res.ok) {
                throw new Error("Failed to fetch accounts");
            }
            const { data } = await res.json();
            const accountsList = data || [];

            setAccounts(accountsList);

            const nonWarming = accountsList.filter((a: Account) => a.warmup_status !== "warming");
            if (nonWarming.length > 0) {
                setSelectedAccountIds(nonWarming.map((a: Account) => a.id));
            } else {
                setSelectedAccountIds([]);
            }
        } catch {
            toast.error("Failed to fetch accounts");
        } finally {
            setIsLoadingAccounts(false);
        }
    };

    const toggleAccount = (id: string, checked: boolean) => {
        const acc = accounts.find(a => a.id === id);
        if (acc && acc.warmup_status === "warming") return;
        if (checked) {
            setSelectedAccountIds(prev => [...prev, id]);
        } else {
            setSelectedAccountIds(prev => prev.filter(accId => accId !== id));
        }
    };

    const handleAIGenerate = async () => {
        if (!aiPrompt.trim()) return;
        
        setIsGenerating(true);
        try {
            const result = await generateEmailContent({
                prompt: aiPrompt,
                type: aiType
            });

            if (result.error) {
                toast.error(result.error);
                return;
            }

            if (result.subject && aiType !== "body") {
                setSubject(result.subject);
            }
            if (result.body && aiType !== "subject") {
                setBody(result.body);
            }
            
            setShowAIPanel(false);
            setAiPrompt("");
            toast.success("Content generated!");
        } catch {
            toast.error("Failed to generate content");
        } finally {
            setIsGenerating(false);
        }
    };

    const [validationError, setValidationError] = useState<string | null>(null);

    const handleNext = () => {
        setValidationError(null);
        
        if (copyMode === "single") {
            if (!subject.trim()) {
                toast.error("Please enter a subject line and email body.");
                return;
            }
            if (!body.trim()) {
                toast.error("Please enter a subject line and email body.");
                return;
            }
        } else {
            if (selectedDraftIds.length < 2) {
                setValidationError("Please select at least 2 drafts to rotate.");
                return;
            }
        }
        
        if (selectedAccountIds.length === 0) {
            toast.error("Please select at least one sender account");
            return;
        }
        
        if (copyMode === "single") {
            onNext(subject, body, selectedAccountIds, sendNameMode === 'custom' ? customSenderName.trim() : undefined);
        } else {
            onNext("", "", selectedAccountIds, sendNameMode === 'custom' ? customSenderName.trim() : undefined, selectedDraftIds, copyMode);
        }
    };

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
        field: 'subject' | 'body'
    ) => {
        const val = e.target.value;
        if (field === 'subject') setSubject(val);
        else setBody(val);

        const cursorPosition = e.target.selectionStart;
        if (cursorPosition && val.charAt(cursorPosition - 1) === '/') {
            setActivePopup(field);
            setSlashIndex(cursorPosition - 1);
            setSelectedIndex(0);
        } else if (activePopup === field && cursorPosition && val.charAt(cursorPosition - 1) !== '/') {
            setActivePopup(null);
        }
    };

    const handleKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
        field: 'subject' | 'body'
    ) => {
        if (activePopup === field) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % PERSONALIZATION_OPTIONS.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + PERSONALIZATION_OPTIONS.length) % PERSONALIZATION_OPTIONS.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                handleSelectOption(PERSONALIZATION_OPTIONS[selectedIndex], field);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setActivePopup(null);
            }
        }
    };

    const handleSelectOption = (option: { label: string, tag: string }, field: 'subject' | 'body') => {
        if (field === 'subject') {
            if (slashIndex !== null) {
                const before = subject.substring(0, slashIndex);
                const after = subject.substring(slashIndex + 1);
                setSubject(before + option.tag + after);
            } else {
                setSubject(prev => prev + option.tag);
            }
        } else {
            if (slashIndex !== null) {
                const before = body.substring(0, slashIndex);
                const after = body.substring(slashIndex + 1);
                setBody(before + option.tag + after);
            } else {
                setBody(prev => prev + option.tag);
            }
        }
        setActivePopup(null);
        setSlashIndex(null);
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-heading font-bold text-foreground">Campaign Details</h2>
                <p className="text-muted-foreground">Draft your email and select which Google accounts to disperse the sends across.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Left Column: Email Copy Editor (Spans 2 cols) */}
                <Card className="border-0 shadow-md ring-1 ring-black/5 lg:col-span-2 flex flex-col h-full">
                    <CardHeader className="bg-primary/5 border-b pb-4">
                        <CardTitle className="text-xl font-heading flex items-center gap-2">
                            <PenTool className="h-5 w-5 text-primary" />
                            Email Copy
                        </CardTitle>
                        <CardDescription>
                            Use <code className="bg-white dark:bg-zinc-800 px-1 py-0.5 rounded text-primary">{"{{firstName}}"}</code> to insert the leads mapped first name.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6 flex-1 flex flex-col">
                        {/* Copy Mode Toggle - Always visible */}
                        <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">Copy Mode</Label>
                                <span className="text-xs text-muted-foreground">Optional</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setCopyMode("single")}
                                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 text-center ${copyMode === "single"
                                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-sm ring-1 ring-indigo-500/20"
                                        : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"
                                        }`}
                                >
                                    <p className={`text-sm font-semibold ${copyMode === "single" ? "text-indigo-700 dark:text-indigo-300" : "text-foreground"}`}>Single Draft</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">Use the subject/body you typed</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCopyMode("rotate")}
                                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 text-center ${copyMode === "rotate"
                                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 shadow-sm ring-1 ring-amber-500/20"
                                        : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"
                                        }`}
                                >
                                    <p className={`text-sm font-semibold ${copyMode === "rotate" ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>Rotate Drafts</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">Pick saved drafts to rotate</p>
                                </button>
                            </div>
                        </div>

                        {/* Animated Content Area */}
                        <AnimatePresence mode="wait">
                            {copyMode === "single" ? (
                                <motion.div
                                    key="single-fields"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-6"
                                >
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="subject" className="text-base font-semibold">Subject Line</Label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setShowAIPanel(true)}
                                                className="text-xs gap-1.5 h-7 px-2 text-muted-foreground hover:text-foreground"
                                            >
                                                <Sparkles className="w-3.5 h-3.5" />
                                                AI Assist
                                            </Button>
                                        </div>
                                        <div className="relative" ref={subjectContainerRef}>
                                            <Input
                                                id="subject"
                                                placeholder="e.g. Quick question about {{firstName}}..."
                                                value={subject}
                                                onChange={(e) => handleInputChange(e, 'subject')}
                                                onKeyDown={(e) => handleKeyDown(e, 'subject')}
                                                className="text-base py-6"
                                                autoComplete="off"
                                            />
                                            {activePopup === 'subject' && (
                                                <div className="absolute top-full left-0 mt-2 w-56 rounded-xl border shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" style={{ backgroundColor: "#141414", borderColor: "#222" }}>
                                                    <div className="px-3 py-2 border-b bg-muted/10 text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ borderColor: "#222" }}>
                                                        Insert Personalization
                                                    </div>
                                                    <div className="p-1 max-h-60 overflow-y-auto">
                                                        {PERSONALIZATION_OPTIONS.map((option, idx) => (
                                                            <button
                                                                 key={option.tag}
                                                                 onClick={() => handleSelectOption(option, 'subject')}
                                                                 className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group ${idx === selectedIndex ? 'bg-primary/10 text-primary' : 'text-zinc-300 hover:bg-zinc-800'}`}
                                                             >
                                                                 <span>{option.label}</span>
                                                                 <span className={`text-xs font-mono opacity-50 ${idx === selectedIndex ? 'text-primary' : 'group-hover:text-zinc-400'}`}>{option.tag}</span>
                                                             </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2 flex-1 flex flex-col">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="body" className="text-base font-semibold">Email Body</Label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setShowAIPanel(true)}
                                                className="text-xs gap-1.5 h-7 px-2 text-muted-foreground hover:text-foreground"
                                            >
                                                <Sparkles className="w-3.5 h-3.5" />
                                                AI Assist
                                            </Button>
                                        </div>
                                        <div className="relative" ref={bodyContainerRef}>
                                            <Textarea
                                                id="body"
                                                placeholder="Hi {{firstName}},&#10;&#10;I noticed you..."
                                                value={body}
                                                onChange={(e) => handleInputChange(e, 'body')}
                                                onKeyDown={(e) => handleKeyDown(e, 'body')}
                                                className="flex-1 min-h-[300px] text-base leading-relaxed resize-none font-sans"
                                            />
                                            {activePopup === 'body' && (
                                                <div className="absolute top-full left-0 mt-2 w-56 rounded-xl border shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" style={{ backgroundColor: "#141414", borderColor: "#222" }}>
                                                    <div className="px-3 py-2 border-b bg-muted/10 text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ borderColor: "#222" }}>
                                                        Insert Personalization
                                                    </div>
                                                    <div className="p-1 max-h-60 overflow-y-auto">
                                                        {PERSONALIZATION_OPTIONS.map((option, idx) => (
                                                            <button
                                                                 key={option.tag}
                                                                 onClick={() => handleSelectOption(option, 'body')}
                                                                 className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group ${idx === selectedIndex ? 'bg-primary/10 text-primary' : 'text-zinc-300 hover:bg-zinc-800'}`}
                                                             >
                                                                 <span>{option.label}</span>
                                                                 <span className={`text-xs font-mono opacity-50 ${idx === selectedIndex ? 'text-primary' : 'group-hover:text-zinc-400'}`}>{option.tag}</span>
                                                             </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="rotate-selector"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-3"
                                >
                                    <RotateDraftsSelector
                                        enabled={copyMode === "rotate"}
                                        selectedDraftIds={selectedDraftIds}
                                        onSelectedDraftIdsChange={(ids) => {
                                            setSelectedDraftIds(ids);
                                            setValidationError(null);
                                        }}
                                    />
                                    
                                    {validationError && (
                                        <p className="text-sm" style={{ color: "#ff4444" }}>{validationError}</p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </CardContent>
                </Card>

                {/* Right Column: Account Selection */}
                <Card className="border-0 shadow-md ring-1 ring-black/5 bg-muted/20 flex flex-col h-full">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl font-heading flex items-center gap-2">
                            <KeySquare className="h-5 w-5 text-primary" />
                            Sender Accounts
                        </CardTitle>
                        <CardDescription>
                            Select accounts to rotate sending.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto pr-2 space-y-3">
                        {isLoadingAccounts ? (
                            <p className="text-sm text-muted-foreground animate-pulse">Loading accounts...</p>
                        ) : accounts.length === 0 ? (
                            <div className="bg-destructive/10 text-destructive p-3 rounded-md border border-destructive/20 text-sm flex gap-2">
                                <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>No sender accounts found. Please go back to Step 1 and connect an account.</span>
                            </div>
                        ) : (() => {
                            const nonWarmingAccounts = accounts.filter((a: Account) => a.warmup_status !== "warming");
                            const warmingAccounts = accounts.filter((a: Account) => a.warmup_status === "warming");
                            const selectableCount = nonWarmingAccounts.length;

                            return (
                                <div className="space-y-3">
                                    {nonWarmingAccounts.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between pb-2 border-b">
                                                <span className="text-sm font-medium text-muted-foreground">Available ({selectableCount})</span>
                                                <Checkbox
                                                    checked={selectedAccountIds.length === nonWarmingAccounts.length && nonWarmingAccounts.length > 0}
                                                    onCheckedChange={(checked: boolean | 'indeterminate') => {
                                                        if (checked) setSelectedAccountIds(nonWarmingAccounts.map(a => a.id));
                                                        else setSelectedAccountIds([]);
                                                    }}
                                                />
                                            </div>
                                            {nonWarmingAccounts.map(acc => (
                                                <div
                                                    key={acc.id}
                                                    className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${selectedAccountIds.includes(acc.id) ? 'bg-primary/5 border-primary/30' : 'bg-card hover:bg-muted/50'}`}
                                                    onClick={() => toggleAccount(acc.id, !selectedAccountIds.includes(acc.id))}
                                                >
                                                    <Checkbox
                                                        id={`acc-${acc.id}`}
                                                        checked={selectedAccountIds.includes(acc.id)}
                                                        onCheckedChange={(c: boolean | 'indeterminate') => toggleAccount(acc.id, c as boolean)}
                                                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                    />
                                                    <div className="grid gap-1.5 leading-none flex-1">
                                                        <label htmlFor={`acc-${acc.id}`} className="text-sm font-medium leading-none cursor-pointer truncate">
                                                            {acc.email}
                                                        </label>
                                                    </div>
                                                    <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {warmingAccounts.length > 0 && (
                                        <div className="space-y-2 pt-2 border-t">
                                            <div className="flex items-center gap-2 pb-1">
                                                <span className="text-sm font-medium text-muted-foreground">Warming Up ({warmingAccounts.length})</span>
                                            </div>
                                            {warmingAccounts.map(acc => (
                                                <div
                                                    key={acc.id}
                                                    className="flex items-center space-x-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10 opacity-60 cursor-not-allowed"
                                                >
                                                    <Checkbox
                                                        id={`acc-${acc.id}`}
                                                        checked={false}
                                                        disabled
                                                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                    />
                                                    <div className="grid gap-1.5 leading-none flex-1">
                                                        <label htmlFor={`acc-${acc.id}`} className="text-sm font-medium leading-none cursor-not-allowed truncate flex items-center gap-1.5">
                                                            {acc.email}
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                                                <Flame className="h-2.5 w-2.5" /> Warming
                                                            </span>
                                                        </label>
                                                    </div>
                                                    <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {nonWarmingAccounts.length === 0 && warmingAccounts.length > 0 && (
                                        <div className="bg-amber-500/10 text-amber-600 dark:text-amber-400 p-3 rounded-md border border-amber-500/20 text-sm flex gap-2">
                                            <Flame className="h-4 w-4 shrink-0 mt-0.5" />
                                            <span>All accounts are warming up. They will be available for campaigns once warmup completes.</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </CardContent>
                </Card>

                {/* Send Name As Section */}
                <Card className="border-0 shadow-md ring-1 ring-black/5 bg-muted/20 flex flex-col">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl font-heading flex items-center gap-2">
                            <User className="h-5 w-5 text-primary" />
                            Send Name As
                        </CardTitle>
                        <CardDescription>
                            Choose the display name recipients see.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setSendNameMode('account')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 text-center ${sendNameMode === 'account'
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-sm ring-1 ring-indigo-500/20'
                                        : 'border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30'
                                    }`}
                            >
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${sendNameMode === 'account' ? 'bg-indigo-500 text-white' : 'bg-muted text-muted-foreground'
                                    }`}>
                                    <UserCircle2 className="w-4.5 h-4.5" />
                                </div>
                                <div>
                                    <p className={`text-sm font-semibold ${sendNameMode === 'account' ? 'text-indigo-700 dark:text-indigo-300' : 'text-foreground'}`}>Account Name</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">Use original email account name</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSendNameMode('custom')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 text-center ${sendNameMode === 'custom'
                                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 shadow-sm ring-1 ring-amber-500/20'
                                        : 'border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30'
                                    }`}
                            >
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${sendNameMode === 'custom' ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'
                                    }`}>
                                    <PenTool className="w-4.5 h-4.5" />
                                </div>
                                <div>
                                    <p className={`text-sm font-semibold ${sendNameMode === 'custom' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'}`}>Custom Name</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">All accounts send as this name</p>
                                </div>
                            </button>
                        </div>
                        {sendNameMode === 'custom' && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <Label htmlFor="customSenderName" className="text-sm font-medium">Display Name</Label>
                                <Input
                                    id="customSenderName"
                                    placeholder="e.g. EmailFlow"
                                    value={customSenderName}
                                    onChange={(e) => setCustomSenderName(e.target.value)}
                                    className="text-base"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Recipients will see: <strong className="text-foreground">{customSenderName || 'YourName'}</strong> &lt;actual-email@gmail.com&gt;
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="flex items-center justify-between pt-4 border-t mt-8">
                <Button variant="ghost" size="lg" onClick={onBack} className="font-medium">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button
                    size="lg"
                    onClick={handleNext}
                    disabled={(copyMode === "single" && (!subject.trim() || !body.trim())) || selectedAccountIds.length === 0}
                    className="px-8 font-bold"
                >
                    Finalize Schedule <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </div>

            {/* AI Assist Panel */}
            <AnimatePresence>
                {showAIPanel && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                        onClick={() => setShowAIPanel(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-background rounded-xl border shadow-2xl w-full max-w-lg overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-4 border-b bg-muted/20">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-primary" />
                                    <h3 className="font-semibold">AI Email Assistant</h3>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setShowAIPanel(false)}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                            <div className="p-4 space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">What do you want to write about?</Label>
                                    <Textarea
                                        placeholder="e.g. Write a cold email about scheduling a demo call for our marketing software. Target marketing managers at small businesses."
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        className="min-h-[100px] text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Generate</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setAiType("subject")}
                                            className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                                                aiType === "subject"
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border hover:bg-muted"
                                            }`}
                                        >
                                            Subject Only
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAiType("body")}
                                            className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                                                aiType === "body"
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border hover:bg-muted"
                                            }`}
                                        >
                                            Body Only
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAiType("both")}
                                            className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                                                aiType === "both"
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border hover:bg-muted"
                                            }`}
                                        >
                                            Both
                                        </button>
                                    </div>
                                </div>
                                <Button
                                    className="w-full"
                                    onClick={handleAIGenerate}
                                    disabled={!aiPrompt.trim() || isGenerating}
                                >
                                    {isGenerating ? (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            Generate Content
                                        </>
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
