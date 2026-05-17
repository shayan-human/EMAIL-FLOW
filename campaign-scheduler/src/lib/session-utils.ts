import { toast } from "@/components/ui/toast-provider";
import { signOut } from "next-auth/react";

const AUTH_KEYS = [
    'sb-access-token',
    'sb-refresh-token',
    'auth-token',
    'session',
    'user',
];

export async function handleSessionExpired(): Promise<void> {
    localStorage.clear();
    sessionStorage.clear();

    AUTH_KEYS.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });

    toast.error("Your session has expired. Please sign in again.");

    window.location.href = "/auth/signin?reason=session_expired";
}

export function useSessionExpired() {
    return async function sessionExpired() {
        localStorage.clear();
        sessionStorage.clear();

        AUTH_KEYS.forEach(key => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });

        try {
            await signOut({ redirect: false });
        } catch {
        }

        toast.error("Your session has expired. Please sign in again.");

        window.location.href = "/auth/signin?reason=session_expired";
    };
}
