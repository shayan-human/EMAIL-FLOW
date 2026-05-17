import { addDays, isWeekend, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { formatInTimeZone, toDate } from 'date-fns-tz';

export function calculateTotalCapacity(accounts: number, limitPerAccount: number): number {
    return accounts * limitPerAccount;
}

export function calculateRequiredDays(totalLeads: number, totalCapacity: number): number {
    if (totalCapacity === 0) return 0;
    // Base Load Rule: Use floor to avoid triggering extra days for small remainders
    return Math.max(1, Math.floor(totalLeads / totalCapacity));
}

export function calculateAverageDelay(minDelay: number, maxDelay: number): number {
    return (minDelay + maxDelay) / 2;
}

export function checkWindowWarning(
    limitPerAccount: number,
    avgDelay: number,
    startTime: string | null | undefined,
    endTime: string | null | undefined
): boolean {
    if (!startTime || !endTime) return false;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    if (isNaN(startH) || isNaN(endH)) return false;

    const windowMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    const expectedDuration = limitPerAccount * avgDelay;

    return expectedDuration > windowMinutes;
}

export interface EstimationResult {
    estimatedEndDate: string;
    estimatedEndTime: string;
    totalCalendarDaysScheduled: number;
}

export function estimateCompletionTime(
    totalLeads: number,
    totalCapacity: number,
    avgDelay: number,
    startTime: string | null | undefined,
    endTime: string | null | undefined,
    timezone: string | null | undefined,
    skipWeekends: boolean,
    startDateArg: string,
    enableSchedule: boolean
): EstimationResult {
    const requiredDays = calculateRequiredDays(totalLeads, totalCapacity);
    if (requiredDays <= 0 || !timezone || !startDateArg) {
        return { estimatedEndDate: "", estimatedEndTime: "", totalCalendarDaysScheduled: 0 };
    }

    // If schedule is disabled, we don't have startTime/endTime but we still need to estimate.
    // We treat it as 24/7 sending for estimation purposes.
    const effectiveStartTime = (enableSchedule && startTime) ? startTime : "00:00";
    const effectiveTimezone = timezone || "Asia/Kolkata";

    try {
        const [startH, startM] = effectiveStartTime.split(':').map(Number);

        // Start strictly timezone-aware calculation 
        const baseDate = new Date(startDateArg + "T00:00:00");
        const tzDateString = formatInTimeZone(baseDate, effectiveTimezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
        let currentDate = toDate(tzDateString);

        // Set to start time on the very first day
        currentDate = setHours(currentDate, startH);
        currentDate = setMinutes(currentDate, startM);
        currentDate = setSeconds(currentDate, 0);
        currentDate = setMilliseconds(currentDate, 0);

        // If starting on a weekend when skip weeked is ON, shift to Monday.
        if (skipWeekends && isWeekend(currentDate)) {
            while (isWeekend(currentDate)) {
                currentDate = addDays(currentDate, 1);
            }
        }

        let daysRemaining = requiredDays;
        let totalCalendarDaysScheduled = 0;

        // Day 1
        daysRemaining -= 1;
        totalCalendarDaysScheduled += 1;

        // Subsequent Days
        while (daysRemaining > 0) {
            currentDate = addDays(currentDate, 1);

            if (skipWeekends && isWeekend(currentDate)) {
                totalCalendarDaysScheduled += 1;
                continue;
            }

            daysRemaining -= 1;
            totalCalendarDaysScheduled += 1;
        }

        // Calculate exact time on the final day
        // On the final day, we send the "base" capacity PLUS any accumulated remainder
        const daysToProcessBeforeFinal = requiredDays - 1;
        const leadsOnFinalDay = totalLeads - (daysToProcessBeforeFinal * totalCapacity);
        const minutesOnFinalDay = leadsOnFinalDay * avgDelay;

        // Add those minutes to the start time of the final day
        currentDate = setMinutes(currentDate, startM + minutesOnFinalDay);

        return {
            estimatedEndDate: formatInTimeZone(currentDate, effectiveTimezone, 'MMM dd, yyyy'),
            estimatedEndTime: formatInTimeZone(currentDate, effectiveTimezone, 'hh:mm a zzz'),
            totalCalendarDaysScheduled
        };
    } catch {
        return { estimatedEndDate: "Error", estimatedEndTime: "", totalCalendarDaysScheduled: 0 };
    }
}
