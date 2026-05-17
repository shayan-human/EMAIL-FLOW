"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { v4 as uuidv4 } from "uuid";
import { toast } from "@/components/ui/toast-provider";
import {
    Calculator,
    Play,
    AlertTriangle,
    CalendarDays,
    Clock,
    Mails,
    ArrowLeft,
    Zap,
    Shuffle,
    ListOrdered
} from "lucide-react";

import {
    CampaignSettingsSchema,
    type CampaignSettings,
    type CampaignPayload
} from "@/lib/validations/campaign";

import {
    calculateTotalCapacity,
    calculateRequiredDays,
    calculateAverageDelay,
    checkWindowWarning,
    estimateCompletionTime,
    type EstimationResult
} from "@/lib/calculations";

import { format } from "date-fns";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// Common timezones to keep dropdown clean, could be expanded.
const TIMEZONES = [
    { value: "America/New_York", label: "Eastern Time (ET)" },
    { value: "America/Chicago", label: "Central Time (CT)" },
    { value: "America/Denver", label: "Mountain Time (MT)" },
    { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
    { value: "Europe/London", label: "London (GMT/BST)" },
    { value: "Europe/Berlin", label: "Central Europe (CET/CEST)" },
    { value: "Asia/Kolkata", label: "India Standard Time (IST)" },
    { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },
    { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
];

import { MappedLead } from "@/components/campaign-builder/Step2Leads";

interface Step4Props {
    leads: MappedLead[];
    subject: string;
    body: string;
    selectedAccountIds: string[];
    senderDisplayName?: string;
    selectedDraftIds?: string[];
    copyMode?: "single" | "rotate";
    onBack: () => void;
}

export function CampaignScheduler({ leads, subject, body, selectedAccountIds, senderDisplayName, selectedDraftIds, copyMode, onBack }: Step4Props) {
    const [isInstantSubmitting, setIsInstantSubmitting] = useState(false);
    const [isScheduleSubmitting, setIsScheduleSubmitting] = useState(false);
    const router = useRouter();

    // Derived values from props
    const totalLeads = leads.length;
    const activeAccounts = selectedAccountIds.length;

    // Real-time calculation state
    const [capacity, setCapacity] = useState(0);
    const [daysInt, setDaysInt] = useState(0);
    const [avgDelay, setAvgDelay] = useState(0);
    const [windowWarning, setWindowWarning] = useState(false);
    const [estimate, setEstimate] = useState<EstimationResult>({
        estimatedEndDate: "",
        estimatedEndTime: "",
        totalCalendarDaysScheduled: 0,
    });

    const form = useForm<CampaignSettings>({
        resolver: zodResolver(CampaignSettingsSchema) as any,
        defaultValues: {
            totalLeads: totalLeads,
            activeAccounts: activeAccounts,
            dailyLimitPerAccount: 40,
            startTime: "09:00",
            endTime: "17:00",
            minDelay: 5,
            maxDelay: 15,
            skipWeekends: true,
            timezone: "Asia/Kolkata", // Default to India Standard Time (IST)
            startDate: format(new Date(), 'yyyy-MM-dd'),
            sendingMode: "round-robin" as const,
            enableSchedule: false,
        },
        mode: "onChange",
    });

    // Removed automatic timezone detection in favor of fixed default (India) per user request

    useEffect(() => {
        // Sync props to form if they change
        form.setValue("totalLeads", totalLeads);
        form.setValue("activeAccounts", activeAccounts);

        // Initial suggested limit (max share to finish in 1 day)
        const suggestedLimit = Math.ceil(totalLeads / Math.max(activeAccounts, 1));
        const finalLimit = Math.min(suggestedLimit, totalLeads || 1);

        form.setValue("dailyLimitPerAccount", finalLimit);

        console.log(`[Distribution] Auto-calculated limit: ${finalLimit} (Leads: ${totalLeads}, Accounts: ${activeAccounts})`);
    }, [totalLeads, activeAccounts, form]);

    // Watch all values to auto-recalculate limits
    const values = form.watch();

    // Distribution Breakdown Logic
    const getDistribution = () => {
        if (activeAccounts === 0) return { breakdown: [], totalDays: 0, day1Total: 0, finalDayTotal: 0 };

        const basePerAccount = Math.floor(totalLeads / activeAccounts);
        const remainder = totalLeads % activeAccounts;

        const breakdown = Array.from({ length: activeAccounts }).map((_, i) => ({
            id: selectedAccountIds[i],
            count: basePerAccount + (i < remainder ? 1 : 0)
        }));

        const dailyBaseCapacity = activeAccounts * values.dailyLimitPerAccount;
        const totalDays = dailyBaseCapacity > 0 ? Math.max(1, Math.floor(totalLeads / dailyBaseCapacity)) : 1;

        // On the final day, we send everything remaining
        const beforeFinalTotal = (totalDays - 1) * dailyBaseCapacity;
        const finalDayTotal = totalLeads - beforeFinalTotal;

        return { breakdown, totalDays, day1Total: totalDays === 1 ? totalLeads : dailyBaseCapacity, finalDayTotal };
    };

    const dist = getDistribution();

    useEffect(() => {
        // Only perform calculations if core values are somewhat valid numbers
        if (
            !isNaN(values.activeAccounts) &&
            !isNaN(values.dailyLimitPerAccount) &&
            !isNaN(values.totalLeads) &&
            !isNaN(values.minDelay) &&
            !isNaN(values.maxDelay) &&
            values.startDate
        ) {
            const currentCapacity = calculateTotalCapacity(values.activeAccounts, values.dailyLimitPerAccount);
            const reqDays = calculateRequiredDays(values.totalLeads, currentCapacity);
            const average = calculateAverageDelay(values.minDelay, values.maxDelay);
            const isWarn = checkWindowWarning(
                values.dailyLimitPerAccount,
                average,
                values.startTime,
                values.endTime
            );

            const newEstimate = estimateCompletionTime(
                values.totalLeads,
                currentCapacity,
                average,
                values.startTime,
                values.endTime,
                values.timezone,
                values.skipWeekends,
                values.startDate,
                values.enableSchedule
            );

            setCapacity(currentCapacity);
            setDaysInt(reqDays);
            setAvgDelay(average);
            setWindowWarning(isWarn);
            setEstimate(newEstimate);
        }
    }, [
        values.totalLeads,
        values.activeAccounts,
        values.dailyLimitPerAccount,
        values.startTime,
        values.endTime,
        values.minDelay,
        values.maxDelay,
        values.skipWeekends,
        values.timezone,
        values.enableSchedule,
    ]);

    async function onSubmit(data: CampaignSettings) {
        setIsScheduleSubmitting(true);
        const idempotencyKey = uuidv4();

        const payload = {
            ...data,
            idempotencyKey,
            subject,
            body,
            selectedAccountIds,
            mappedLeads: leads,
            senderDisplayName,
            selectedDraftIds: selectedDraftIds || [],
            copyMode: copyMode || "single",
        } as unknown as CampaignPayload;

        try {
            const response = await fetch("/api/campaign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(result?.message || result?.error || `Failed to start campaign: ${response.statusText}`);
            }

            toast.success("Campaign Scheduled Successfully!", {
                description: result?.data?.dispatched ? "Dispatched to workflow engine." : "Campaign saved and ready.",
            });

            // Redirect to campaigns list after success
            setTimeout(() => {
                router.push("/campaigns");
            }, 1500);
        } catch (error: any) {
            console.error("[Schedule Error Details]:", error);
            toast.error("Failed to schedule campaign", {
                description: error.message || "Unknown error occurred",
            });
        } finally {
            setIsScheduleSubmitting(false);
        }
    }

    async function handleInstantExecution() {
        setIsInstantSubmitting(true);

        // Validate the form before sending to prevent server-side Validation Failed errors
        const isValid = await form.trigger();
        if (!isValid) {
            toast.error("Please fix form errors before sending.", {
                description: "Check the highlighted fields below.",
            });
            setIsInstantSubmitting(false);
            return;
        }

        const idempotencyKey = uuidv4();
        const instantData = form.getValues();

        const payload = {
            ...instantData,
            idempotencyKey,
            subject,
            body,
            selectedAccountIds,
            mappedLeads: leads,
            senderDisplayName,
            selectedDraftIds: selectedDraftIds || [],
            copyMode: copyMode || "single",
        } as CampaignPayload;

        try {
            const response = await fetch("/api/campaign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(result?.message || result?.error || `Failed to instantly send campaign: ${response.statusText}`);
            }

            toast.success("Campaign Started Instantly!", {
                description: "Leads are being dispatched right now.",
            });

            // Redirect to campaigns list after success
            setTimeout(() => {
                router.push("/campaigns");
            }, 1500);
        } catch (error: any) {
            console.error("[Instant Error Details]:", error);
            toast.error("Failed to instantly send campaign", {
                description: error.message || "Unknown error occurred",
            });
        } finally {
            setIsInstantSubmitting(false);
        }
    }

    return (
        <div className="grid gap-8 lg:grid-cols-2">
            {/* LEFT COL: Configuration Form */}
            <div>
                <Card className="shadow-lg border-0 ring-1 ring-black/5 dark:ring-white/10">
                    <CardHeader className="bg-primary/5 border-b pb-6" style={{ borderColor: "#222222" }}>
                        <CardTitle className="text-xl font-semibold flex items-center gap-2">
                            <Calculator className="h-5 w-5 text-amber-500" />
                            Configure Campaign
                        </CardTitle>
                        <CardDescription>
                            Define your distribution rules. Calculations update automatically in real-time.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Total Leads</Label>
                                        <div className="flex h-10 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background text-muted-foreground items-center">
                                            {totalLeads.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Active Sending Accounts</Label>
                                        <div className="flex h-10 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background text-muted-foreground items-center">
                                            {activeAccounts} selected
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="startDate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Start Date</FormLabel>
                                                <FormControl>
                                                    <Input type="date" className="block w-full appearance-none bg-muted/20 font-medium tracking-wide" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="dailyLimitPerAccount"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Daily Limit (Per Account)</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={totalLeads}
                                                        {...field}
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value, 10) || 1;
                                                            field.onChange(Math.min(Math.max(val, 1), totalLeads));
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    Max: {totalLeads} (total leads)
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="enableSchedule"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-xl border-2 border-border p-4 shadow-sm bg-card hover:bg-muted/30 transition-colors">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-base font-semibold">
                                                    Enable Schedule
                                                </FormLabel>
                                                <FormDescription>
                                                    Only send emails during specific hours.
                                                </FormDescription>
                                            </div>
                                            <FormControl>
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                {values.enableSchedule && (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="grid grid-cols-2 gap-4">
                                            <FormField
                                                control={form.control}
                                                name="timezone"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Timezone</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value || "Asia/Kolkata"}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Select a timezone" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {TIMEZONES.map((tz) => (
                                                                    <SelectItem key={tz.value} value={tz.value}>
                                                                        {tz.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <FormField
                                                control={form.control}
                                                name="startTime"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Start Time (HH:MM)</FormLabel>
                                                        <FormControl>
                                                            <Input type="time" className="block w-full appearance-none bg-muted/20 text-center font-medium tracking-widest text-lg" {...field} value={field.value || "09:00"} onChange={e => { field.onChange(e); form.trigger("endTime"); }} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="endTime"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>End Time (HH:MM)</FormLabel>
                                                        <FormControl>
                                                            <Input type="time" className="block w-full appearance-none bg-muted/20 text-center font-medium tracking-widest text-lg" {...field} value={field.value || "17:00"} onChange={e => { field.onChange(e); form.trigger("startTime"); }} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="minDelay"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Min Delay (mins)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min={1} {...field} onChange={e => { field.onChange(Math.max(parseInt(e.target.value, 10) || 1, 1)); form.trigger("maxDelay"); }} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="maxDelay"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Max Delay (mins)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min={1} {...field} onChange={e => { field.onChange(Math.max(parseInt(e.target.value, 10) || 1, 1)); form.trigger("minDelay"); }} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Sending Mode Toggle */}
                                <FormField
                                    control={form.control}
                                    name="sendingMode"
                                    render={({ field }) => (
                                        <FormItem className="space-y-3">
                                            <FormLabel className="text-base font-semibold">Sending Mode</FormLabel>
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => field.onChange("round-robin")}
                                                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 text-center ${field.value === "round-robin"
                                                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-sm ring-1 ring-indigo-500/20"
                                                        : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"
                                                        }`}
                                                >
                                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${field.value === "round-robin"
                                                        ? "bg-indigo-500 text-white"
                                                        : "bg-muted text-muted-foreground"
                                                        }`}>
                                                        <Shuffle className="w-4.5 h-4.5" />
                                                    </div>
                                                    <div>
                                                        <p className={`text-sm font-semibold ${field.value === "round-robin" ? "text-indigo-700 dark:text-indigo-300" : "text-foreground"
                                                            }`}>Round-Robin</p>
                                                        <p className="text-xs text-muted-foreground mt-0.5">Distribute evenly across accounts</p>
                                                    </div>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => field.onChange("sequential")}
                                                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 text-center ${field.value === "sequential"
                                                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 shadow-sm ring-1 ring-amber-500/20"
                                                        : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"
                                                        }`}
                                                >
                                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${field.value === "sequential"
                                                        ? "bg-amber-500 text-white"
                                                        : "bg-muted text-muted-foreground"
                                                        }`}>
                                                        <ListOrdered className="w-4.5 h-4.5" />
                                                    </div>
                                                    <div>
                                                        <p className={`text-sm font-semibold ${field.value === "sequential" ? "text-amber-700 dark:text-amber-300" : "text-foreground"
                                                            }`}>Sequential Batch</p>
                                                        <p className="text-xs text-muted-foreground mt-0.5">One account finishes before next</p>
                                                    </div>
                                                </button>
                                            </div>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="skipWeekends"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-xl border-2 border-border p-4 shadow-sm bg-card hover:bg-muted/30 transition-colors">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-base font-semibold">
                                                    Skip Weekends
                                                </FormLabel>
                                                <FormDescription>
                                                    Avoid sending emails on Saturday and Sunday.
                                                </FormDescription>
                                            </div>
                                            <FormControl>
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                {windowWarning && (
                                    <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <AlertTriangle className="h-5 w-5" />
                                        <AlertTitle className="font-semibold text-lg">Warning: Time Constraint Risk</AlertTitle>
                                        <AlertDescription className="mt-2 text-sm max-w-[90%] font-medium">
                                            With an average delay of <strong>{avgDelay.toFixed(1)} mins</strong>,
                                            sending <strong>{values.dailyLimitPerAccount}</strong> emails per account may exceed your defined sending window.
                                            Some emails may be deferred to the next scheduled block.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                <div className="flex flex-col sm:flex-row gap-4 pt-2">
                                    <Button
                                        type="button"
                                        onClick={handleInstantExecution}
                                        disabled={isInstantSubmitting || isScheduleSubmitting || !!Object.keys(form.formState.errors).length}
                                        className="flex-1 btn-secondary h-12"
                                    >
                                        {isInstantSubmitting ? (
                                            <span className="flex items-center gap-2">
                                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Sending...
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                <Zap className="h-4 w-4 text-amber-500" />
                                                Start Instantly
                                            </span>
                                        )}
                                    </Button>

                                    <Button
                                        type="submit"
                                        disabled={isScheduleSubmitting || isInstantSubmitting || !!Object.keys(form.formState.errors).length}
                                        className="flex-1 btn-primary h-12"
                                    >
                                        {isScheduleSubmitting ? (
                                            <span className="flex items-center gap-2">
                                                <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                                Scheduling...
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                <Play className="w-4 h-4 fill-current" />
                                                Schedule Campaign
                                            </span>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>

            {/* RIGHT COL: Output / Estimation Display */}
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <h3 className="text-xl font-bold font-heading px-1 text-foreground">Live Estimates</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Card className="bg-card dark:bg-zinc-900 border shadow-sm shrink-0">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    Daily Capacity
                                </CardTitle>
                                <Mails className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold font-heading text-foreground">{dist.day1Total.toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground mt-1 leading-snug">
                                    {dist.totalDays > 1 && totalLeads > dist.day1Total * dist.totalDays
                                        ? `Day 1 load (Final day: ${dist.finalDayTotal})`
                                        : "Total emails across all accounts per day"}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="bg-card dark:bg-zinc-900 border shadow-sm shrink-0">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    Active Sending Days
                                </CardTitle>
                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold font-heading text-foreground">{dist.totalDays}</div>
                                <p className="text-xs text-muted-foreground mt-1 leading-snug">Number of working days required</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Distribution Breakdown Card */}
                    <Card className="bg-muted/30 border shadow-sm border-dashed">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <ListOrdered className="w-3 h-3" />
                                Distribution Breakdown
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {dist.breakdown.length > 0 ? (
                                <div className="grid grid-cols-1 gap-1">
                                    {/* Group accounts with same load for cleaner UI */}
                                    {(() => {
                                        const base = Math.floor(totalLeads / activeAccounts);
                                        const countWithExtra = totalLeads % activeAccounts;
                                        const countWithBase = activeAccounts - countWithExtra;

                                        return (
                                            <>
                                                {countWithExtra > 0 && (
                                                    <div className="flex justify-between items-center text-sm p-2 bg-background/50 rounded-lg border">
                                                        <span className="font-medium">{countWithExtra} account{countWithExtra > 1 ? 's' : ''}</span>
                                                        <span className="text-indigo-500 font-bold">{base + 1} emails each</span>
                                                    </div>
                                                )}
                                                {countWithBase > 0 && (
                                                    <div className="flex justify-between items-center text-sm p-2 bg-background/50 rounded-lg border">
                                                        <span className="font-medium">{countWithBase} account{countWithBase > 1 ? 's' : ''}</span>
                                                        <span className="text-muted-foreground font-bold">{base} emails each</span>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground italic text-center py-2">Select accounts to see distribution</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <Card className="text-white border shadow-lg overflow-hidden shrink-0 relative mt-2" style={{ backgroundColor: "#141414", borderColor: "#222222" }}>
                    {/* Decorative background circle */}
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white/5 blur-2xl pointer-events-none" />

                    <CardHeader className="pb-4 border-b border-white/5 flex flex-row items-center gap-3 relative z-10">
                        <Clock className="w-5 h-5 text-zinc-400" />
                        <CardTitle className="text-sm font-semibold tracking-wide text-zinc-100 mt-0.5">Projected Completion</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 relative z-10 pb-6">
                        <div className="space-y-6">
                            <div>
                                <p className="text-zinc-500 text-xs font-bold mb-1.5 uppercase tracking-wider">Estimated End Date</p>
                                <div className="text-4xl font-black font-heading tracking-tight text-white drop-shadow-sm">
                                    {estimate.estimatedEndDate || "---"}
                                </div>
                            </div>
                            <div>
                                <p className="text-zinc-500 text-xs font-bold mb-1.5 uppercase tracking-wider">Estimated End Time</p>
                                <div className="text-xl font-semibold font-body text-zinc-300">
                                    {estimate.estimatedEndTime || "---"}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-black/40 py-4 relative z-10 border-t border-white/5">
                        <p className="text-xs text-zinc-400 font-medium">
                            Assuming standard successful deliveries. Calendar length: <strong className="text-zinc-200">{estimate.totalCalendarDaysScheduled} days total</strong>.
                        </p>
                    </CardFooter>
                </Card>
            </div>

            <div className="col-span-1 lg:col-span-2 flex items-center justify-start pt-4 border-t mt-4">
                <Button variant="ghost" size="lg" onClick={onBack} disabled={isInstantSubmitting || isScheduleSubmitting} className="font-medium">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
            </div>
        </div>
    );
}
