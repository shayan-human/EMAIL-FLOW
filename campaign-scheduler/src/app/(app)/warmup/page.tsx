import { auth } from "@/lib/auth-helper";
import { pool } from "@/lib/db";
import WarmupClient from "./WarmupClient";
import { redirect } from "next/navigation";

export default async function WarmupPage() {
    const { user } = await auth();

    if (!user) {
        redirect("/");
    }

    // Fetch sender accounts (connected Gmail accounts)
    const senderAccountsResult = await pool.query(
        "SELECT id, email, name FROM sender_accounts WHERE user_id = $1 AND is_active = true",
        [user.id]
    );
    const senderAccounts = senderAccountsResult.rows;

    // Fetch warmup accounts
    const warmupAccountsResult = await pool.query(
        "SELECT * FROM warmup_accounts WHERE user_id = $1",
        [user.id]
    );
    const warmupAccounts = warmupAccountsResult.rows;

    // Fetch network opt-in status
    const settingsResult = await pool.query(
        "SELECT network_opt_in FROM user_settings WHERE user_id = $1 LIMIT 1",
        [user.id]
    );
    const userSettings = settingsResult.rows[0];

    const networkOptIn = userSettings?.network_opt_in || false;

    // Format warmup accounts
    const formattedWarmupAccounts = (warmupAccounts || []).map((wa: any) => ({
        id: wa.id,
        gmail_account_id: wa.gmail_account_id,
        gmail_email: "",
        status: wa.status,
        mode: wa.mode,
        day_number: wa.day_number,
        daily_target: wa.daily_target,
    }));

    // Map emails to warmup accounts
    const accountsWithEmails = (senderAccounts || []).map((sa: any) => {
        const wa = formattedWarmupAccounts.find(
            (w: any) => w.gmail_account_id === sa.id
        );
        return {
            id: wa?.id || "",
            gmail_account_id: sa.id,
            gmail_email: sa.email,
            status: wa?.status || "inactive",
            mode: wa?.mode || "own_only",
            day_number: wa?.day_number || 0,
            daily_target: wa?.daily_target || 0,
        };
    });

    return (
        <WarmupClient
            senderAccounts={senderAccounts || []}
            networkOptIn={networkOptIn}
        />
    );
}
